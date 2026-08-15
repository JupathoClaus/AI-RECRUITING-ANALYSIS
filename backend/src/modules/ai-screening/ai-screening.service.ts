import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ScreeningInputBuilderService } from './services/screening-input-builder.service';
import {
  ResumeTextLoaderService,
  CompletedExtraction,
} from './services/resume-text-loader.service';
import { ResumeExtractionService } from '../resume-processing/services/resume-extraction.service';
import { computeScreeningFingerprint } from './utils/screening-input-fingerprint';
import { AI_SCREENING_QUEUE, AI_SCREENING_JOB } from './queue/ai-screening-queue.constants';
import { AiScreeningJobData } from './queue/ai-screening-job-data.interface';
import { AiScreeningResponseDto } from './dto/ai-screening-response.dto';
import { ResumeExtractionStatusDto } from './dto/resume-extraction-status.dto';

export interface ScreeningResultOrAction {
  action: 'CREATED' | 'REUSED';
  data: AiScreeningResponseDto;
}

@Injectable()
export class AiScreeningService {
  private readonly logger = new Logger(AiScreeningService.name);
  private readonly provider: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly schemaVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: ScreeningInputBuilderService,
    private readonly resumeLoader: ResumeTextLoaderService,
    private readonly extractionService: ResumeExtractionService,
    @InjectQueue(AI_SCREENING_QUEUE) private readonly screeningQueue: Queue,
    configService: ConfigService,
  ) {
    this.provider = configService.get<string>('aiScreening.provider') || 'mock';
    this.model = configService.get<string>('aiScreening.openAiModel') || 'gpt-4o-mini';
    this.promptVersion = configService.get<string>('aiScreening.promptVersion') || 'v1';
    this.schemaVersion = configService.get<string>('aiScreening.schemaVersion') || 'v1';
  }

  async requestScreening(
    applicationId: string,
    companyId: string,
    userId: string,
    forceRerun = false,
  ): Promise<ScreeningResultOrAction> {
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
      throw new NotFoundException('Application not found');
    }

    const job = application.job;
    if (!job.description && !job.qualifications) {
      throw new ConflictException('Job has no description or qualifications. Cannot screen.');
    }

    const resumeFile = application.resumeFiles[0];
    if (!resumeFile) {
      throw new ConflictException('No resume file found for this application.');
    }

    const completedExtraction: CompletedExtraction | null =
      await this.resumeLoader.loadCompletedExtraction(resumeFile.id, companyId);

    if (!completedExtraction) {
      const extractionResult = await this.extractionService.requestExtraction(
        resumeFile.id,
        companyId,
        userId,
      );
      if (extractionResult.action === 'CREATED') {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: 'RESUME_EXTRACTION_PENDING',
            message:
              'Resume processing is in progress. Try screening again after extraction completes.',
            extraction: {
              id: extractionResult.extraction.id,
              status: extractionResult.extraction.status,
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: 'RESUME_EXTRACTION_PENDING',
          message: 'Resume text extraction is not yet complete.',
          extraction: {
            id: extractionResult.extraction.id,
            status: extractionResult.extraction.status,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const screeningInput = this.inputBuilder.build(
      application as never,
      completedExtraction,
      this.promptVersion,
    );

    const fingerprint = computeScreeningFingerprint({
      applicationId,
      input: screeningInput,
      jobUpdatedAt: job.updatedAt.toISOString(),
      resumeChecksumSha256: resumeFile.checksumSha256 ?? completedExtraction.sourceFileSha256,
      resumeUpdatedAt: resumeFile.updatedAt.toISOString(),
      provider: this.provider,
      model: this.model,
      promptVersion: this.promptVersion,
      schemaVersion: this.schemaVersion,
    });

    if (!forceRerun) {
      const existing = await this.prisma.aiScreeningResult.findFirst({
        where: {
          applicationId,
          companyId,
          inputFingerprint: fingerprint,
          status: { in: ['PENDING', 'RUNNING', 'COMPLETED'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return { action: 'REUSED', data: this.mapToDto(existing) };
      }
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const screening = await this.prisma.$transaction(
          async (tx) => {
            if (!forceRerun) {
              const existing = await tx.aiScreeningResult.findFirst({
                where: {
                  applicationId,
                  companyId,
                  inputFingerprint: fingerprint,
                  status: { in: ['PENDING', 'RUNNING', 'COMPLETED'] },
                },
                orderBy: { createdAt: 'desc' },
              });
              if (existing) return { action: 'REUSED', record: existing } as const;
            }

            const created = await tx.aiScreeningResult.create({
              data: {
                applicationId,
                jobId: job.id,
                candidateId: application.candidate.id,
                companyId,
                initiatedByUserId: userId,
                status: 'PENDING',
                inputFingerprint: fingerprint,
                provider: this.provider,
                model: this.model,
                promptVersion: this.promptVersion,
              },
            });
            return { action: 'CREATED', record: created } as const;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );

        if (screening.action === 'REUSED') {
          return { action: 'REUSED', data: this.mapToDto(screening.record) };
        }

        const jobData: AiScreeningJobData = {
          screeningId: screening.record.id,
          applicationId,
          companyId,
          initiatedByUserId: userId,
          inputFingerprint: fingerprint,
        };

        try {
          await this.screeningQueue.add(AI_SCREENING_JOB, jobData, { jobId: screening.record.id });
        } catch (err) {
          this.logger.error(`Failed to enqueue screening job: ${(err as Error).message}`);
          await this.prisma.aiScreeningResult.update({
            where: { id: screening.record.id },
            data: {
              status: 'FAILED',
              failureCode: 'QUEUE_FAILURE',
              failureMessageSafe: 'Failed to queue screening job.',
              completedAt: new Date(),
            },
          });
          throw new ServiceUnavailableException(
            'Screening job could not be queued. Please try again.',
          );
        }

        return { action: 'CREATED', data: this.mapToDto(screening.record) };
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < maxRetries - 1) {
          this.logger.warn(
            `Serialization conflict on screening creation (attempt ${attempt + 1}), retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException(
      'Could not create screening attempt due to concurrent access.',
    );
  }

  async retryExtraction(
    applicationId: string,
    companyId: string,
    userId: string,
  ): Promise<{ extraction: { id: string; status: string } }> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: {
        id: true,
        resumeFiles: {
          where: { category: 'RESUME', status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!application) throw new NotFoundException('Application not found');

    const resumeFile = application.resumeFiles[0];
    if (!resumeFile) throw new ConflictException('No resume file found for this application.');

    const result = await this.extractionService.retryExtraction(resumeFile.id, companyId, userId);
    return { extraction: result.extraction };
  }

  async getScreening(screeningId: string, companyId: string): Promise<AiScreeningResponseDto> {
    const screening = await this.prisma.aiScreeningResult.findFirst({
      where: { id: screeningId, companyId },
    });
    if (!screening) throw new NotFoundException('Screening result not found');
    return this.mapToDto(screening);
  }

  async getLatestScreening(
    applicationId: string,
    companyId: string,
  ): Promise<AiScreeningResponseDto> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    const screening = await this.prisma.aiScreeningResult.findFirst({
      where: { applicationId, companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!screening) throw new NotFoundException('No screening result found for this application');
    return this.mapToDto(screening);
  }

  async getExtractionStatus(
    applicationId: string,
    companyId: string,
  ): Promise<ResumeExtractionStatusDto> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: {
        id: true,
        resumeFiles: {
          where: { category: 'RESUME', status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const resumeFile = application.resumeFiles[0];
    if (!resumeFile) {
      throw new NotFoundException('No resume file found for this application');
    }

    const extraction = await this.prisma.resumeTextExtraction.findFirst({
      where: { storedFileId: resumeFile.id, companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        failureCode: true,
        failureMessageSafe: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!extraction) {
      throw new NotFoundException('No extraction found for this application');
    }

    const dto = new ResumeExtractionStatusDto();
    dto.id = extraction.id;
    dto.status = extraction.status;
    dto.failureCode = extraction.failureCode ?? undefined;
    dto.failureMessageSafe = extraction.failureMessageSafe ?? undefined;
    dto.createdAt = extraction.createdAt.toISOString();
    dto.startedAt = extraction.startedAt?.toISOString();
    dto.completedAt = extraction.completedAt?.toISOString();
    return dto;
  }

  async listScreenings(
    applicationId: string,
    companyId: string,
    page: number,
    limit: number,
  ): Promise<{
    data: AiScreeningResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Application not found');

    const where = { applicationId, companyId };
    const [data, total] = await Promise.all([
      this.prisma.aiScreeningResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.aiScreeningResult.count({ where }),
    ]);

    return {
      data: data.map((d) => this.mapToDto(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapToDto(screening: Record<string, unknown>): AiScreeningResponseDto {
    const s = screening as {
      id: string;
      applicationId: string;
      status: string;
      recommendation: string | null;
      overallScore: number | null;
      confidence: string | null;
      matchedQualifications: unknown;
      missingQualifications: unknown;
      evidence: unknown;
      criteriaScores: unknown;
      uncertainties: unknown;
      riskFlags: unknown;
      explanation: string | null;
      prohibitedReasoningDetected: boolean | null;
      provider: string | null;
      model: string | null;
      promptVersion: string | null;
      failureCode: string | null;
      failureMessageSafe: string | null;
      createdAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
    };

    const dto = new AiScreeningResponseDto();
    dto.id = s.id;
    dto.applicationId = s.applicationId;
    dto.status = s.status;
    dto.recommendation = s.recommendation ?? undefined;
    dto.overallScore = s.overallScore ?? undefined;
    dto.confidence = s.confidence ?? undefined;
    if (Array.isArray(s.matchedQualifications))
      dto.matchedQualifications = s.matchedQualifications as string[];
    if (Array.isArray(s.missingQualifications))
      dto.missingQualifications = s.missingQualifications as string[];
    if (Array.isArray(s.evidence)) dto.evidence = s.evidence as never[];
    if (Array.isArray(s.criteriaScores)) dto.criteriaScores = s.criteriaScores as never[];
    if (Array.isArray(s.uncertainties)) dto.uncertainties = s.uncertainties as string[];
    if (Array.isArray(s.riskFlags)) dto.riskFlags = s.riskFlags as string[];
    dto.explanation = s.explanation ?? undefined;
    dto.prohibitedReasoningDetected = s.prohibitedReasoningDetected ?? undefined;
    dto.provider = s.provider ?? undefined;
    dto.model = s.model ?? undefined;
    dto.promptVersion = s.promptVersion ?? undefined;
    dto.failureCode = s.failureCode ?? undefined;
    dto.failureMessageSafe = s.failureMessageSafe ?? undefined;
    dto.createdAt = s.createdAt.toISOString();
    dto.startedAt = s.startedAt?.toISOString();
    dto.completedAt = s.completedAt?.toISOString();
    return dto;
  }
}
