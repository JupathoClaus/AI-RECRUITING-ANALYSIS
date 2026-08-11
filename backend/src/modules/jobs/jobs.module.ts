import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { OrganizationModule } from '@modules/organization/organization.module';
import { JobsController } from './jobs.controller';
import { PublicJobsController } from './public-jobs.controller';
import { JobsService } from './jobs.service';
import { JobWorkflowService } from './job-workflow.service';
import { JobCodeService } from './job-code.service';
import { JobActivityService } from './job-activity.service';
import { ScreeningEthicsValidator } from './validators/screening-ethics.validator';

@Module({
  imports: [DatabaseModule, OrganizationModule],
  controllers: [JobsController, PublicJobsController],
  providers: [
    JobsService,
    JobWorkflowService,
    JobCodeService,
    JobActivityService,
    ScreeningEthicsValidator,
  ],
  exports: [
    JobsService,
    JobWorkflowService,
    JobCodeService,
    JobActivityService,
    ScreeningEthicsValidator,
  ],
})
export class JobsModule {}
