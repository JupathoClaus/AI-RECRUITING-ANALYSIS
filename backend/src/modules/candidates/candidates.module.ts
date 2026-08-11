import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { CandidateProfileService } from './candidate-profile.service';
import { CandidateAuditService } from './candidate-audit.service';
import { CandidateDeduplicationService } from './candidate-deduplication.service';
import { CandidateMergeService } from './candidate-merge.service';
import { ApplicationsModule } from '@modules/applications/applications.module';

@Module({
  imports: [DatabaseModule, ApplicationsModule],
  controllers: [CandidatesController],
  providers: [
    CandidatesService,
    CandidateProfileService,
    CandidateAuditService,
    CandidateDeduplicationService,
    CandidateMergeService,
  ],
  exports: [CandidatesService, CandidateProfileService, CandidateAuditService],
})
export class CandidatesModule {}
