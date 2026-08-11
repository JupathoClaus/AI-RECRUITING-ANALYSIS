import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { JobPublicationsController } from './job-publications.controller';
import { JobPublicationsService } from './job-publications.service';
import { CompanyCareersPageAdapter } from './adapters/company-careers-page.adapter';
import { CustomWebhookAdapter } from './adapters/custom-webhook.adapter';
import { AdapterRegistry } from './adapters/adapter-registry';

@Module({
  imports: [DatabaseModule],
  controllers: [JobPublicationsController],
  providers: [
    JobPublicationsService,
    CompanyCareersPageAdapter,
    CustomWebhookAdapter,
    AdapterRegistry,
  ],
  exports: [JobPublicationsService],
})
export class JobPublicationsModule {}
