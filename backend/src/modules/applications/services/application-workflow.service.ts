import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationStatus,
  ApplicationActorType,
  ApplicationAuditEventType,
  PipelineStageType,
  Prisma,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';

// Status transition rules
const ALLOWED_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  DRAFT: [ApplicationStatus.SUBMITTED, ApplicationStatus.ARCHIVED],
  SUBMITTED: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SCREENING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  UNDER_REVIEW: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SCREENING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  SCREENING: [
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  SHORTLISTED: [
    ApplicationStatus.ASSESSMENT,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  ASSESSMENT: [
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  INTERVIEW: [
    ApplicationStatus.OFFER,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  OFFER: [
    ApplicationStatus.HIRED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ],
  ON_HOLD: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SCREENING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  REJECTED: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.SHORTLISTED], // restore
  HIRED: [], // terminal
  WITHDRAWN: [], // terminal
  DISQUALIFIED: [], // terminal
  ARCHIVED: [], // non-active
};

const TERMINAL_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.HIRED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.DISQUALIFIED,
];

// Map application status to pipeline stage types for guidance
const STATUS_TO_STAGE_TYPE: Partial<Record<ApplicationStatus, PipelineStageType[]>> = {
  SUBMITTED: [PipelineStageType.APPLIED],
  UNDER_REVIEW: [PipelineStageType.APPLIED, PipelineStageType.SCREENING],
  SCREENING: [PipelineStageType.SCREENING],
  SHORTLISTED: [
    PipelineStageType.SCREENING,
    PipelineStageType.RECRUITER_INTERVIEW,
    PipelineStageType.TECHNICAL_INTERVIEW,
  ],
  ASSESSMENT: [PipelineStageType.ASSESSMENT],
  INTERVIEW: [
    PipelineStageType.RECRUITER_INTERVIEW,
    PipelineStageType.TECHNICAL_INTERVIEW,
    PipelineStageType.FINAL_INTERVIEW,
    PipelineStageType.AI_INTERVIEW,
    PipelineStageType.REFERENCE_CHECK,
  ],
  OFFER: [PipelineStageType.OFFER],
  HIRED: [PipelineStageType.HIRED],
  REJECTED: [PipelineStageType.REJECTED],
};

@Injectable()
export class ApplicationWorkflowService {
  private readonly logger = new Logger(ApplicationWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async transition(params: {
    applicationId: string;
    companyId: string;
    toStatus: ApplicationStatus;
    toStageId?: string;
    actorType: ApplicationActorType;
    actorUserId?: string;
    actorMembershipId?: string;
    reasonCode?: string;
    notes?: string;
    expectedVersion: number;
    requestId?: string;
    additionalData?: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.findFirst({
        where: { id: params.applicationId, companyId: params.companyId, deletedAt: null },
        include: { currentStage: true },
      });

      if (!app) throw new NotFoundException('APPLICATION_NOT_FOUND');
      if (app.version !== params.expectedVersion) {
        throw new ConflictException({
          code: 'APPLICATION_STALE_VERSION',
          message: 'Application was modified. Refresh and retry.',
          currentVersion: app.version,
        });
      }

      if (TERMINAL_STATUSES.includes(app.status as ApplicationStatus)) {
        throw new BadRequestException({
          code: 'APPLICATION_STATUS_TRANSITION_INVALID',
          message: `Cannot transition from terminal status ${app.status}`,
        });
      }

      const allowed = ALLOWED_TRANSITIONS[app.status as ApplicationStatus] ?? [];
      if (!allowed.includes(params.toStatus)) {
        throw new BadRequestException({
          code: 'APPLICATION_STATUS_TRANSITION_INVALID',
          message: `Cannot transition from ${app.status} to ${params.toStatus}`,
        });
      }

      // Validate toStageId belongs to this job's pipeline
      let resolvedStageId = params.toStageId ?? app.currentStageId;
      if (params.toStageId) {
        const stage = await tx.jobPipelineStage.findFirst({
          where: { id: params.toStageId, deletedAt: null, pipeline: { jobId: app.jobId } },
        });
        if (!stage)
          throw new BadRequestException({
            code: 'APPLICATION_STAGE_INVALID',
            message: 'Stage does not belong to this job pipeline',
          });
        resolvedStageId = stage.id;
      }

      // Build update data
      const now = new Date();
      const updateData: Record<string, unknown> = {
        status: params.toStatus,
        currentStageId: resolvedStageId,
        version: app.version + 1,
        ...(params.additionalData ?? {}),
      };

      if (params.toStatus === ApplicationStatus.REJECTED) updateData.rejectedAt = now;
      if (params.toStatus === ApplicationStatus.WITHDRAWN) updateData.withdrawnAt = now;
      if (params.toStatus === ApplicationStatus.HIRED) updateData.hiredAt = now;
      if (params.toStatus === ApplicationStatus.DISQUALIFIED) updateData.disqualifiedAt = now;
      if (params.toStatus === ApplicationStatus.ARCHIVED) updateData.archivedAt = now;

      await tx.application.update({
        where: { id: params.applicationId },
        data: updateData as Prisma.ApplicationUpdateInput,
      });

      // Write stage history
      await tx.applicationStageHistory.create({
        data: {
          applicationId: params.applicationId,
          fromStageId: app.currentStageId ?? null,
          toStageId: resolvedStageId ?? app.currentStageId!,
          fromStatus: app.status as ApplicationStatus,
          toStatus: params.toStatus,
          actorType: params.actorType,
          actorUserId: params.actorUserId ?? null,
          actorMembershipId: params.actorMembershipId ?? null,
          reasonCode: params.reasonCode ?? null,
          notes: params.notes ?? null,
        },
      });

      // Audit
      await this.auditService.record({
        companyId: params.companyId,
        applicationId: params.applicationId,
        candidateId: app.candidateId,
        actorType: params.actorType,
        actorUserId: params.actorUserId,
        actorMembershipId: params.actorMembershipId,
        eventType: this.statusToAuditEvent(params.toStatus),
        entityType: 'Application',
        entityId: params.applicationId,
        description: `Application status changed from ${app.status} to ${params.toStatus}`,
        metadata: {
          fromStatus: app.status,
          toStatus: params.toStatus,
          reasonCode: params.reasonCode,
        },
        requestId: params.requestId,
        tx,
      });

      return { success: true, newVersion: app.version + 1, status: params.toStatus };
    });
  }

  private statusToAuditEvent(status: ApplicationStatus): ApplicationAuditEventType {
    switch (status) {
      case ApplicationStatus.SUBMITTED:
        return ApplicationAuditEventType.APPLICATION_SUBMITTED;
      case ApplicationStatus.SHORTLISTED:
        return ApplicationAuditEventType.APPLICATION_SHORTLISTED;
      case ApplicationStatus.REJECTED:
        return ApplicationAuditEventType.APPLICATION_REJECTED;
      case ApplicationStatus.WITHDRAWN:
        return ApplicationAuditEventType.APPLICATION_WITHDRAWN;
      case ApplicationStatus.HIRED:
        return ApplicationAuditEventType.APPLICATION_HIRED;
      case ApplicationStatus.ARCHIVED:
        return ApplicationAuditEventType.APPLICATION_ARCHIVED;
      default:
        return ApplicationAuditEventType.APPLICATION_STAGE_CHANGED;
    }
  }
}
