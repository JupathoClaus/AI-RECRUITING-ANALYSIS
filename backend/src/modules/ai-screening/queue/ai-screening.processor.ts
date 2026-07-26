import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AI_SCREENING_QUEUE } from './ai-screening-queue.constants';
import { AiScreeningJobData } from './ai-screening-job-data.interface';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { AiScreeningProvider } from '../providers/ai-screening-provider.interface';
import { ScreeningInputBuilderService, ResumeTextData } from '../services/screening-input-builder.service';
import { computeScreeningFingerprint } from '../utils/screening-input-fingerprint';
import {
  AiScreeningProviderError,
} from '../providers/ai-screening-provider.errors';
import { ScreeningInput } from '../domain/screening-input.type';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

@Processor(AI_SCREENING_QUEUE, {
  concurrency: 3,
})
export class AiScreeningProcessor extends WorkerHost {
  private readonly logger = new Logger(AiScreeningProcessor.name);
  private readonly promptVersion: string;
  private readonly schemaVersion: string;
  private readonly uploadDir: string;
  private readonly resumeTextParserSuffix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: ScreeningInputBuilderService,
    @Inject(AI_SCREENING_PROVIDER) private readonly provider: AiScreeningProvider,
    configService: ConfigService,
  ) {
    super();
    const concurrency = parseInt(
      configService.get<string>('aiScreening.workerConcurrency') || '3',
      10,
    );
    if (isNaN(concurrency) || concurrency < 1 || concurrency > 20) {
      throw new Error('AI_SCREENING_WORKER_CONCURRENCY must be between 1 and 20');
    }
    this.promptVersion = configService.get<string>('aiScreening.promptVersion') || 'v1';
    this.schemaVersion = configService.get<string>('aiScreening.schemaVersion') || 'v1';
    this.uploadDir = configService.get<string>('app.uploadDir') || './uploads';
    this.resumeTextParserSuffix = configService.get<string>('app.resumeTextParserSuffix') || '_parsed.txt';
  }

  async process(job: Job<AiScreeningJobData>): Promise<void> {
    const { screeningId, applicationId, companyId, inputFingerprint } = job.data;

    if (!screeningId || !applicationId || !companyId) {
      throw new UnrecoverableError('Invalid job payload: missing required identifiers');
    }

    const screening = await this.prisma.aiScreeningResult.findUnique({
      where: { id: screeningId },
    });

    if (!screening) {
      throw new UnrecoverableError(`Screening record ${screeningId} not found`);
    }

    if (screening.applicationId !== applicationId || screening.companyId !== companyId) {
      throw new UnrecoverableError('Screening record does not match job identifiers');
    }

    if (screening.status === 'COMPLETED') {
      this.logger.warn(`Screening ${screeningId} already completed, skipping`);
      return;
    }

    if (screening.status === 'RUNNING') {
      throw new UnrecoverableError(`Screening ${screeningId} is already RUNNING by another worker`);
    }

    await this.prisma.aiScreeningResult.update({
      where: { id: screeningId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    let screeningInput: ScreeningInput;
    try {
      const application = await this.prisma.application.findFirst({
        where: { id: applicationId, companyId, deletedAt: null },
        include: {
          job: {
            include: {
              skills: { include: { skill: true } },
              screeningQuestions: { where: { deletedAt: null } },
            },
          },
          candidate: { select: { id: true } },
          screeningAnswers: {
            include: { question: { select: { question: true, required: true } } },
          },
          resumeFiles: {
            where: { category: 'RESUME', status: 'ACTIVE', deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, checksumSha256: true, updatedAt: true, storageKey: true },
          },
        },
      });

      if (!application) {
        throw new UnrecoverableError('Application not found or deleted');
      }

      const job = application.job;
      const resumeFile = application.resumeFiles[0];
      if (!resumeFile) {
        throw new UnrecoverableError('No resume file available');
      }

      const resumeText = await this.loadResumeText(resumeFile.storageKey);
      if (!resumeText || resumeText.parsedText.trim().length < 10) {
        throw new UnrecoverableError('Resume has no parsed text');
      }

      screeningInput = this.inputBuilder.build(
        application as never,
        resumeText,
        this.promptVersion,
      );

      const currentFingerprint = computeScreeningFingerprint({
        applicationId,
        input: screeningInput,
        jobUpdatedAt: job.updatedAt.toISOString(),
        resumeChecksumSha256: resumeFile.checksumSha256,
        resumeUpdatedAt: resumeFile.updatedAt.toISOString(),
        provider: screening.provider ?? this.provider.providerName,
        model: screening.model ?? '',
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
      });

      if (currentFingerprint !== inputFingerprint) {
        await this.prisma.aiScreeningResult.update({
          where: { id: screeningId },
          data: {
            status: 'FAILED',
            failureCode: 'STALE_FINGERPRINT',
            failureMessageSafe: 'Source data changed since screening was requested. Please re-request.',
            completedAt: new Date(),
          },
        });
        return;
      }
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        await this.failPermanent(screeningId, err.message);
        throw err;
      }
      throw err;
    }

    let result;
    try {
      result = await this.provider.screen(screeningInput);
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        await this.failPermanent(screeningId, err.message);
        throw err;
      }

      if (err instanceof AiScreeningProviderError) {
        if (!err.retryable) {
          await this.failPermanent(screeningId, err.safeMessage, err.safeCode);
          throw new UnrecoverableError(err.safeMessage);
        }
        this.logger.warn(`Retryable provider error for screening ${screeningId}: ${err.message}`);
        throw err;
      }

      this.logger.error(`Unexpected provider error for screening ${screeningId}: ${(err as Error).message}`);
      throw err;
    }

    try {
      await this.prisma.aiScreeningResult.update({
        where: { id: screeningId },
        data: {
          status: 'COMPLETED',
          overallScore: result.overallScore,
          recommendation: result.recommendation,
          confidence: result.confidence,
          matchedQualifications: result.matchedQualifications.length > 0 ? result.matchedQualifications : undefined,
          missingQualifications: result.missingQualifications.length > 0 ? result.missingQualifications : undefined,
          evidence: result.evidence.length > 0 ? result.evidence as never : undefined,
          criteriaScores: result.criteriaScores.length > 0 ? result.criteriaScores as never : undefined,
          uncertainties: result.uncertainties.length > 0 ? result.uncertainties : undefined,
          riskFlags: result.riskFlags.length > 0 ? result.riskFlags : undefined,
          explanation: result.explanation,
          prohibitedReasoningDetected: result.prohibitedReasoningDetected,
          provider: result.providerMetadata?.provider ?? this.provider.providerName,
          model: result.providerMetadata?.model,
          promptVersion: result.providerMetadata?.promptVersion ?? this.promptVersion,
          providerResponseId: result.providerMetadata?.responseId,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to persist screening result ${screeningId}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async failPermanent(screeningId: string, messageSafe: string, failureCode = 'PROCESSING_ERROR'): Promise<void> {
    try {
      await this.prisma.aiScreeningResult.update({
        where: { id: screeningId },
        data: {
          status: 'FAILED',
          failureCode,
          failureMessageSafe: messageSafe,
          completedAt: new Date(),
        },
      });
    } catch (updateErr) {
      this.logger.error(`Failed to mark screening ${screeningId} as FAILED: ${(updateErr as Error).message}`);
    }
  }

  private async loadResumeText(storageKey: string): Promise<ResumeTextData | null> {
    const parsedPath = resolve(this.uploadDir, `${storageKey}${this.resumeTextParserSuffix}`);
    try {
      const parsedText = await readFile(parsedPath, 'utf-8');
      return { parsedText, checksumSha256: '' };
    } catch {
      return null;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<AiScreeningJobData>): void {
    this.logger.log(`Screening job ${job.id} completed for application ${job.data.applicationId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AiScreeningJobData>, error: Error): void {
    this.logger.error(
      `Screening job ${job.id} failed for application ${job.data.applicationId}: ${error.message}`,
    );
  }
}
