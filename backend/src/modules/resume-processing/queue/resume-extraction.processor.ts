import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { ResumeFileReaderService } from '../services/resume-file-reader.service';
import { ResumeTextExtractorService } from '../services/resume-text-extractor.service';
import {
  RESUME_EXTRACTION_QUEUE,
  RESUME_EXTRACTION_JOB,
} from './resume-extraction-queue.constants';
import { ResumeExtractionJobData } from './resume-extraction-job-data.interface';

@Processor(RESUME_EXTRACTION_QUEUE, { concurrency: 2 })
export class ResumeExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileReader: ResumeFileReaderService,
    private readonly extractor: ResumeTextExtractorService,
    _configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ResumeExtractionJobData>): Promise<void> {
    const { extractionId, storedFileId, companyId } = job.data;

    if (!extractionId || !storedFileId || !companyId) {
      throw new UnrecoverableError('Invalid job payload: missing required identifiers');
    }

    if (job.name !== RESUME_EXTRACTION_JOB) {
      throw new UnrecoverableError(`Unexpected job name: ${job.name}`);
    }

    const extraction = await this.prisma.resumeTextExtraction.findUnique({
      where: { id: extractionId },
    });

    if (!extraction) {
      throw new UnrecoverableError(`Extraction record ${extractionId} not found`);
    }

    if (extraction.storedFileId !== storedFileId || extraction.companyId !== companyId) {
      throw new UnrecoverableError('Extraction record does not match job identifiers');
    }

    if (extraction.status === 'COMPLETED') {
      this.logger.warn(`Extraction ${extractionId} already completed, skipping`);
      return;
    }

    if (extraction.status === 'FAILED' && extraction.completedAt) {
      this.logger.warn(`Extraction ${extractionId} already terminally failed, skipping`);
      return;
    }

    if (extraction.status === 'PROCESSING') {
      const isSameJob = job.id === extractionId;
      if (!isSameJob) {
        throw new UnrecoverableError(
          `Extraction ${extractionId} is already PROCESSING by another worker`,
        );
      }
      if (job.attemptsMade === 0) {
        // A reconciled re-enqueue of the same generation: the previous owner
        // failed (its job was removed before re-adding). Reopen the attempt so
        // the freshly enqueued job can claim it. jobId uniqueness guarantees
        // only this job can hold the generation now.
        await this.prisma.resumeTextExtraction.updateMany({
          where: { id: extractionId, status: 'PROCESSING' },
          data: { status: 'PENDING', startedAt: null },
        });
      }
    }

    if (extraction.status === 'PENDING') {
      const update = await this.prisma.resumeTextExtraction.updateMany({
        where: { id: extractionId, status: 'PENDING' },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });
      if (update.count === 0) {
        throw new UnrecoverableError(`Extraction ${extractionId} was claimed by another worker`);
      }
    }

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;
    let fileData: {
      buffer: Buffer;
      mimeType: string;
      originalName: string;
      checksumSha256: string;
      sizeBytes: number;
    };

    try {
      fileData = await this.fileReader.readStoredFile(storedFileId, companyId);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      if (isLastAttempt) {
        await this.failTerminal(
          extractionId,
          'STORAGE_READ_FAILED',
          'Failed to read the stored resume file.',
        );
        throw new UnrecoverableError((err as Error).message);
      }
      throw err;
    }

    let result: import('../services/resume-text-extractor.service').ResumeExtractionOutput;
    try {
      result = await this.extractor.extract({
        buffer: fileData.buffer,
        mimeType: fileData.mimeType,
        originalName: fileData.originalName,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isPermanent = [
        'ENCRYPTED_PDF',
        'INVALID_PDF',
        'CORRUPT_DOCX',
        'UNSUPPORTED_MIME_TYPE',
        'EMPTY_EXTRACTION',
      ].some((c) => errMsg.startsWith(c));

      if (isPermanent) {
        await this.failTerminal(extractionId, errMsg);
        throw new UnrecoverableError(errMsg);
      }

      if (isLastAttempt) {
        await this.failTerminal(extractionId, 'EXTRACTION_FAILED', errMsg);
        throw new UnrecoverableError(errMsg);
      }

      throw err;
    }

    try {
      const updateResult = await this.prisma.resumeTextExtraction.updateMany({
        where: { id: extractionId, status: 'PROCESSING' },
        data: {
          status: 'COMPLETED',
          extractedText: result.text,
          extractedTextSha256: result.textSha256,
          parserName: result.parserName,
          parserVersion: result.parserVersion,
          completedAt: new Date(),
        },
      });
      if (updateResult.count === 0) {
        const reRead = await this.prisma.resumeTextExtraction.findUnique({
          where: { id: extractionId },
          select: { status: true },
        });
        if (!reRead) {
          throw new UnrecoverableError(`Extraction record ${extractionId} was deleted`);
        }
        if (reRead.status === 'COMPLETED') {
          this.logger.warn(`Extraction ${extractionId} already COMPLETED, skipping`);
          return;
        }
        if (reRead.status === 'FAILED') {
          throw new UnrecoverableError(
            `Extraction ${extractionId} was marked FAILED by another worker`,
          );
        }
        throw new Error(
          `PERSIST_FAILED: extraction ${extractionId} status=${reRead.status} update returned 0 rows`,
        );
      }
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      if (isLastAttempt) {
        await this.failTerminal(
          extractionId,
          'PERSIST_FAILED',
          'Failed to save extraction result.',
        );
        throw new UnrecoverableError((err as Error).message);
      }
      this.logger.error(`Failed to persist extraction result: ${(err as Error).message}`);
      throw err;
    }
  }

  private async failTerminal(
    extractionId: string,
    failureCode: string,
    failureMessageSafe?: string,
  ): Promise<void> {
    try {
      await this.prisma.resumeTextExtraction.updateMany({
        where: { id: extractionId },
        data: {
          status: 'FAILED',
          failureCode,
          failureMessageSafe: failureMessageSafe ?? failureCode,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark extraction ${extractionId} as FAILED: ${(err as Error).message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ResumeExtractionJobData>): void {
    this.logger.log(`Extraction job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ResumeExtractionJobData>, error: Error): void {
    this.logger.error(`Extraction job ${job.id} failed: ${error.message}`);
  }
}
