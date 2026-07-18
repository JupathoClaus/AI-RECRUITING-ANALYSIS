import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from '@modules/queue/queue.service';
import { INTERVIEW_TEMPLATES, InterviewScheduledData } from '../templates/interview.templates';

export interface InterviewNotificationPayload {
  interviewId: string;
  companyId: string;
  applicationId: string;
  type: 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'REMINDER';
  recipientEmail?: string;
  recipientName?: string;
  scheduledAt?: string;
  jobTitle?: string;
  companyName?: string;
  interviewType?: string;
  timezone?: string;
  durationMinutes?: number;
  location?: string;
  meetingProvider?: string;
  instructions?: string;
  interviewerNames?: string[];
  minutesUntilInterview?: number;
  reason?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly queueService: QueueService) {}

  async scheduleInterviewNotification(payload: InterviewNotificationPayload): Promise<void> {
    try {
      await this.queueService.addInterviewNotificationJob(
        'interview.notification',
        payload as unknown as Record<string, unknown>,
      );
      this.logger.debug(
        `Interview notification queued: ${payload.type} for interview ${payload.interviewId}`,
      );
    } catch (err) {
      // Non-fatal: notification failure must not block interview workflow
      this.logger.warn(`Failed to queue interview notification: ${(err as Error).message}`);
    }
  }
}
