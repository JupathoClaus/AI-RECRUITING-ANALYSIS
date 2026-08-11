/**
 * InterviewNotificationWorker
 *
 * Processes all interview lifecycle notifications from the 'interview-notification' queue.
 * One worker owns one queue — no overlapping consumers.
 * Job name is the dispatch key:
 *   interview.scheduled | interview.rescheduled | interview.cancelled | interview.completed | interview.reminder
 */
import { Injectable, Logger, OnApplicationShutdown, Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  NotificationProvider,
  NOTIFICATION_PROVIDER,
} from '@modules/notifications/interfaces/notification-provider.interface';

@Processor('interview-notification')
@Injectable()
export class InterviewNotificationWorker extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(InterviewNotificationWorker.name);

  constructor(@Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { name, data } = job;
    this.logger.debug(`[interview-notification] Processing job: ${name} (id=${job.id})`);

    try {
      await this.provider.sendEmail({
        to: data.recipientEmail ?? 'candidate@example.com',
        subject: this.getSubject(name),
        templateId: this.getTemplateId(name),
        templateData: data as Record<string, unknown>,
      });
      this.logger.log(`[Mock] Notification sent: ${name} for interview ${data.interviewId}`);
    } catch (err) {
      this.logger.error(
        `Notification failed (${name}): ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // Let BullMQ retry
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.worker?.close();
      this.logger.log('InterviewNotificationWorker closed');
    } catch {
      /* ignore */
    }
  }

  private getSubject(name: string): string {
    switch (name) {
      case 'interview.scheduled':
        return 'Your Interview Has Been Scheduled';
      case 'interview.rescheduled':
        return 'Interview Rescheduled';
      case 'interview.cancelled':
        return 'Interview Cancelled';
      case 'interview.completed':
        return 'Interview Completed';
      case 'interview.reminder':
        return 'Interview Reminder';
      default:
        return 'Interview Update';
    }
  }

  private getTemplateId(name: string): string {
    switch (name) {
      case 'interview.scheduled':
        return 'interview-scheduled';
      case 'interview.rescheduled':
        return 'interview-rescheduled';
      case 'interview.cancelled':
        return 'interview-cancelled';
      case 'interview.completed':
        return 'interview-completed';
      case 'interview.reminder':
        return 'interview-reminder';
      default:
        return 'interview-scheduled';
    }
  }
}
