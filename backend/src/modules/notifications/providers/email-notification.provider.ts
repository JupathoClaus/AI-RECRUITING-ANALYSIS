import { Injectable } from '@nestjs/common';
import { EmailService } from '@modules/email/email.service';
import {
  NotificationProvider,
  EmailMessage,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  constructor(private readonly emailService: EmailService) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    const { to, subject, templateId, templateData, replyTo, cc } = message;
    const recipient = Array.isArray(to) ? to[0] : to;

    switch (templateId) {
      case 'application-received':
        await this.emailService.sendApplicationReceivedEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.companyName as string,
        );
        break;

      case 'application-status-changed':
        await this.emailService.sendApplicationStageChangedEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.stage as string,
          templateData.companyName as string,
        );
        break;

      case 'interview-scheduled':
        await this.emailService.sendInterviewScheduledEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          (templateData.interviewType as string) || '',
          templateData.scheduledAt as string,
          (templateData.timezone as string) || '',
          (templateData.durationMinutes as number) || 60,
          templateData.location as string | undefined,
          (templateData.interviewerNames as string[]) || [],
          templateData.instructions as string | undefined,
        );
        break;

      case 'interview-rescheduled':
        await this.emailService.sendInterviewRescheduledEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.scheduledAt as string,
          (templateData.timezone as string) || '',
          templateData.reason as string | undefined,
        );
        break;

      case 'interview-cancelled':
        await this.emailService.sendInterviewCancelledEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.reason as string | undefined,
        );
        break;

      case 'interview-completed':
        await this.emailService.sendInterviewCompletedEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
        );
        break;

      case 'interview-reminder':
        await this.emailService.sendInterviewReminderEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.scheduledAt as string,
          (templateData.timezone as string) || '',
          (templateData.minutesUntilInterview as number) || 30,
          templateData.location as string | undefined,
        );
        break;

      case 'offer-sent':
        await this.emailService.sendOfferSentEmail(
          recipient,
          templateData.candidateName as string,
          templateData.jobTitle as string,
          templateData.companyName as string,
          (templateData.offerUrl as string) || '',
        );
        break;

      default:
        break;
    }
  }

  async sendSms?(): Promise<void> {
    // Not implemented
  }

  async sendPush?(): Promise<void> {
    // Not implemented
  }
}
