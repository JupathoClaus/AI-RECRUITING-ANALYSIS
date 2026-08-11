import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationsService } from '../services/applications.service';
import { ApplicationWorkflowService } from '../services/application-workflow.service';
import { ApplicationNumberService } from '../services/application-number.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { ScreeningAnswersService } from '../services/screening-answers.service';
import { PublicApplicationDto } from '../dto/public-application.dto';
import {
  ApplicationStatus,
  ApplicationActorType,
  ApplicationAuditEventType,
  CandidateSource,
} from '@prisma/client';
import * as crypto from 'crypto';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

@ApiTags('Public Applications')
@Controller('public')
export class PublicApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyCandidateService: CompanyCandidateService,
    private readonly numberService: ApplicationNumberService,
    private readonly auditService: ApplicationAuditService,
    private readonly screeningAnswersService: ScreeningAnswersService,
  ) {}

  @Post('companies/:companySlug/jobs/:jobSlug/applications')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Public candidate application submission' })
  @ApiResponse({
    status: 201,
    description: 'Application submitted — returns opaque publicReference only',
  })
  async submitPublic(
    @Param('companySlug') companySlug: string,
    @Param('jobSlug') jobSlug: string,
    @Body() dto: PublicApplicationDto,
  ) {
    // Validate company
    const company = await this.prisma.company.findFirst({
      where: { slug: companySlug, status: 'ACTIVE' },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Validate job
    const job = await this.prisma.job.findFirst({
      where: { slug: jobSlug, companyId: company.id, status: 'PUBLISHED', deletedAt: null },
      include: {
        pipeline: {
          include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found or not accepting applications');
    if (job.applicationDeadline && new Date() > job.applicationDeadline) {
      throw new BadRequestException({
        code: 'APPLICATION_DEADLINE_PASSED',
        message: 'Application deadline has passed',
      });
    }
    if (!dto.consentConfirmed)
      throw new BadRequestException({
        code: 'APPLICATION_CONSENT_REQUIRED',
        message: 'Consent must be confirmed',
      });

    const normalizedEmail = dto.email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      // Find or create global Candidate
      let candidate = await tx.candidate.findFirst({ where: { normalizedEmail } });
      if (!candidate) {
        candidate = await (tx as any).candidate.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            normalizedEmail,
            phone: dto.phone ?? null,
            normalizedPhone: dto.phone
              ? dto.phone.replace(/[\s\-\(\)\.]+/g, '').replace(/[^\d+]/g, '')
              : null,
            source: dto.source ?? CandidateSource.CAREERS_PAGE,
            sourceDetail: dto.sourceDetail ?? null,
            preferredLocale: dto.preferredLanguage ?? 'en',
          },
        });
      }

      // Check for duplicate active application — generic response
      const existingApp = await tx.application.findFirst({
        where: {
          companyId: company.id,
          jobId: job.id,
          candidateId: candidate!.id,
          status: {
            notIn: [
              ApplicationStatus.WITHDRAWN,
              ApplicationStatus.ARCHIVED,
              ApplicationStatus.REJECTED,
            ],
          },
          deletedAt: null,
        },
      });
      if (existingApp) {
        // Generic response — do not leak existence
        return { publicReference: existingApp.publicReference, status: 'pending_review' };
      }

      // Find or create CompanyCandidate
      const cc = await this.companyCandidateService.findOrCreate(
        company.id,
        candidate!.id,
        dto.source ?? CandidateSource.CAREERS_PAGE,
        dto.sourceDetail,
        undefined,
        undefined,
        undefined,
        tx,
      );

      const applicationNumber = await this.numberService.generate(company.id, tx);
      const publicReference = crypto.randomUUID().replace(/-/g, '');
      const initialStage = job.pipeline?.stages[0];

      const app = await (tx as any).application.create({
        data: {
          companyId: company.id,
          jobId: job.id,
          candidateId: candidate!.id,
          companyCandidateId: cc.id,
          applicationNumber,
          publicReference,
          status: ApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
          currentStageId: initialStage?.id ?? null,
          source: dto.source ?? CandidateSource.CAREERS_PAGE,
          coverLetter: dto.coverLetter ?? null,
          consentConfirmed: true,
        },
      });

      // Stage history
      if (initialStage) {
        await (tx as any).applicationStageHistory.create({
          data: {
            applicationId: app.id,
            toStageId: initialStage.id,
            fromStatus: null,
            toStatus: ApplicationStatus.SUBMITTED,
            actorType: ApplicationActorType.CANDIDATE,
          },
        });
      }

      // Screening answers
      if (dto.screeningAnswers?.length) {
        await (tx as any).applicationScreeningAnswer.createMany({
          data: dto.screeningAnswers.map((a: any) => ({
            applicationId: app.id,
            questionId: a.questionId,
            textAnswer: a.textAnswer ?? null,
            numericAnswer: a.numericAnswer ?? null,
            dateAnswer: a.dateAnswer ? new Date(a.dateAnswer) : null,
            answer: a.answer ?? undefined,
            isComplete: !!(a.textAnswer || a.numericAnswer != null || a.dateAnswer || a.answer),
          })),
          skipDuplicates: true,
        });
      }

      await this.auditService.record({
        companyId: company.id,
        applicationId: app.id,
        candidateId: candidate!.id,
        actorType: ApplicationActorType.CANDIDATE,
        eventType: ApplicationAuditEventType.APPLICATION_SUBMITTED,
        entityType: 'Application',
        entityId: app.id,
        description: `Public application submitted for job ${job.title}`,
        tx,
      });

      // Safe public response — no internal IDs except public reference
      return { publicReference, status: 'submitted' };
    });
  }

  @Get('applications/:publicReference/status')
  @Public()
  @ApiOperation({ summary: 'Get safe public application status' })
  async getStatus(@Param('publicReference') ref: string) {
    const app = await this.prisma.application.findFirst({
      where: { publicReference: ref },
      select: { status: true, submittedAt: true, jobId: true },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_PUBLIC_REFERENCE_INVALID',
        message: 'Application not found',
      });

    // Safe status mapping — no internal details
    const safeStatus: Record<string, string> = {
      DRAFT: 'received',
      SUBMITTED: 'received',
      UNDER_REVIEW: 'under_review',
      SCREENING: 'under_review',
      SHORTLISTED: 'in_progress',
      ASSESSMENT: 'in_progress',
      INTERVIEW: 'in_progress',
      OFFER: 'in_progress',
      HIRED: 'closed',
      REJECTED: 'closed',
      WITHDRAWN: 'withdrawn',
      DISQUALIFIED: 'closed',
      ON_HOLD: 'under_review',
      ARCHIVED: 'closed',
    };
    return { status: safeStatus[app.status] ?? 'received', submittedAt: app.submittedAt };
  }
}
