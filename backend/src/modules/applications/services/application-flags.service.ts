import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationActorType,
  ApplicationAuditEventType,
  ApplicationFlagSeverity,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';
import { CreateFlagDto, ResolveFlagDto } from '../dto/flag.dto';

@Injectable()
export class ApplicationFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async getFlags(applicationId: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    return this.prisma.applicationFlag.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFlag(
    applicationId: string,
    companyId: string,
    dto: CreateFlagDto,
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

    return this.prisma.$transaction(async (tx) => {
      const flag = await tx.applicationFlag.create({
        data: {
          applicationId,
          type: dto.type,
          description: dto.description ?? null,
          severity: dto.severity ?? ApplicationFlagSeverity.MEDIUM,
          createdByActorType: ApplicationActorType.RECRUITER,
          createdByUserId: userId,
          createdByMembershipId: membershipId,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        actorUserId: userId,
        eventType: ApplicationAuditEventType.APPLICATION_FLAG_ADDED,
        entityType: 'ApplicationFlag',
        entityId: flag.id,
        description: `Flag of type ${dto.type} added`,
        metadata: { type: dto.type, severity: dto.severity },
        requestId,
        tx,
      });
      return flag;
    });
  }

  async resolveFlag(
    flagId: string,
    applicationId: string,
    companyId: string,
    dto: ResolveFlagDto,
    membershipId: string,
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
    const flag = await this.prisma.applicationFlag.findFirst({
      where: { id: flagId, applicationId },
    });
    if (!flag)
      throw new NotFoundException({
        code: 'APPLICATION_FLAG_NOT_FOUND',
        message: 'Flag not found',
      });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.applicationFlag.update({
        where: { id: flagId },
        data: {
          resolved: true,
          resolvedByMembershipId: membershipId,
          resolvedAt: new Date(),
          resolutionNotes: dto.resolutionNotes ?? null,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_FLAG_RESOLVED,
        entityType: 'ApplicationFlag',
        entityId: flagId,
        description: `Flag ${flag.type} resolved`,
        requestId,
        tx,
      });
      return updated;
    });
  }
}
