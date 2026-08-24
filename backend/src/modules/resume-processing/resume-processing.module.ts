import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@database/database.module';
import { FilesModule } from '../files/files.module';
import { ResumeFileReaderService } from './services/resume-file-reader.service';
import { ResumeTextExtractorService } from './services/resume-text-extractor.service';
import { ResumeExtractionService } from './services/resume-extraction.service';
import { ExtractionDispatchReconcilerService } from './services/extraction-dispatch-reconciler.service';
import { ExtractionDispatchReconcilerScheduler } from './services/extraction-dispatch-reconciler-scheduler.service';
import { ResumeExtractionProcessor } from './queue/resume-extraction.processor';
import { RESUME_EXTRACTION_QUEUE } from './queue/resume-extraction-queue.constants';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    FilesModule,
    BullModule.registerQueue({ name: RESUME_EXTRACTION_QUEUE }),
  ],
  providers: [
    ResumeFileReaderService,
    ResumeTextExtractorService,
    ResumeExtractionService,
    ExtractionDispatchReconcilerService,
    ExtractionDispatchReconcilerScheduler,
    ResumeExtractionProcessor,
  ],
  exports: [
    ResumeTextExtractorService,
    ResumeFileReaderService,
    ResumeExtractionService,
    ExtractionDispatchReconcilerService,
  ],
})
export class ResumeProcessingModule {}
