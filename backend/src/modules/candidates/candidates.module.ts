import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { CandidatesController } from './candidates.controller';
import { RecruiterCandidateWorkflowController } from './recruiter-candidate-workflow.controller';
import { CandidatesService } from './candidates.service';
import { CandidateProfileService } from './candidate-profile.service';
import { CandidateAuditService } from './candidate-audit.service';
import { CandidateDeduplicationService } from './candidate-deduplication.service';
import { CandidateMergeService } from './candidate-merge.service';
import { RecruiterCandidateWorkflowService } from './recruiter-candidate-workflow.service';
import { ApplicationsModule } from '@modules/applications/applications.module';
import { FilesModule } from '@modules/files/files.module';
import { ResumeProcessingModule } from '@modules/resume-processing/resume-processing.module';

@Module({
  imports: [DatabaseModule, ApplicationsModule, FilesModule, ResumeProcessingModule],
  controllers: [CandidatesController, RecruiterCandidateWorkflowController],
  providers: [
    CandidatesService,
    CandidateProfileService,
    CandidateAuditService,
    CandidateDeduplicationService,
    CandidateMergeService,
    RecruiterCandidateWorkflowService,
  ],
  exports: [CandidatesService, CandidateProfileService, CandidateAuditService],
})
export class CandidatesModule {}
