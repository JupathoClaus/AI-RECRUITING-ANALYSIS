import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningProvider } from './providers/ai-screening-provider.interface';
import { AI_SCREENING_PROVIDER } from './providers/ai-screening-provider.token';
import { ScreeningInput, buildScreeningInput } from './domain/screening-input.type';
import { ScreeningResult } from './domain/screening-result.type';
import { AiScreeningRecommendation, AiScreeningConfidence, AiScreeningStatus } from './domain/screening-recommendation.enum';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';

const PROHIBITED_PATTERNS = [
  /\bage\b/i, /\bgender\b/i, /\bsex\b/i, /\brace\b/i, /\bethnicity\b/i,
  /\breligion\b/i, /\bnationality\b/i, /\bdisability\b/i, /\bmarital\b/i,
  /\bpregnant\b/i, /\bpregnancy\b/i,
];

@Injectable()
export class AiScreeningService {
  private readonly logger = new Logger(AiScreeningService.name);
  private readonly defaultProvider: string;

  constructor(
    @Inject(AI_SCREENING_PROVIDER)
    private readonly provider: AiScreeningProvider,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultProvider = this.configService.get<string>('app.aiScreeningProvider') || 'mock';
  }

  async runScreening(
    applicationId: string,
    companyId: string,
    userId: string,
    requestId?: string,
  ): Promise<ScreeningResult> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      include: {
        job: {
          include: {
            skills: {
              include: { skill: true },
            },
            educationRequirements: true,
            experienceRequirements: true,
          },
        },
        candidate: true,
        resumeFiles: {
          where: { status: 'ACTIVE', category: 'RESUME', deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!application) {
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    }

    const resumeFile = application.resumeFiles[0];
    const candidate = application.candidate;
    const job = application.job;

    if (!job.description || job.description.trim().length < 10) {
      throw new BadRequestException({ code: 'SCREENING_INSUFFICIENT_JOB', message: 'Job description is too short or missing' });
    }

    let resumeText = '';
    if (resumeFile) {
      try {
        const storedFile = await this.prisma.storedFile.findUnique({ where: { id: resumeFile.id } });
        if (storedFile && storedFile.category === 'RESUME') {
          resumeText = `[Resume: ${storedFile.originalName}, Size: ${storedFile.sizeBytes} bytes, Type: ${storedFile.mimeType}]`;
        }
      } catch {
        this.logger.warn(`Could not load resume file ${resumeFile.id}`);
      }
    }

    if (!resumeText || resumeText.trim().length < 5) {
      throw new BadRequestException({ code: 'SCREENING_NO_RESUME', message: 'No resume text available for screening' });
    }

    const requiredSkills: string[] = [];
    const preferredSkills: string[] = [];
    for (const js of job.skills) {
      if (js.importance === 'REQUIRED') requiredSkills.push(js.skill.displayName);
      else preferredSkills.push(js.skill.displayName);
    }

    const requiredExperience = job.experienceRequirements
      .filter((e) => e.importance === 'REQUIRED')
      .map((e) => `${e.title || ''} (${e.minimumYears}+ years)`)
      .join('; ') || 'Not specified';
    const preferredExperience = job.experienceRequirements
      .filter((e) => e.importance !== 'REQUIRED')
      .map((e) => `${e.title || ''} (${e.minimumYears}+ years)`)
      .join('; ') || 'Not specified';
    const requiredEducation = job.educationRequirements
      .map((e) => `${e.level}${e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ''}`)
      .join('; ') || 'Not specified';

    const input: ScreeningInput = buildScreeningInput({
      applicationId: application.id,
      candidateId: candidate.id,
      jobId: job.id,
      companyId,
      job: { title: job.title, description: job.description, qualifications: job.qualifications },
      requiredSkills,
      preferredSkills,
      requiredExperience,
      preferredExperience,
      requiredEducation,
      resumeText,
    });

    const inputFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ jobId: job.id, candidateId: candidate.id, resumeText: resumeText.slice(0, 1000) }))
      .digest('hex')
      .slice(0, 16);

    const screeningResult = await this.prisma.aiScreeningResult.create({
      data: {
        applicationId: application.id,
        jobId: job.id,
        candidateId: candidate.id,
        companyId,
        initiatedByUserId: userId,
        status: 'RUNNING' as any,
        inputFingerprint,
        startedAt: new Date(),
      },
    });

    try {
      const providerResult = await this.provider.screen(input);

      const validated = this.validateProviderResult(providerResult);
      const finalResult = this.applySafeguards(validated);

      await this.prisma.aiScreeningResult.update({
        where: { id: screeningResult.id },
        data: {
          status: 'COMPLETED' as any,
          overallScore: finalResult.overallScore,
          recommendation: finalResult.recommendation as any,
          confidence: finalResult.confidence as any,
          matchedQualifications: finalResult.matchedQualifications as Prisma.InputJsonValue,
          missingQualifications: finalResult.missingQualifications as Prisma.InputJsonValue,
          evidence: finalResult.evidence as unknown as Prisma.InputJsonValue,
          criteriaScores: finalResult.criteriaScores as unknown as Prisma.InputJsonValue,
          uncertainties: finalResult.uncertainties as Prisma.InputJsonValue,
          riskFlags: finalResult.riskFlags as Prisma.InputJsonValue,
          explanation: finalResult.explanation,
          prohibitedReasoningDetected: finalResult.prohibitedReasoningDetected,
          provider: this.defaultProvider,
          completedAt: new Date(),
        },
      });

      return finalResult;
    } catch (err: any) {
      this.logger.error(`Screening failed for application ${applicationId}: ${err.message}`);

      await this.prisma.aiScreeningResult.update({
        where: { id: screeningResult.id },
        data: {
          status: 'FAILED' as any,
          failureCode: 'PROVIDER_ERROR',
          failureMessageSafe: 'Screening provider encountered an error. Please try again.',
          completedAt: new Date(),
        },
      });

      return {
        overallScore: 0,
        recommendation: AiScreeningRecommendation.HUMAN_REVIEW,
        confidence: AiScreeningConfidence.LOW,
        matchedQualifications: [],
        missingQualifications: [],
        evidence: [],
        criteriaScores: [],
        uncertainties: ['Screening provider error'],
        riskFlags: ['PROVIDER_ERROR'],
        explanation: 'Screening failed due to a provider error. Human review required.',
        prohibitedReasoningDetected: false,
      };
    }
  }

  async findByApplication(
    applicationId: string,
    companyId: string,
    page = 1,
    limit = 20,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app) {
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.aiScreeningResult.findMany({
        where: { applicationId, companyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aiScreeningResult.count({ where: { applicationId, companyId } }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findLatest(applicationId: string, companyId: string) {
    const result = await this.prisma.aiScreeningResult.findFirst({
      where: { applicationId, companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!result) {
      throw new NotFoundException({ code: 'SCREENING_NOT_FOUND', message: 'No screening result found' });
    }
    return result;
  }

  async findById(screeningId: string, companyId: string) {
    const result = await this.prisma.aiScreeningResult.findFirst({
      where: { id: screeningId, companyId },
    });
    if (!result) {
      throw new NotFoundException({ code: 'SCREENING_NOT_FOUND', message: 'Screening result not found' });
    }
    return result;
  }

  private validateProviderResult(result: any): ScreeningResult {
    const errors: string[] = [];

    if (typeof result.overallScore !== 'number' || result.overallScore < 0 || result.overallScore > 100) {
      errors.push('overallScore must be an integer between 0 and 100');
    }

    if (!Object.values(AiScreeningRecommendation).includes(result.recommendation)) {
      errors.push(`Invalid recommendation: ${result.recommendation}`);
    }

    if (!Object.values(AiScreeningConfidence).includes(result.confidence)) {
      errors.push(`Invalid confidence: ${result.confidence}`);
    }

    if (!Array.isArray(result.evidence) || result.evidence.length === 0) {
      errors.push('evidence must be a non-empty array');
    }

    if (typeof result.explanation !== 'string' || result.explanation.length > 5000) {
      errors.push('explanation must be a string with max length 5000');
    }

    if (!Array.isArray(result.matchedQualifications)) {
      errors.push('matchedQualifications must be an array');
    }

    if (!Array.isArray(result.missingQualifications)) {
      errors.push('missingQualifications must be an array');
    }

    if (result.recommendation === AiScreeningRecommendation.SHORTLIST && result.matchedQualifications.length === 0) {
      errors.push('SHORTLIST recommendation requires matched qualifications');
    }

    if (result.recommendation === AiScreeningRecommendation.NOT_SHORTLIST && result.missingQualifications.length === 0) {
      errors.push('NOT_SHORTLIST recommendation requires missing qualifications');
    }

    if (result.recommendation === AiScreeningRecommendation.HUMAN_REVIEW && !result.explanation) {
      errors.push('HUMAN_REVIEW requires an explanation');
    }

    if (result.confidence === AiScreeningConfidence.HIGH && result.evidence.length === 0) {
      errors.push('HIGH confidence requires evidence');
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'SCREENING_INVALID_RESULT',
        message: `Provider returned invalid result: ${errors.join('; ')}`,
      });
    }

    return result as ScreeningResult;
  }

  private applySafeguards(result: ScreeningResult): ScreeningResult {
    const explanationText = result.explanation || '';

    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.test(explanationText)) {
        this.logger.warn(`Prohibited reasoning detected matching pattern: ${pattern.source}`);
        return {
          ...result,
          recommendation: AiScreeningRecommendation.HUMAN_REVIEW,
          prohibitedReasoningDetected: true,
          riskFlags: [...(result.riskFlags || []), 'PROHIBITED_REASONING_DETECTED'],
          explanation: 'Screening result flagged for review due to potential non-job-related reasoning.',
        };
      }
    }

    if (result.prohibitedReasoningDetected) {
      return {
        ...result,
        recommendation: AiScreeningRecommendation.HUMAN_REVIEW,
        riskFlags: [...(result.riskFlags || []), 'PROHIBITED_REASONING_DETECTED'],
      };
    }

    return result;
  }
}
