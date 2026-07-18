import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditEventType, Prisma } from '@prisma/client';

@Injectable()
export class OrganizationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: {
    companyId: string;
    actorUserId?: string | null;
    actorMembershipId?: string | null;
    eventType: OrganizationAuditEventType;
    entityType: string;
    entityId?: string | null;
    description: string;
    metadata?: Record<string, unknown> | null;
    requestId?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.prisma.organizationAuditEvent.create({
      data: {
        companyId: data.companyId,
        actorUserId: data.actorUserId ?? null,
        actorMembershipId: data.actorMembershipId ?? null,
        eventType: data.eventType,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        description: data.description,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue,
        requestId: data.requestId ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });
  }
}
