import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ScreeningInputBuilderService, ResumeTextData } from './services/screening-input-builder.service';
import { computeScreeningFingerprint } from './utils/screening-input-fingerprint';
import { AI_SCREENING_QUEUE, AI_SCREENING_JOB } from './queue/ai-screening-queue.constants';
import { AiScreeningJobData } from './queue/ai-screening-job-data.interface';
import { AiScreeningResponseDto } from './dto/ai-screening-response.dto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

@Injectable()
export class AiScreeningService {
  private readonly logger = new Logger(AiScreeningService.name);
  private readonly provider: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly schemaVersion: string;
  private readonly uploadDir: string;
  private readonly resumeTextParserSuffix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: ScreeningInputBuilderService,
    @InjectQueue(AI_SCREENING_QUEUE) private readonly screeningQueue: Queue,
    configService: ConfigService,
  ) {
    this.provider = configService.get<string>('aiScreening.provider') || 'mock';
    this.model = configService.get<string>('aiScreening.openAiModel') || 'gpt-4o-mini';
    this.promptVersion = configService.get<string>('aiScreening.promptVersion') || 'v1';
    this.schemaVersion = configService.get<string>('aiScreening.schemaVersion') || 'v1';
    this.uploadDir = configService.get<string>('app.uploadDir') || './uploads';
    this.resumeTextParserSuffix = configService.get<string>('app.resumeTextParserSuffix') || '_parsed.txt';
  }

  async requestScreening(
    applicationId: string,
    companyId: string,
    userId: string,
    forceRerun = false,
  ): Promise<AiScreeningResponseDto> {
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

    const resumeText = await this.loadResumeText(resumeFile.storageKey);
    if (!resumeText || resumeText.parsedText.trim().length < 10) {
      throw new ConflictException('Resume has no parsed text. Resume processing must complete first.');
    }

    const screeningInput = this.inputBuilder.build(
      application as never,
      resumeText,
      this.promptVersion,
    );

    const fingerprint = computeScreeningFingerprint({
      applicationId,
      input: screeningInput,
      jobUpdatedAt: job.updatedAt.toISOString(),
      resumeChecksumSha256: resumeFile.checksumSha256,
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
        return this.mapToDto(existing);
      }
    }

    const screening = await this.prisma.aiScreeningResult.create({
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

    const jobData: AiScreeningJobData = {
      screeningId: screening.id,
      applicationId,
      companyId,
      initiatedByUserId: userId,
      inputFingerprint: fingerprint,
    };

    try {
      await this.screeningQueue.add(AI_SCREENING_JOB, jobData, {
        jobId: screening.id,
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue screening job: ${(err as Error).message}`);
      await this.prisma.aiScreeningResult.update({
        where: { id: screening.id },
        data: {
          status: 'FAILED',
          failureCode: 'QUEUE_FAILURE',
          failureMessageSafe: 'Failed to queue screening job. Please try again.',
          completedAt: new Date(),
        },
      });
      throw new ServiceUnavailableException('Screening job could not be queued. Please try again.');
    }

    return this.mapToDto(screening);
  }

  async getScreening(screeningId: string, companyId: string): Promise<AiScreeningResponseDto> {
    const screening = await this.prisma.aiScreeningResult.findFirst({
      where: { id: screeningId, companyId },
    });

    if (!screening) {
      throw new NotFoundException('Screening result not found');
    }

    return this.mapToDto(screening);
  }

  async getLatestScreening(applicationId: string, companyId: string): Promise<AiScreeningResponseDto> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const screening = await this.prisma.aiScreeningResult.findFirst({
      where: { applicationId, companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (!screening) {
      throw new NotFoundException('No screening result found for this application');
    }

    return this.mapToDto(screening);
  }

  async listScreenings(
    applicationId: string,
    companyId: string,
    page: number,
    limit: number,
  ): Promise<{ data: AiScreeningResponseDto[]; total: number; page: number; limit: number; totalPages: number }> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

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

  private async loadResumeText(storageKey: string): Promise<ResumeTextData | null> {
    const parsedPath = resolve(this.uploadDir, `${storageKey}${this.resumeTextParserSuffix}`);
    try {
      const parsedText = await readFile(parsedPath, 'utf-8');
      return { parsedText, checksumSha256: '' };
    } catch {
      return null;
    }
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

    if (Array.isArray(s.matchedQualifications)) dto.matchedQualifications = s.matchedQualifications as string[];
    if (Array.isArray(s.missingQualifications)) dto.missingQualifications = s.missingQualifications as string[];
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
