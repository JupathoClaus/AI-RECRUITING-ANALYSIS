import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  Prisma,
  AssessmentAssignmentStatus,
  AssessmentSessionStatus,
  ApplicationAuditEventType,
  ApplicationActorType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { QueueService } from '@modules/queue/queue.service';
import { AssessmentsService, AssessmentActor } from './assessments.service';
import { AssessmentCodeService } from './assessment-code.service';
import { ASSESSMENT_QUEUE, ASSESSMENT_BULK_ASSIGN_JOB } from '../queue/assessment-queue.constants';
import { AssignAssessmentDto, BulkAssignAssessmentDto } from '../dto/assignment.dto';

/**
 * Application-specific assignment. One application × one published version is
 * unique (DB constraint), so double-clicks and retried bulk rows collapse to
 * the same assignment. Bulk assignment is asynchronous: the request only
 * validates and enqueues; the processor fans out in bounded chunks.
 */
@Injectable()
export class AssessmentAssignmentsService {
  private readonly logger = new Logger(AssessmentAssignmentsService.name);
  private readonly maxBulkAssign: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly assessments: AssessmentsService,
    private readonly codes: AssessmentCodeService,
    private readonly audit: ApplicationAuditService,
    private readonly queueService: QueueService,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly assessmentQueue: Queue,
  ) {
    this.maxBulkAssign = this.configService.get<number>('assessment.maxBulkAssign') || 500;
  }

  async assign(versionId: string, dto: AssignAssessmentDto, actor: AssessmentActor) {
    const version = await this.assessments.requirePublishedVersion(versionId, actor.companyId);
    const application = await this.requireCompanyApplication(dto.applicationId, actor.companyId);

    const existing = await this.prisma.assessmentAssignment.findUnique({
      where: { applicationId_versionId: { applicationId: application.id, versionId: version.id } },
      include: { sessions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existing) return this.toAssignmentDto(existing);

    const dueAt = this.parseDueAt(dto.dueAt);
    const code = this.codes.generate();

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessmentAssignment.create({
        data: {
          companyId: actor.companyId,
          applicationId: application.id,
          versionId: version.id,
          status: AssessmentAssignmentStatus.ASSIGNED,
          dueAt,
          assignedByMembershipId: actor.membershipId,
        },
      });
      await tx.assessmentSession.create({
        data: {
          assignmentId: created.id,
          companyId: actor.companyId,
          applicationId: application.id,
          codeHash: this.codes.hash(code),
          codeDisplayHint: this.codes.displayHint(code),
          status: AssessmentSessionStatus.NOT_STARTED,
          attemptNumber: 1,
        },
      });
      return created;
    });

    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_ASSIGNED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AssessmentAssignment',
      entityId: assignment.id,
      description: `Assessment assigned: ${version.assessment.name} v${version.versionNumber}`,
      applicationId: application.id,
      candidateId: application.candidateId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });

    this.queueCandidateEmail(application, version.assessment.name, code).catch(() => undefined);
    return this.toAssignmentDto({ ...assignment, sessions: [] as never[] }, code);
  }

  async bulkAssign(versionId: string, dto: BulkAssignAssessmentDto, actor: AssessmentActor) {
    const version = await this.assessments.requirePublishedVersion(versionId, actor.companyId);
    const uniqueIds = [...new Set(dto.applicationIds)];
    if (uniqueIds.length > this.maxBulkAssign) {
      throw new BadRequestException({
        code: 'BULK_TOO_LARGE',
        message: `Bulk assignment is limited to ${this.maxBulkAssign} applications per request.`,
      });
    }
    if (dto.dueAt) this.parseDueAt(dto.dueAt);

    const bulkJobId = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          versionId,
          ids: [...uniqueIds].sort(),
          dueAt: dto.dueAt ?? null,
          by: actor.membershipId,
        }),
      )
      .digest('hex');

    const existingJob = await this.assessmentQueue.getJob(`bulk-assign-${bulkJobId}`);
    if (existingJob) {
      const state = await existingJob.getState();
      return {
        jobId: existingJob.id,
        state,
        deduplicated: true,
        version: { id: version.id, versionNumber: version.versionNumber },
      };
    }

    const job = await this.assessmentQueue.add(
      ASSESSMENT_BULK_ASSIGN_JOB,
      {
        versionId: version.id,
        companyId: actor.companyId,
        applicationIds: uniqueIds,
        dueAt: dto.dueAt ?? null,
        requestedByMembershipId: actor.membershipId,
        requestedByUserId: actor.userId,
      },
      { jobId: `bulk-assign-${bulkJobId}`, removeOnComplete: 100, removeOnFail: 50 },
    );
    this.logger.log(
      `Bulk assign queued: ${uniqueIds.length} applications for version ${version.id}`,
    );
    return {
      jobId: job.id,
      state: 'waiting',
      deduplicated: false,
      version: { id: version.id, versionNumber: version.versionNumber },
    };
  }

  async getBulkJob(jobId: string, companyId: string) {
    const job = await this.assessmentQueue.getJob(jobId);
    if (!job || job.data?.companyId !== companyId) {
      throw new NotFoundException({
        code: 'BULK_JOB_NOT_FOUND',
        message: 'Bulk assignment job not found.',
      });
    }
    const state = await job.getState();
    return {
      jobId: job.id,
      name: job.name,
      state,
      progress: job.progress,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }

  async listAssignments(
    companyId: string,
    query: {
      assessmentId?: string;
      applicationId?: string;
      status?: AssessmentAssignmentStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.AssessmentAssignmentWhereInput = { companyId };
    if (query.applicationId) where.applicationId = query.applicationId;
    if (query.status) where.status = query.status;
    if (query.assessmentId) where.version = { assessmentId: query.assessmentId };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.assessmentAssignment.count({ where }),
      this.prisma.assessmentAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          version: {
            select: {
              id: true,
              versionNumber: true,
              assessment: { select: { id: true, name: true } },
            },
          },
          application: {
            select: {
              id: true,
              status: true,
              job: { select: { id: true, title: true } },
              candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          sessions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              startedAt: true,
              submittedAt: true,
              expiresAt: true,
              result: { select: { totalScore: true, evaluatedAt: true } },
            },
          },
        },
      }),
    ]);
    const data = items.map((a) => this.toAssignmentDto(a));
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Retake (recruiter-controlled; honors maxAttempts) ─────────

  async createRetake(assignmentId: string, actor: AssessmentActor) {
    const assignment = await this.prisma.assessmentAssignment.findFirst({
      where: { id: assignmentId, companyId: actor.companyId },
      include: {
        sessions: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        version: {
          include: { assessment: { select: { id: true, name: true, maxAttempts: true } } },
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Assignment not found.',
      });
    }
    const latest = assignment.sessions[0];
    if (
      latest &&
      (latest.status === AssessmentSessionStatus.NOT_STARTED ||
        latest.status === AssessmentSessionStatus.IN_PROGRESS)
    ) {
      throw new ConflictException({
        code: 'SESSION_ACTIVE',
        message: 'The current session is still active.',
      });
    }
    const usedAttempts = latest?.attemptNumber ?? 0;
    if (usedAttempts >= assignment.version.assessment.maxAttempts) {
      throw new ConflictException({
        code: 'MAX_ATTEMPTS_REACHED',
        message: 'Maximum attempts for this assessment have been used.',
      });
    }
    if (assignment.status === AssessmentAssignmentStatus.EVALUATED) {
      throw new ConflictException({
        code: 'ASSIGNMENT_EVALUATED',
        message: 'Evaluated assignments cannot be retaken.',
      });
    }
    const code = this.codes.generate();
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessmentSession.create({
        data: {
          assignmentId: assignment.id,
          companyId: actor.companyId,
          applicationId: assignment.applicationId,
          codeHash: this.codes.hash(code),
          codeDisplayHint: this.codes.displayHint(code),
          status: AssessmentSessionStatus.NOT_STARTED,
          attemptNumber: usedAttempts + 1,
        },
      });
      await tx.assessmentAssignment.update({
        where: { id: assignment.id },
        data: { status: AssessmentAssignmentStatus.ASSIGNED },
      });
      return created;
    });
    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_ASSIGNED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AssessmentSession',
      entityId: session.id,
      description: `Assessment retake issued (attempt ${session.attemptNumber}): ${assignment.version.assessment.name}`,
      applicationId: assignment.applicationId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return { sessionId: session.id, attemptNumber: session.attemptNumber, code };
  }

  // ── Used by the bulk processor (single-item, race-safe) ──────────

  async assignOneForBulk(
    versionId: string,
    companyId: string,
    applicationId: string,
    dueAt: Date | null,
    requestedByMembershipId: string,
    requestedByUserId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<{
    outcome: 'assigned' | 'skipped' | 'failed';
    code?: string;
    assignmentId?: string;
    reason?: string;
  }> {
    const tx = txClient ?? this.prisma;
    const application = await tx.application.findFirst({
      where: { id: applicationId, companyId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    });
    if (!application) return { outcome: 'failed', reason: 'APPLICATION_NOT_FOUND' };
    const version = await tx.assessmentVersion.findFirst({
      where: { id: versionId, status: 'PUBLISHED', assessment: { companyId } },
      include: { assessment: { select: { id: true, name: true } } },
    });
    if (!version) return { outcome: 'failed', reason: 'VERSION_NOT_PUBLISHED' };
    const dupe = await tx.assessmentAssignment.findUnique({
      where: { applicationId_versionId: { applicationId, versionId } },
      select: { id: true },
    });
    if (dupe) return { outcome: 'skipped', assignmentId: dupe.id, reason: 'ALREADY_ASSIGNED' };

    const code = this.codes.generate();
    try {
      const created = await tx.assessmentAssignment.create({
        data: {
          companyId,
          applicationId,
          versionId,
          status: AssessmentAssignmentStatus.ASSIGNED,
          dueAt,
          assignedByMembershipId: requestedByMembershipId,
          sessions: {
            create: {
              companyId,
              applicationId,
              codeHash: this.codes.hash(code),
              codeDisplayHint: this.codes.displayHint(code),
              status: AssessmentSessionStatus.NOT_STARTED,
              attemptNumber: 1,
            },
          },
        },
      });
      // Per-row audit + candidate email match the single-assign contract:
      // non-fatal so a bulk row still succeeds if notification fails.
      await this.audit
        .record({
          companyId,
          eventType: ApplicationAuditEventType.ASSESSMENT_ASSIGNED,
          actorType: ApplicationActorType.RECRUITER,
          entityType: 'AssessmentAssignment',
          entityId: created.id,
          description: `Assessment assigned (bulk): ${version.assessment.name} v${version.versionNumber}`,
          applicationId,
          candidateId: application.candidate?.id ?? null,
          actorUserId: requestedByUserId,
          actorMembershipId: requestedByMembershipId,
        })
        .catch(() => undefined);
      const notifiable =
        application.candidate && application.job?.company
          ? {
              candidate: {
                email: application.candidate.email ?? null,
                firstName: application.candidate.firstName,
              },
              job: {
                title: application.job.title,
                company: { name: application.job.company.name },
              },
            }
          : null;
      if (notifiable) {
        this.queueCandidateEmail(notifiable, version.assessment.name, code).catch(() => undefined);
      }
      return { outcome: 'assigned', code, assignmentId: created.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { outcome: 'skipped', reason: 'ALREADY_ASSIGNED' };
      }
      throw error;
    }
  }

  // ── Internals ────────────────────────────────────────────────

  private async requireCompanyApplication(id: string, companyId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, companyId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        job: { select: { id: true, title: true, company: { select: { name: true } } } },
      },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found.',
      });
    }
    return application;
  }

  private parseDueAt(dueAt?: string | null): Date | null {
    if (!dueAt) return null;
    const parsed = new Date(dueAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_DUE_DATE',
        message: 'Due date must be a future date.',
      });
    }
    return parsed;
  }

  private async queueCandidateEmail(
    application: {
      candidate: { email: string | null; firstName: string };
      job: { title: string; company: { name: string } };
    },
    assessmentName: string,
    code: string,
  ): Promise<void> {
    try {
      if (!application.candidate.email) return;
      await this.queueService.addEmailJob('recruitment.assessment-assigned', {
        email: application.candidate.email,
        candidateName: application.candidate.firstName,
        assessmentName,
        jobTitle: application.job.title,
        companyName: application.job.company.name,
        code,
      });
    } catch (error) {
      // Non-fatal: assignment must succeed even if email queues fail.
      this.logger.warn(`Failed to queue assessment email: ${(error as Error).message}`);
    }
  }

  private toAssignmentDto(assignment: Record<string, unknown>, code?: string) {
    const dto = assignment as {
      id: string;
      status: string;
      dueAt: Date | null;
      notifiedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      version?: { id: string; versionNumber: number; assessment?: { id: string; name: string } };
      application?: unknown;
      sessions?: { id: string; status: string; codeDisplayHint?: string | null }[];
    };
    const { ...rest } = dto;
    void rest;
    return {
      id: dto.id,
      status: dto.status,
      dueAt: dto.dueAt,
      notifiedAt: dto.notifiedAt,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      version: dto.version,
      application: dto.application,
      session: dto.sessions?.[0]
        ? {
            id: dto.sessions[0].id,
            status: dto.sessions[0].status,
            codeDisplayHint: dto.sessions[0].codeDisplayHint ?? null,
          }
        : null,
      // The raw code is returned exactly once at creation so the recruiter
      // can share it; only the hash is persisted.
      ...(code ? { code } : {}),
    };
  }
}
