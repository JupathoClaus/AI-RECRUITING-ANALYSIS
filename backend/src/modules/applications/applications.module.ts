import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '@modules/files/storage.module';
import { ApplicationsController } from './controllers/applications.controller';
import { CandidateTagsController } from './controllers/candidate-tags.controller';
import { PublicApplicationsController } from './controllers/public-applications.controller';
import { ApplicationsService } from './services/applications.service';
import { ApplicationNumberService } from './services/application-number.service';
import { ApplicationAuditService } from './services/application-audit.service';
import { ApplicationWorkflowService } from './services/application-workflow.service';
import { CompanyCandidateService } from './services/company-candidate.service';
import { CandidateTagsService } from './services/candidate-tags.service';
import { ApplicationNotesService } from './services/application-notes.service';
import { ApplicationFlagsService } from './services/application-flags.service';
import { ApplicationDecisionsService } from './services/application-decisions.service';
import { ApplicationAssignmentsService } from './services/application-assignments.service';
import { ScreeningAnswersService } from './services/screening-answers.service';
import { PublicApplicationSubmissionService } from './services/public-application-submission.service';

@Module({
  imports: [DatabaseModule, NotificationsModule, StorageModule],
  controllers: [ApplicationsController, CandidateTagsController, PublicApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationNumberService,
    ApplicationAuditService,
    ApplicationWorkflowService,
    CompanyCandidateService,
    CandidateTagsService,
    ApplicationNotesService,
    ApplicationFlagsService,
    ApplicationDecisionsService,
    ApplicationAssignmentsService,
    ScreeningAnswersService,
    PublicApplicationSubmissionService,
  ],
  exports: [
    ApplicationsService,
    ApplicationAuditService,
    ApplicationWorkflowService,
    CompanyCandidateService,
    CandidateTagsService,
    ApplicationNumberService,
    ApplicationNotesService,
  ],
})
export class ApplicationsModule {}
