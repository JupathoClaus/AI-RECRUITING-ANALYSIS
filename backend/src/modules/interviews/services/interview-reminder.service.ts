/**
 * InterviewReminderService
 *
 * Manages scheduled BullMQ reminder jobs for interviews.
 *
 * Reminder offsets: 24h, 2h, 15min before interview.
 * Jobs are deterministic IDs: interview:{id}:24h | :2h | :15m
 * Idempotent: safe to call multiple times.
 * Cancellation removes all pending reminder jobs.
 * Reschedule = cancel old + schedule new.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const REMINDER_OFFSETS: Array<{ minutes: number; suffix: string }> = [
  { minutes: 24 * 60, suffix: '24h' },
  { minutes: 120, suffix: '2h' },
  { minutes: 15, suffix: '15m' },
];

@Injectable()
export class InterviewReminderService {
  private readonly logger = new Logger(InterviewReminderService.name);

  constructor(@InjectQueue('interview-reminder') private readonly reminderQueue: Queue) {}

  /**
   * Schedule all reminder jobs for an interview.
   * Skips any offset that is already in the past.
   * Each job has a deterministic ID to prevent duplicates.
   */
  async scheduleReminders(params: {
    interviewId: string;
    scheduledAt: Date;
    recipientEmail?: string;
    recipientName?: string;
    jobTitle?: string;
    companyName?: string;
    timezone: string;
  }): Promise<void> {
    const now = new Date();

    for (const { minutes, suffix } of REMINDER_OFFSETS) {
      const fireAt = new Date(params.scheduledAt.getTime() - minutes * 60_000);
      const delayMs = fireAt.getTime() - now.getTime();

      if (delayMs <= 0) {
        this.logger.debug(
          `Skipping ${suffix} reminder for interview ${params.interviewId} — already past`,
        );
        continue;
      }

      const jobId = `interview:${params.interviewId}:${suffix}`;

      try {
        // Remove existing job with same ID to prevent duplicates (idempotent)
        await this.reminderQueue.remove(jobId);

        await this.reminderQueue.add(
          'interview.reminder',
          {
            interviewId: params.interviewId,
            minutesUntilInterview: minutes,
            recipientEmail: params.recipientEmail ?? '',
            recipientName: params.recipientName ?? '',
            jobTitle: params.jobTitle ?? '',
            companyName: params.companyName ?? '',
            timezone: params.timezone,
            scheduledAt: params.scheduledAt.toISOString(),
          },
          {
            jobId,
            delay: delayMs,
            removeOnComplete: true,
            removeOnFail: { count: 3 },
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        this.logger.debug(
          `Reminder scheduled: ${jobId} fires in ${Math.round(delayMs / 60000)}min`,
        );
      } catch (err) {
        // Non-fatal — reminder failure must not block interview creation
        this.logger.warn(`Failed to schedule reminder ${jobId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Cancel all pending reminder jobs for an interview.
   * Called when interview is cancelled or deleted.
   */
  async cancelReminders(interviewId: string): Promise<void> {
    for (const { suffix } of REMINDER_OFFSETS) {
      const jobId = `interview:${interviewId}:${suffix}`;
      try {
        await this.reminderQueue.remove(jobId);
        this.logger.debug(`Cancelled reminder: ${jobId}`);
      } catch {
        /* job may not exist — non-fatal */
      }
    }
  }

  /**
   * Reschedule: cancel existing reminders and create new ones.
   */
  async rescheduleReminders(
    params: Parameters<InterviewReminderService['scheduleReminders']>[0],
  ): Promise<void> {
    await this.cancelReminders(params.interviewId);
    await this.scheduleReminders(params);
  }
}
