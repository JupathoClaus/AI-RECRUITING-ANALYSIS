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
