import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  InterviewStatus,
  InterviewResult,
  InterviewHistoryEventType,
  InterviewParticipantRole,
  Prisma,
} from '@prisma/client';
import { CreateInterviewDto } from '../dto/create-interview.dto';
import {
  UpdateInterviewDto,
  RescheduleInterviewDto,
  CancelInterviewDto,
  CompleteInterviewDto,
  StartInterviewDto,
} from '../dto/update-interview.dto';
import { InterviewQueryDto } from '../dto/interview-query.dto';
import { InterviewConflictService } from './interview-conflict.service';

// FIX 6: Complete state machine — allowed transitions
const ALLOWED_TRANSITIONS: Partial<Record<InterviewStatus, InterviewStatus[]>> = {
  [InterviewStatus.SCHEDULED]: [
    InterviewStatus.CONFIRMED,
    InterviewStatus.RESCHEDULED,
    InterviewStatus.CANCELLED,
    InterviewStatus.NO_SHOW,
    InterviewStatus.EXPIRED,
  ],
  [InterviewStatus.CONFIRMED]: [
    InterviewStatus.IN_PROGRESS,
    InterviewStatus.RESCHEDULED,
    InterviewStatus.CANCELLED,
    InterviewStatus.NO_SHOW,
  ],
  [InterviewStatus.RESCHEDULED]: [
    InterviewStatus.CONFIRMED,
    InterviewStatus.CANCELLED,
    InterviewStatus.NO_SHOW,
    InterviewStatus.EXPIRED,
  ],
  [InterviewStatus.IN_PROGRESS]: [
    InterviewStatus.COMPLETED,
    InterviewStatus.NO_SHOW,
    InterviewStatus.CANCELLED,
  ],
  // Terminal states — no further transitions
  [InterviewStatus.COMPLETED]: [],
  [InterviewStatus.CANCELLED]: [],
  [InterviewStatus.NO_SHOW]: [],
  [InterviewStatus.EXPIRED]: [],
};

const TERMINAL_STATUSES: InterviewStatus[] = [
  InterviewStatus.CANCELLED,
  InterviewStatus.COMPLETED,
  InterviewStatus.EXPIRED,
  InterviewStatus.NO_SHOW,
];

