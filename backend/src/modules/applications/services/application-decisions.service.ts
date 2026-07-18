import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationActorType,
  ApplicationAuditEventType,
  ApplicationDecisionType,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';
import { CreateDecisionDto, OverrideDecisionDto } from '../dto/decision.dto';

@Injectable()
export class ApplicationDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async getDecisions(applicationId: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    return this.prisma.applicationDecision.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDecision(
    applicationId: string,
    companyId: string,
    dto: CreateDecisionDto,
    membershipId: string,
    userId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    // Human decisions can be final; AI must not be final by default
    const finalDecision = dto.finalDecision ?? false;

    return this.prisma.$transaction(async (tx) => {
      const decision = await tx.applicationDecision.create({
        data: {
          applicationId,
          type: dto.type,
          actorType: ApplicationActorType.RECRUITER,
          actorUserId: userId,
          actorMembershipId: membershipId,
          reasonCode: dto.reasonCode ?? null,
          explanation: dto.explanation,
          score: dto.score ?? null,
          finalDecision,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        actorUserId: userId,
        eventType: ApplicationAuditEventType.APPLICATION_DECISION_CREATED,
        entityType: 'ApplicationDecision',
        entityId: decision.id,
        description: `Decision ${dto.type} created`,
        metadata: { type: dto.type, finalDecision },
        requestId,
        tx,
      });
      return decision;
    });
  }

  async overrideDecision(
    decisionId: string,
    applicationId: string,
    companyId: string,
    dto: OverrideDecisionDto,
    membershipId: string,
    userId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    const original = await this.prisma.applicationDecision.findFirst({
      where: { id: decisionId, applicationId },
    });
    if (!original)
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Decision not found' });

    return this.prisma.$transaction(async (tx) => {
      const override = await tx.applicationDecision.create({
        data: {
          applicationId,
          type: dto.type,
          actorType: ApplicationActorType.RECRUITER,
          actorUserId: userId,
          actorMembershipId: membershipId,
          reasonCode: dto.reasonCode ?? null,
          explanation: dto.explanation,
          overriddenDecisionId: decisionId,
          finalDecision: true,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        actorUserId: userId,
        eventType: ApplicationAuditEventType.APPLICATION_DECISION_OVERRIDDEN,
        entityType: 'ApplicationDecision',
        entityId: override.id,
        description: `Decision ${decisionId} overridden with ${dto.type}`,
        requestId,
        tx,
      });
      return override;
    });
  }
}
