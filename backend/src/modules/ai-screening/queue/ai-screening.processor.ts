import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AI_SCREENING_QUEUE, AI_SCREENING_JOB } from './ai-screening-queue.constants';
import { AiScreeningJobData } from './ai-screening-job-data.interface';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { AiScreeningProvider } from '../providers/ai-screening-provider.interface';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { ResumeTextLoaderService } from '../services/resume-text-loader.service';
import { computeScreeningFingerprint } from '../utils/screening-input-fingerprint';
import { AiScreeningProviderError } from '../providers/ai-screening-provider.errors';
import { ScreeningInput } from '../domain/screening-input.type';

const STATIC_CONCURRENCY = 3;

@Processor(AI_SCREENING_QUEUE, { concurrency: STATIC_CONCURRENCY })
export class AiScreeningProcessor extends WorkerHost {
  private readonly logger = new Logger(AiScreeningProcessor.name);
  private readonly promptVersion: string;
  private readonly schemaVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: ScreeningInputBuilderService,
    private readonly resumeLoader: ResumeTextLoaderService,
    @Inject(AI_SCREENING_PROVIDER) private readonly provider: AiScreeningProvider,
    configService: ConfigService,
  ) {
    super();
    this.promptVersion = configService.get<string>('aiScreening.promptVersion') || 'v1';
    this.schemaVersion = configService.get<string>('aiScreening.schemaVersion') || 'v1';
  }

  async process(job: Job<AiScreeningJobData>): Promise<void> {
    const { screeningId, applicationId, companyId, inputFingerprint } = job.data;

    if (!screeningId || !applicationId || !companyId) {
      throw new UnrecoverableError('Invalid job payload: missing required identifiers');
    }

    if (job.name !== AI_SCREENING_JOB) {
      throw new UnrecoverableError(
        `Unexpected job name: ${job.name}. Expected: ${AI_SCREENING_JOB}`,
      );
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

    if (
      screening.status === 'COMPLETED' ||
      (screening.status === 'FAILED' && screening.completedAt != null)
    ) {
      this.logger.warn(`Screening ${screeningId} already ${screening.status}, skipping`);
      return;
    }

    if (screening.status === 'RUNNING') {
      const isSameJob = job.id === screeningId;
      if (!isSameJob) {
        throw new UnrecoverableError(
          `Screening ${screeningId} is already RUNNING by another worker`,
        );
      }
      if (job.attemptsMade === 0) {
        throw new UnrecoverableError(`Screening ${screeningId} is already RUNNING`);
      }
      this.logger.warn(
        `Screening ${screeningId} retry attempt ${job.attemptsMade + 1}, continuing`,
      );
    }

    if (screening.status === 'PENDING') {
      const update = await this.prisma.aiScreeningResult.updateMany({
        where: { id: screeningId, status: 'PENDING' },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      if (update.count === 0) {
        throw new UnrecoverableError(`Screening ${screeningId} was claimed by another worker`);
      }
    }

    let screeningInput: ScreeningInput;
    try {
      const application = await this.prisma.application.findFirst({
        where: { id: applicationId, companyId, deletedAt: null },
        include: {
          job: {
            include: {
              skills: { include: { skill: true } },
              screeningQuestions: { where: { deletedAt: null } },
              educationRequirements: true,
              experienceRequirements: true,
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

      const jobRecord = application.job;
      const resumeFile = application.resumeFiles[0];
      if (!resumeFile) {
        throw new UnrecoverableError('No resume file available');
      }

      const completedExtraction = await this.resumeLoader.loadCompletedExtraction(
        resumeFile.id,
        companyId,
      );
      if (!completedExtraction || completedExtraction.parsedText.trim().length < 10) {
        throw new UnrecoverableError('Resume has no completed extraction');
      }

      screeningInput = this.inputBuilder.build(
        application as never,
        completedExtraction,
        this.promptVersion,
      );

      const currentFingerprint = computeScreeningFingerprint({
        applicationId,
        input: screeningInput,
        jobUpdatedAt: jobRecord.updatedAt.toISOString(),
        resumeChecksumSha256: resumeFile.checksumSha256 ?? completedExtraction.sourceFileSha256,
        resumeUpdatedAt: resumeFile.updatedAt.toISOString(),
        provider: screening.provider ?? this.provider.providerName,
        model: screening.model ?? '',
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
      });

      if (currentFingerprint !== inputFingerprint) {
        await this.failTerminal(
          screeningId,
          'STALE_FINGERPRINT',
          'Source data changed since screening was requested. Please re-request.',
        );
        return;
      }
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        await this.failTerminal(screeningId, 'LOAD_ERROR', err.message);
        throw err;
      }
      throw err;
    }

    let result;
    try {
      result = await this.provider.screen(screeningInput);
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        await this.failTerminal(screeningId, 'FATAL_ERROR', err.message);
        throw err;
      }

      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

      if (err instanceof AiScreeningProviderError) {
        if (!err.retryable) {
          await this.failTerminal(screeningId, err.safeCode, err.safeMessage);
          throw new UnrecoverableError(err.safeMessage);
        }

        if (isLastAttempt) {
          this.logger.warn(
            `Screening ${screeningId} exhausted retries (${job.attemptsMade + 1}/${job.opts.attempts ?? 3})`,
          );
          await this.failTerminal(screeningId, err.safeCode, err.safeMessage);
          throw new UnrecoverableError(err.safeMessage);
        }

        this.logger.warn(
          `Screening ${screeningId} retryable error (attempt ${job.attemptsMade + 1}): ${err.message}`,
        );
        throw err;
      }

      if (isLastAttempt) {
        this.logger.error(
          `Screening ${screeningId} final attempt failed: ${(err as Error).message}`,
        );
        await this.failTerminal(
          screeningId,
          'PROCESSING_ERROR',
          'Screening processing failed after all retries.',
        );
        throw new UnrecoverableError((err as Error).message);
      }

      this.logger.error(
        `Screening ${screeningId} retryable error (attempt ${job.attemptsMade + 1}): ${(err as Error).message}`,
      );
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
          matchedQualifications:
            result.matchedQualifications.length > 0 ? result.matchedQualifications : undefined,
          missingQualifications:
            result.missingQualifications.length > 0 ? result.missingQualifications : undefined,
          evidence: result.evidence.length > 0 ? (result.evidence as never) : undefined,
          criteriaScores:
            result.criteriaScores.length > 0 ? (result.criteriaScores as never) : undefined,
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
      this.logger.error(
        `Failed to persist screening result ${screeningId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private async failTerminal(
    screeningId: string,
    failureCode: string,
    messageSafe: string,
  ): Promise<void> {
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
    } catch (err) {
      this.logger.error(
        `Failed to mark screening ${screeningId} as FAILED: ${(err as Error).message}`,
      );
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
