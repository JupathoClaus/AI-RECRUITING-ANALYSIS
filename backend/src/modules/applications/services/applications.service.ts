import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationStatus,
  ApplicationActorType,
  ApplicationAuditEventType,
  CandidateSource,
  NotificationType,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { ApplicationNumberService } from './application-number.service';
import { ApplicationAuditService } from './application-audit.service';
import { ApplicationWorkflowService } from './application-workflow.service';
import { CompanyCandidateService } from './company-candidate.service';
import { InAppNotificationsService } from '@modules/notifications/services/in-app-notifications.service';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { UpdateApplicationDto } from '../dto/update-application.dto';
import { ApplicationQueryDto } from '../dto/application-query.dto';

const ACCEPTED_JOB_STATUSES = ['PUBLISHED'];
const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.SCREENING,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.ON_HOLD,
];

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberService: ApplicationNumberService,
    private readonly auditService: ApplicationAuditService,
    private readonly workflowService: ApplicationWorkflowService,
    private readonly companyCandidateService: CompanyCandidateService,
    private readonly inAppNotificationsService: InAppNotificationsService,
  ) {}

  async create(
    dto: CreateApplicationDto,
    companyId: string,
    userId: string,
    membershipId: string,
    requestId?: string,
  ) {
    // Validate job belongs to this company and is accepting applications
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, companyId, deletedAt: null },
      include: {
        pipeline: {
          include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!job)
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Job not found' });
    if (!ACCEPTED_JOB_STATUSES.includes(job.status)) {
      throw new BadRequestException({
        code: 'APPLICATION_JOB_NOT_ACCEPTING',
        message: 'Job is not accepting applications',
      });
    }
    if (job.applicationDeadline && new Date() > job.applicationDeadline) {
      throw new BadRequestException({
        code: 'APPLICATION_DEADLINE_PASSED',
        message: 'Application deadline has passed',
      });
    }

    // Validate candidate exists
    const candidate = await this.prisma.candidate.findUnique({ where: { id: dto.candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found');

    // Check for duplicate active application
    const duplicate = await this.prisma.application.findFirst({
      where: {
        companyId,
        jobId: dto.jobId,
        candidateId: dto.candidateId,
        status: { in: ACTIVE_APPLICATION_STATUSES },
        deletedAt: null,
      },
    });
    if (duplicate)
      throw new ConflictException({
        code: 'APPLICATION_DUPLICATE',
        message: 'Candidate already has an active application for this job',
      });

    // Get initial pipeline stage
    const initialStage = job.pipeline?.stages[0];

    return this.prisma.$transaction(async (tx) => {
      // Find or create CompanyCandidate
      const cc = await this.companyCandidateService.findOrCreate(
        companyId,
        dto.candidateId,
        dto.source,
        dto.sourceDetail,
        dto.ownerMembershipId,
        membershipId,
        userId,
        tx,
      );

      // Generate application number
      const applicationNumber = await this.numberService.generate(companyId, tx);
      const publicReference = crypto.randomUUID().replace(/-/g, '');

      const app = await tx.application.create({
        data: {
          companyId,
          jobId: dto.jobId,
          candidateId: dto.candidateId,
          companyCandidateId: cc.id,
          applicationNumber,
          publicReference,
          status: ApplicationStatus.DRAFT,
          currentStageId: initialStage?.id ?? null,
          source: dto.source,
          sourceDetail: dto.sourceDetail ?? null,
          coverLetter: dto.coverLetter ?? null,
          expectedSalaryMin: dto.expectedSalaryMin ?? null,
          expectedSalaryMax: dto.expectedSalaryMax ?? null,
          salaryCurrency: dto.salaryCurrency ?? null,
          availabilityDate: dto.availabilityDate ? new Date(dto.availabilityDate) : null,
          noticePeriodDays: dto.noticePeriodDays ?? null,
        },
      });

      // Owner assignment
      if (dto.ownerMembershipId) {
        const ownerMem = await tx.companyMembership.findFirst({
          where: { id: dto.ownerMembershipId, companyId, status: 'ACTIVE' },
        });
        if (ownerMem) {
          await tx.applicationAssignment.create({
            data: {
              applicationId: app.id,
              membershipId: dto.ownerMembershipId,
              type: 'OWNER',
              assignedByMembershipId: membershipId,
            },
          });
        }
      }

      // Screening answers
      if (dto.screeningAnswers?.length) {
        await tx.applicationScreeningAnswer.createMany({
          data: dto.screeningAnswers.map((a) => ({
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
        companyId,
        applicationId: app.id,
        candidateId: dto.candidateId,
        companyCandidateId: cc.id,
        actorType: ApplicationActorType.RECRUITER,
        actorUserId: userId,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_CREATED,
        entityType: 'Application',
        entityId: app.id,
        description: `Application ${applicationNumber} created`,
        metadata: { jobId: dto.jobId, source: dto.source },
        requestId,
        tx,
      });

      return this.findById(app.id, companyId, tx);
    });
  }

  async findAll(query: ApplicationQueryDto, companyId: string) {
    const {
      page = 1,
      limit = 20,
      search,
      jobId,
      candidateId,
      status,
      stageId,
      ownerMembershipId,
      assignedMembershipId,
      source,
      submittedFrom,
      submittedTo,
      hasActiveFlags,
      archived,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = { companyId, deletedAt: null };
    if (!archived) where.status = { notIn: [ApplicationStatus.ARCHIVED] };
    if (archived) where.status = ApplicationStatus.ARCHIVED;
    if (status?.length) where.status = { in: status };
    if (jobId?.length) where.jobId = { in: jobId };
    if (candidateId?.length) where.candidateId = { in: candidateId };
    if (stageId?.length) where.currentStageId = { in: stageId };
    if (ownerMembershipId)
      where.assignments = {
        some: { membershipId: ownerMembershipId, type: 'OWNER', removedAt: null },
      };
    if (assignedMembershipId)
      where.assignments = { some: { membershipId: assignedMembershipId, removedAt: null } };
    if (source?.length) where.source = { in: source };
    if (submittedFrom || submittedTo) {
      where.submittedAt = {};
      if (submittedFrom) where.submittedAt.gte = new Date(submittedFrom);
      if (submittedTo) where.submittedAt.lte = new Date(submittedTo);
    }
    if (hasActiveFlags) where.flags = { some: { resolved: false } };
    if (search) {
      where.OR = [
        { applicationNumber: { contains: search, mode: 'insensitive' } },
        {
          candidate: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
        { job: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder } as Prisma.ApplicationOrderByWithRelationInput,
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              headline: true,
              currentJobTitle: true,
            },
          },
          job: { select: { id: true, title: true, jobCode: true, departmentId: true } },
          currentStage: { select: { id: true, name: true, type: true } },
          assignments: {
            where: { removedAt: null },
            include: {
              membership: {
                select: {
                  id: true,
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
          flags: { where: { resolved: false }, select: { id: true, type: true, severity: true } },
          _count: { select: { screeningAnswers: true, notes: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: data.map((a) => this.mapToListItem(a)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const app = await (client as any).application.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        candidate: true,
        job: {
          include: {
            pipeline: {
              include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
            },
            screeningQuestions: { where: { deletedAt: null } },
          },
        },
        companyCandidate: {
          include: {
            tags: { include: { tag: true } },
            owner: {
              select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
        currentStage: true,
        stageHistory: { orderBy: { occurredAt: 'desc' }, take: 50 },
        assignments: {
          where: { removedAt: null },
          include: {
            membership: {
              select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
        notes: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        flags: { orderBy: { createdAt: 'desc' } },
        screeningAnswers: true,
        decisions: { orderBy: { createdAt: 'desc' } },
        tagAssignments: { include: { tag: true } },
      },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    return this.mapToDetail(app);
  }

  async update(
    id: string,
    dto: UpdateApplicationDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    if (app.version !== dto.expectedVersion)
      throw new ConflictException({
        code: 'APPLICATION_STALE_VERSION',
        message: 'Stale version',
        currentVersion: app.version,
      });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.coverLetter !== undefined ? { coverLetter: dto.coverLetter } : {}),
        ...(dto.expectedSalaryMin !== undefined
          ? { expectedSalaryMin: dto.expectedSalaryMin }
          : {}),
        ...(dto.expectedSalaryMax !== undefined
          ? { expectedSalaryMax: dto.expectedSalaryMax }
          : {}),
        ...(dto.salaryCurrency !== undefined ? { salaryCurrency: dto.salaryCurrency } : {}),
        ...(dto.availabilityDate !== undefined
          ? { availabilityDate: dto.availabilityDate ? new Date(dto.availabilityDate) : null }
          : {}),
        ...(dto.noticePeriodDays !== undefined ? { noticePeriodDays: dto.noticePeriodDays } : {}),
        version: { increment: 1 },
      },
    });
    return updated;
  }

  async submit(
    id: string,
    companyId: string,
    expectedVersion: number,
    consentConfirmed: boolean,
    userId: string,
    membershipId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        job: {
          include: {
            pipeline: {
              include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
            },
            screeningQuestions: { where: { deletedAt: null, required: true } },
            ownerMembership: {
              include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            },
          },
        },
        screeningAnswers: true,
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    if (app.status === ApplicationStatus.SUBMITTED) return this.findById(id, companyId);
    if (app.status !== ApplicationStatus.DRAFT)
      throw new BadRequestException({
        code: 'APPLICATION_ALREADY_SUBMITTED',
        message: 'Application cannot be submitted from current state',
      });
    if (!consentConfirmed && !app.consentConfirmed)
      throw new BadRequestException({
        code: 'APPLICATION_CONSENT_REQUIRED',
        message: 'Consent must be confirmed before submission',
      });

    // Check required screening answers
    const requiredQIds = app.job.screeningQuestions
      .filter((q: any) => q.required)
      .map((q: any) => q.id);
    const answeredQIds = new Set(
      app.screeningAnswers.filter((a: any) => a.isComplete).map((a: any) => a.questionId),
    );
    const missing = requiredQIds.filter((qid: string) => !answeredQIds.has(qid));
    if (missing.length > 0)
      throw new BadRequestException({
        code: 'APPLICATION_REQUIRED_ANSWERS_MISSING',
        message: `${missing.length} required screening answer(s) missing`,
      });

    // Build snapshots (no sensitive data)
    const candidateSnap = await this.prisma.candidate.findUnique({
      where: { id: app.candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        headline: true,
        currentJobTitle: true,
        source: true,
      },
    });
    const jobSnap = {
      id: app.job.id,
      title: app.job.title,
      jobCode: app.job.jobCode,
    };
    const screeningSnap = {
      questionCount: app.job.screeningQuestions?.length ?? 0,
      answeredCount: app.screeningAnswers.length,
    };

    const initialStage = app.job.pipeline?.stages[0];

    const result = await this.workflowService.transition({
      applicationId: id,
      companyId,
      toStatus: ApplicationStatus.SUBMITTED,
      toStageId: initialStage?.id,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: userId,
      actorMembershipId: membershipId,
      expectedVersion,
      requestId,
      additionalData: {
        submittedAt: new Date(),
        consentConfirmed: true,
        candidateSnapshot: candidateSnap,
        jobSnapshot: jobSnap,
        screeningSnapshot: screeningSnap,
      },
    });

    // Notify job owner about new application (respecting preference)
    const jobOwner = app.job.ownerMembership;
    if (jobOwner && jobOwner.userId !== userId) {
      const candidateName = app.candidate
        ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim()
        : 'A candidate';
      let shouldNotify = true;
      try {
        const settings = await this.prisma.companySettings.findUnique({ where: { companyId } });
        shouldNotify = settings?.notifyRecruiterOnNewApplication ?? true;
      } catch {
        shouldNotify = true;
      }
      if (shouldNotify) {
        await this.inAppNotificationsService.create({
          userId: jobOwner.userId,
          companyId,
          type: NotificationType.APPLICATION_SUBMITTED,
          title: `New application from ${candidateName}`,
          body: `${candidateName} applied for ${app.job.title}`,
          relatedEntityType: 'application',
          relatedEntityId: id,
          actionUrl: `/applications/${id}`,
        });
      }
    }

    return result;
  }

  async getSummary(companyId: string) {
    const counts = await this.prisma.application.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { id: true },
    });
    const result: Record<string, number> = {};
    for (const row of counts) result[row.status.toLowerCase()] = row._count.id;
    const total = counts.reduce((acc, row) => acc + row._count.id, 0);

    const byJob = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: { companyId, deletedAt: null, status: { notIn: [ApplicationStatus.ARCHIVED] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    return { total, ...result, byJob: byJob.map((r) => ({ jobId: r.jobId, count: r._count.id })) };
  }

  private mapToListItem(app: any) {
    return {
      id: app.id,
      applicationNumber: app.applicationNumber,
      publicReference: app.publicReference,
      status: app.status,
      source: app.source,
      submittedAt: app.submittedAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      version: app.version,
      candidate: app.candidate
        ? {
            id: app.candidate.id,
            firstName: app.candidate.firstName,
            lastName: app.candidate.lastName,
            displayName: `${app.candidate.firstName} ${app.candidate.lastName}`,
            headline: app.candidate.headline,
          }
        : null,
      job: app.job ? { id: app.job.id, title: app.job.title, jobCode: app.job.jobCode } : null,
      currentStage: app.currentStage ?? null,
      assignments: (app.assignments ?? []).map((a: any) => ({
        id: a.id,
        type: a.type,
        membershipId: a.membershipId,
        member: a.membership,
      })),
      activeFlags: (app.flags ?? []).map((f: any) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
      })),
      screeningAnswerCount: app._count?.screeningAnswers ?? 0,
    };
  }

  private mapToDetail(app: any) {
    return {
      ...this.mapToListItem(app),
      coverLetter: app.coverLetter,
      consentConfirmed: app.consentConfirmed,
      expectedSalaryMin: app.expectedSalaryMin ? Number(app.expectedSalaryMin) : null,
      expectedSalaryMax: app.expectedSalaryMax ? Number(app.expectedSalaryMax) : null,
      salaryCurrency: app.salaryCurrency,
      noticePeriodDays: app.noticePeriodDays,
      withdrawnAt: app.withdrawnAt,
      withdrawalReason: app.withdrawalReason,
      rejectedAt: app.rejectedAt,
      rejectionReasonCode: app.rejectionReasonCode,
      hiredAt: app.hiredAt,
      archivedAt: app.archivedAt,
      companyCandidate: app.companyCandidate
        ? {
            id: app.companyCandidate.id,
            status: app.companyCandidate.status,
            rating: app.companyCandidate.rating ? Number(app.companyCandidate.rating) : null,
            talentPoolEnabled: app.companyCandidate.talentPoolEnabled,
            doNotContact: app.companyCandidate.doNotContact,
            tags: (app.companyCandidate.tags ?? []).map((t: any) => ({
              id: t.id,
              tagId: t.tagId,
              name: t.tag?.name,
              color: t.tag?.color,
              type: t.tag?.type,
            })),
            owner: app.companyCandidate.owner,
          }
        : null,
      stageHistory: app.stageHistory ?? [],
      notes: (app.notes ?? []).map((n: any) => ({
        id: n.id,
        content: n.content,
        visibility: n.visibility,
        authorMembershipId: n.authorMembershipId,
        createdAt: n.createdAt,
        editedAt: n.editedAt,
      })),
      flags: app.flags ?? [],
      screeningAnswers: (app.screeningAnswers ?? []).map((a: any) => ({
        id: a.id,
        questionId: a.questionId,
        textAnswer: a.textAnswer,
        numericAnswer: a.numericAnswer ? Number(a.numericAnswer) : null,
        dateAnswer: a.dateAnswer,
        answer: a.answer,
        isComplete: a.isComplete,
      })),
      decisions: (app.decisions ?? []).map((d: any) => ({
        id: d.id,
        type: d.type,
        actorType: d.actorType,
        explanation: d.explanation,
        reasonCode: d.reasonCode,
        score: d.score ? Number(d.score) : null,
        finalDecision: d.finalDecision,
        overriddenDecisionId: d.overriddenDecisionId,
        createdAt: d.createdAt,
      })),
      tags: (app.tagAssignments ?? []).map((t: any) => ({
        id: t.id,
        tagId: t.tagId,
        name: t.tag?.name,
        color: t.tag?.color,
        type: t.tag?.type,
      })),
      pipeline: app.job?.pipeline ?? null,
    };
  }
}
