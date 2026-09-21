import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@modules/queue/queue.service';
import { EmailService } from './email.service';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<void> {
    this.logger.log(`Processing email job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case 'auth.email-verification':
          await this.emailService.sendVerificationEmail(
            job.data.email as string,
            job.data.token as string,
            (job.data.firstName as string) || 'User',
          );
          break;

        case 'auth.password-reset':
          await this.emailService.sendPasswordResetEmail(
            job.data.email as string,
            job.data.token as string,
            (job.data.firstName as string) || 'User',
          );
          break;

        case 'organization.invitation':
          await this.emailService.sendInvitationEmail(
            job.data.email as string,
            job.data.token as string,
            (job.data.inviterName as string) || 'A team member',
            (job.data.companyName as string) || 'the organization',
          );
          break;

        case 'recruitment.application-received':
          await this.emailService.sendApplicationReceivedEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.companyName as string,
          );
          break;

        case 'recruitment.application-stage-changed':
          await this.emailService.sendApplicationStageChangedEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.stage as string,
            job.data.companyName as string,
          );
          break;

        case 'recruitment.interview-scheduled':
          await this.emailService.sendInterviewScheduledEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            (job.data.interviewType as string) || '',
            job.data.scheduledAt as string,
            (job.data.timezone as string) || '',
            (job.data.durationMinutes as number) || 60,
            job.data.location as string | undefined,
            (job.data.interviewerNames as string[]) || [],
            job.data.instructions as string | undefined,
          );
          break;

        case 'recruitment.interview-rescheduled':
          await this.emailService.sendInterviewRescheduledEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.scheduledAt as string,
            (job.data.timezone as string) || '',
            job.data.reason as string | undefined,
          );
          break;

        case 'recruitment.interview-cancelled':
          await this.emailService.sendInterviewCancelledEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.reason as string | undefined,
          );
          break;

        case 'recruitment.interview-completed':
          await this.emailService.sendInterviewCompletedEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
          );
          break;

        case 'recruitment.interview-reminder':
          await this.emailService.sendInterviewReminderEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.scheduledAt as string,
            (job.data.timezone as string) || '',
            (job.data.minutesUntilInterview as number) || 30,
            job.data.location as string | undefined,
          );
          break;

        case 'recruitment.ai-interview-invitation':
          await this.emailService.sendAiInterviewInvitationEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.companyName as string,
            job.data.interviewLink as string,
            job.data.interviewCode as string,
            (job.data.durationMinutes as number) || 5,
            job.data.expiresAt ? new Date(job.data.expiresAt as string) : null,
            job.data.recruiterNote as string | undefined,
          );
          break;

        case 'recruitment.offer-sent':
          await this.emailService.sendOfferSentEmail(
            job.data.email as string,
            job.data.candidateName as string,
            job.data.jobTitle as string,
            job.data.companyName as string,
            (job.data.offerUrl as string) || '',
          );
          break;

        default:
          this.logger.warn(`Unknown email job type: ${job.name}`);
      }

      this.logger.log(`Email job completed: ${job.name} (${job.id})`);
    } catch (error) {
      this.logger.error(`Email job failed: ${job.name} (${job.id}): ${error}`);
      throw error;
    }
  }
}