// FIX 8: Result → suggested application workflow action
const RESULT_TO_SUGGESTED_ACTION: Partial<Record<InterviewResult, string>> = {
  [InterviewResult.PASS]: 'ADVANCE',
  [InterviewResult.FAIL]: 'REJECT_OR_HOLD',
  [InterviewResult.HOLD]: 'HOLD',
  [InterviewResult.PENDING]: 'NONE',
  [InterviewResult.NOT_RECORDED]: 'NONE',
};

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictService: InterviewConflictService,
  ) {}

  /**
   * Runs an interactive transaction at Serializable isolation. Two
   * simultaneous scheduling requests for the same exclusive participant can
   * both pass the overlap check on the same snapshot; the losing transaction
   * then aborts at commit with a write-conflict error (P2034). That abort is
   * surfaced as a 409 slot conflict instead of a 500.
   */
  private runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma
      .$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
          throw new ConflictException({
            code: 'INTERVIEW_SLOT_CONFLICT',
            message:
              'This time slot was just taken by a concurrent scheduling request. Please pick another slot.',
            conflicts: [],
          });
        }
        throw err;
      });
  }

  async create(
    dto: CreateInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
    requestId?: string,
  ) {
    // Validate application belongs to company
    const application = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, companyId, deletedAt: null },
      include: {
        job: {
          include: {
            pipeline: {
              include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });
    if (!application)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    // Validate scheduled time is future
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException({
        code: 'INTERVIEW_PAST_SCHEDULE',
        message: 'Interview must be scheduled in the future',
      });
    }

    // Validate stage belongs to job pipeline
    if (dto.jobPipelineStageId) {
      const stage = await this.prisma.jobPipelineStage.findFirst({
        where: {
          id: dto.jobPipelineStageId,
          pipeline: { jobId: application.jobId },
          deletedAt: null,
        },
      });
      if (!stage)
        throw new BadRequestException({
          code: 'INTERVIEW_STAGE_INVALID',
          message: 'Stage does not belong to the job pipeline',
        });
    }

    // Check for duplicate active interview in same stage
    if (dto.jobPipelineStageId) {
      const duplicate = await this.prisma.interview.findFirst({
        where: {
          applicationId: dto.applicationId,
          jobPipelineStageId: dto.jobPipelineStageId,
          status: { notIn: TERMINAL_STATUSES },
          deletedAt: null,
        },
      });
      if (duplicate)
        throw new ConflictException({
          code: 'INTERVIEW_DUPLICATE_STAGE',
          message: 'An active interview already exists for this stage',
        });
    }

    const scheduledStart = scheduledAt;
    const scheduledEnd = new Date(scheduledAt.getTime() + dto.durationMinutes * 60000);

    return this.runSerializable(async (tx) => {
      // Validate participants against the company BEFORE any writes.
      const participantMembershipIds: string[] = [];
      if (dto.participants?.length) {
        for (const p of dto.participants) {
          const mem = await tx.companyMembership.findFirst({
            where: { id: p.membershipId, companyId, status: 'ACTIVE' },
          });
          if (!mem)
            throw new BadRequestException(`Participant ${p.membershipId} is not an active member`);
          participantMembershipIds.push(p.membershipId);
        }
      }

      // Tenant-scoped slot conflict check (candidate + assigned participants).
      // Runs inside a Serializable transaction so simultaneous requests for
      // the same exclusive participant cannot both succeed.
      await this.conflictService.assertNoConflict(tx, {
        companyId,
        candidateId: application.candidateId,
        membershipIds: participantMembershipIds,
        newStart: scheduledStart,
        newEnd: scheduledEnd,
      });

      const interview = await tx.interview.create({
        data: {
          companyId,
          applicationId: dto.applicationId,
          jobId: application.jobId,
          jobPipelineStageId: dto.jobPipelineStageId ?? null,
          type: dto.type,
          status: InterviewStatus.SCHEDULED,
          result: InterviewResult.NOT_RECORDED,
          title: dto.title,
          description: dto.description ?? null,
          location: dto.location ?? null,
          meetingProvider: dto.meetingProvider ?? null,
          meetingLink: dto.meetingLink ?? null,
          meetingId: dto.meetingId ?? null,
          scheduledAt,
          durationMinutes: dto.durationMinutes,
          timezone: dto.timezone,
          language: dto.language ?? 'en',
          notes: dto.notes ?? null,
          privateNotes: dto.privateNotes ?? null,
          createdByMembershipId: membershipId,
        },
      });

      // Add participants
      if (dto.participants?.length) {
        for (const p of dto.participants) {
          await tx.interviewParticipant.create({
            data: {
              interviewId: interview.id,
              membershipId: p.membershipId,
              role: p.role,
              isRequired: p.isRequired ?? true,
              notes: p.notes ?? null,
              addedByMembershipId: membershipId,
            },
          });
        }
      }

      // History
      await tx.interviewHistory.create({
        data: {
          interviewId: interview.id,
          eventType: InterviewHistoryEventType.INTERVIEW_SCHEDULED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: `Interview "${interview.title}" scheduled for ${scheduledAt.toISOString()}`,
          metadata: { type: dto.type, timezone: dto.timezone } as Prisma.InputJsonValue,
          requestId: requestId ?? null,
        },
      });

      return this.findById(interview.id, companyId, tx);
    });
  }

  async findAll(query: InterviewQueryDto, companyId: string) {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      applicationId,
      jobId,
      stageId,
      scheduledFrom,
      scheduledTo,
      sortBy = 'scheduledAt',
      sortOrder = 'asc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InterviewWhereInput = { companyId, deletedAt: null };
    if (status?.length) where.status = { in: status };
    if (type?.length) where.type = { in: type };
    if (applicationId) where.applicationId = applicationId;
    if (jobId) where.jobId = jobId;
    if (stageId) where.jobPipelineStageId = stageId;
    if (scheduledFrom || scheduledTo) {
      where.scheduledAt = {};
      if (scheduledFrom) where.scheduledAt.gte = new Date(scheduledFrom);
      if (scheduledTo) where.scheduledAt.lte = new Date(scheduledTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.interview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          participants: {
            include: {
              membership: {
                select: {
                  id: true,
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
          stage: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.interview.count({ where }),
    ]);

    return {
      data: data.map((i) => this.mapToListItem(i)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const interview = await (client as any).interview.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        application: {
          select: { id: true, applicationNumber: true, status: true, candidateId: true },
        },
        job: { select: { id: true, title: true, jobCode: true } },
        stage: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            membership: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        history: { orderBy: { occurredAt: 'desc' }, take: 50 },
        createdBy: {
          select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
        },
        updatedBy: {
          select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    return this.mapToDetail(interview);
  }

  async findByApplication(applicationId: string, companyId: string) {
    // Validate application belongs to company
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    const interviews = await this.prisma.interview.findMany({
      where: { applicationId, companyId, deletedAt: null },
      orderBy: { scheduledAt: 'asc' },
      include: {
        stage: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            membership: {
              select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    return { data: interviews.map((i) => this.mapToListItem(i)) };
  }

  async update(
    id: string,
    dto: UpdateInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    if (TERMINAL_STATUSES.includes(interview.status)) {
      throw new BadRequestException({
        code: 'INTERVIEW_TERMINAL_STATE',
        message: 'Cannot update a terminal-state interview',
      });
    }
    if (interview.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
          ...(dto.location !== undefined ? { location: dto.location ?? null } : {}),
          ...(dto.meetingProvider !== undefined
            ? { meetingProvider: dto.meetingProvider ?? null }
            : {}),
          ...(dto.meetingLink !== undefined ? { meetingLink: dto.meetingLink ?? null } : {}),
          ...(dto.meetingId !== undefined ? { meetingId: dto.meetingId ?? null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          ...(dto.privateNotes !== undefined ? { privateNotes: dto.privateNotes ?? null } : {}),
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_UPDATED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: 'Interview details updated',
        },
      });
      return updated;
    });
  }

  async reschedule(
    id: string,
    dto: RescheduleInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });

    // FIX 6: Validate transition using state machine
    this.validateTransition(interview.status, InterviewStatus.RESCHEDULED);

    if (interview.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException({
        code: 'INTERVIEW_PAST_SCHEDULE',
        message: 'Interview must be scheduled in the future',
      });
    }

    const newEnd = new Date(
      scheduledAt.getTime() + (dto.durationMinutes ?? interview.durationMinutes) * 60000,
    );

    // Tenant-scoped overlap validation for the candidate and the interview's
    // explicitly assigned participants. The interview itself is excluded.
    return this.runSerializable(async (tx) => {
      const application = await tx.application.findFirst({
        where: { id: interview.applicationId, companyId, deletedAt: null },
        select: { candidateId: true },
      });

      const participants = await tx.interviewParticipant.findMany({
        where: {
          interviewId: id,
          membershipId: { not: null },
          status: { notIn: ['DECLINED', 'CANCELLED'] },
        },
        select: { membershipId: true },
      });

      await this.conflictService.assertNoConflict(tx, {
        companyId,
        candidateId: application?.candidateId ?? '',
        membershipIds: participants
          .map((p) => p.membershipId)
          .filter((m): m is string => Boolean(m)),
        newStart: scheduledAt,
        newEnd,
        excludeInterviewId: id,
      });

      const updated = await tx.interview.update({
        where: { id },
        data: {
          scheduledAt,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.location !== undefined ? { location: dto.location ?? null } : {}),
          ...(dto.meetingLink !== undefined ? { meetingLink: dto.meetingLink ?? null } : {}),
          ...(dto.meetingProvider !== undefined
            ? { meetingProvider: dto.meetingProvider ?? null }
            : {}),
          status: InterviewStatus.RESCHEDULED,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_RESCHEDULED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: `Interview rescheduled to ${scheduledAt.toISOString()}`,
          metadata: {
            previousScheduledAt: interview.scheduledAt.toISOString(),
            newScheduledAt: scheduledAt.toISOString(),
            reason: dto.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async cancel(
    id: string,
    dto: CancelInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    if (interview.status === InterviewStatus.CANCELLED) {
      return { alreadyCancelled: true };
    }
    // FIX 6: state machine validation
    this.validateTransition(interview.status, InterviewStatus.CANCELLED);
    if (interview.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.CANCELLED,
          cancelReason: dto.reason ?? null,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_CANCELLED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: 'Interview cancelled',
          metadata: { reason: dto.reason ?? null } as Prisma.InputJsonValue,
        },
      });
      return { cancelled: true, applicationId: interview.applicationId };
    });
  }

  async complete(
    id: string,
    dto: CompleteInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    // FIX 6: state machine validation
    this.validateTransition(interview.status, InterviewStatus.COMPLETED);
    if (interview.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.COMPLETED,
          completedAt: new Date(),
          resultNotes: dto.resultNotes ?? null,
          resultReasonCode: dto.resultReasonCode ?? null,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_COMPLETED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: 'Interview completed',
        },
      });
      return { completed: true, applicationId: interview.applicationId };
    });
  }

  async start(
    id: string,
    dto: StartInterviewDto,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    this.validateTransition(interview.status, InterviewStatus.IN_PROGRESS);
    if (interview.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.IN_PROGRESS,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_STARTED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: 'Interview started',
        },
      });
      return { started: true };
    });
  }

  async confirm(
    id: string,
    expectedVersion: number,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    this.validateTransition(interview.status, InterviewStatus.CONFIRMED);
    if (interview.version !== expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.CONFIRMED,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_CONFIRMED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: 'Interview confirmed',
        },
      });
      return { confirmed: true };
    });
  }

  // FIX 8: Record result + return suggested application workflow action (human decides)
  async recordResult(
    id: string,
    result: InterviewResult,
    resultNotes: string | undefined,
    expectedVersion: number,
    companyId: string,
    userId: string,
    membershipId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    if (interview.status !== InterviewStatus.COMPLETED) {
      throw new BadRequestException({
        code: 'INTERVIEW_RESULT_INVALID',
        message: 'Result can only be recorded for completed interviews',
      });
    }
    if (interview.version !== expectedVersion) {
      throw new ConflictException({
        code: 'INTERVIEW_STALE_VERSION',
        message: 'Stale version',
        currentVersion: interview.version,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.interview.update({
        where: { id },
        data: {
          result,
          resultNotes: resultNotes ?? null,
          updatedByMembershipId: membershipId,
          version: interview.version + 1,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId: id,
          eventType: InterviewHistoryEventType.INTERVIEW_RESULT_RECORDED,
          actorUserId: userId,
          actorMembershipId: membershipId,
          description: `Interview result recorded: ${result}`,
          metadata: { result, resultNotes: resultNotes ?? null } as Prisma.InputJsonValue,
        },
      });
      return upd;
    });

    // FIX 8: Return suggested action — recruiter decides whether to advance the application
    const suggestedAction = RESULT_TO_SUGGESTED_ACTION[result] ?? 'NONE';
    return {
      result,
      version: updated.version,
      suggestedApplicationAction: suggestedAction,
      message:
        suggestedAction !== 'NONE'
          ? `Suggested: ${suggestedAction}. Call POST /applications/${interview.applicationId}/... to advance.`
          : 'No suggested action. Recruiter review required.',
    };
  }

  // FIX 6: state machine helper
  private validateTransition(from: InterviewStatus, to: InterviewStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException({
        code: 'INTERVIEW_STATUS_TRANSITION_INVALID',
        message: `Cannot transition from ${from} to ${to}`,
      });
    }
  }

  async addParticipant(
    interviewId: string,
    companyId: string,
    membershipId: string,
    role: InterviewParticipantRole,
    isRequired: boolean,
    notes: string | undefined,
    actorMembershipId: string,
    actorUserId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });
    if (TERMINAL_STATUSES.includes(interview.status)) {
      throw new BadRequestException({
        code: 'INTERVIEW_TERMINAL_STATE',
        message: 'Cannot add participants to a terminal-state interview',
      });
    }

    const member = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId, status: 'ACTIVE' },
    });
    if (!member)
      throw new BadRequestException({
        code: 'INTERVIEW_PARTICIPANT_INVALID',
        message: 'Participant must be an active member of this company',
      });

    const existing = await this.prisma.interviewParticipant.findUnique({
      where: { interviewId_membershipId: { interviewId, membershipId } },
    });
    if (existing)
      throw new ConflictException({
        code: 'INTERVIEW_PARTICIPANT_EXISTS',
        message: 'Participant already added to this interview',
      });

    return this.prisma.$transaction(async (tx) => {
      const p = await tx.interviewParticipant.create({
        data: {
          interviewId,
          membershipId,
          role,
          isRequired,
          notes: notes ?? null,
          addedByMembershipId: actorMembershipId,
        },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId,
          eventType: InterviewHistoryEventType.PARTICIPANT_ADDED,
          actorUserId,
          actorMembershipId,
          description: `Participant added with role ${role}`,
          metadata: { membershipId, role } as Prisma.InputJsonValue,
        },
      });
      return p;
    });
  }

  async removeParticipant(
    interviewId: string,
    participantId: string,
    companyId: string,
    actorMembershipId: string,
    actorUserId: string,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, companyId, deletedAt: null },
    });
    if (!interview)
      throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' });

    const participant = await this.prisma.interviewParticipant.findFirst({
      where: { id: participantId, interviewId },
    });
    if (!participant)
      throw new NotFoundException({
        code: 'INTERVIEW_PARTICIPANT_NOT_FOUND',
        message: 'Participant not found',
      });

    return this.prisma.$transaction(async (tx) => {
      await tx.interviewParticipant.delete({ where: { id: participantId } });
      await tx.interviewHistory.create({
        data: {
          interviewId,
          eventType: InterviewHistoryEventType.PARTICIPANT_REMOVED,
          actorUserId,
          actorMembershipId,
          description: `Participant removed (role: ${participant.role})`,
        },
      });
      return { removed: true };
    });
  }

  private mapToListItem(i: any) {
    return {
      id: i.id,
      title: i.title,
      type: i.type,
      status: i.status,
      result: i.result,
      scheduledAt: i.scheduledAt,
      durationMinutes: i.durationMinutes,
      timezone: i.timezone,
      location: i.location,
      meetingProvider: i.meetingProvider,
      applicationId: i.applicationId,
      jobId: i.jobId,
      stage: i.stage ?? null,
      version: i.version,
      participants: (i.participants ?? []).map((p: any) => ({
        id: p.id,
        role: p.role,
        status: p.status,
        isRequired: p.isRequired,
        member: p.membership
          ? {
              id: p.membership.id,
              name: `${p.membership.user?.firstName} ${p.membership.user?.lastName}`,
            }
          : null,
      })),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  private mapToDetail(i: any) {
    return {
      ...this.mapToListItem(i),
      description: i.description,
      notes: i.notes,
      // privateNotes intentionally included in detail for recruiters
      privateNotes: i.privateNotes,
      meetingLink: i.meetingLink,
      meetingId: i.meetingId,
      completedAt: i.completedAt,
      cancelReason: i.cancelReason,
      resultNotes: i.resultNotes,
      resultReasonCode: i.resultReasonCode,
      language: i.language,
      application: i.application ?? null,
      job: i.job ?? null,
      history: (i.history ?? []).map((h: any) => ({
        id: h.id,
        eventType: h.eventType,
        description: h.description,
        actorMembershipId: h.actorMembershipId,
        occurredAt: h.occurredAt,
      })),
      createdBy: i.createdBy ?? null,
      updatedBy: i.updatedBy ?? null,
    };
  }
}
