/**
 * InterviewReminderWorker
 *
 * Processes delayed reminder jobs from the 'interview-reminder' queue.
 * One worker owns one queue — no overlapping consumers.
 */
import { Injectable, Logger, OnApplicationShutdown, Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  NotificationProvider,
  NOTIFICATION_PROVIDER,
} from '@modules/notifications/interfaces/notification-provider.interface';

@Processor('interview-reminder')
@Injectable()
export class InterviewReminderWorker extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(InterviewReminderWorker.name);

  constructor(@Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { data } = job;
    this.logger.debug(
      `[interview-reminder] Processing reminder for interview ${data.interviewId} (-${data.minutesUntilInterview}min)`,
    );

    try {
      await this.provider.sendEmail({
        to: data.recipientEmail ?? '',
        subject: `Reminder: Your interview is in ${data.minutesUntilInterview} minutes`,
        templateId: 'interview-reminder',
        templateData: data as Record<string, unknown>,
      });
      this.logger.log(
        `[Mock] Reminder sent: interview ${data.interviewId} at -${data.minutesUntilInterview}min`,
      );
    } catch (err) {
      this.logger.error(`Reminder failed: ${(err as Error).message}`);
      throw err; // Let BullMQ retry
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.worker?.close();
      this.logger.log('InterviewReminderWorker closed');
    } catch {
      /* ignore */
    }
  }
}
