import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateAuditEventType, Prisma } from '@prisma/client';

@Injectable()
export class CandidateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: {
    candidateId: string;
    companyId?: string | null;
    actorUserId?: string | null;
    actorMembershipId?: string | null;
    eventType: CandidateAuditEventType;
    entityType: string;
    entityId?: string | null;
    description: string;
    metadata?: Record<string, unknown> | null;
    requestId?: string | null;
  }): Promise<void> {
    await this.prisma.candidateAuditEvent.create({
      data: {
        candidateId: data.candidateId,
        companyId: data.companyId ?? null,
        actorUserId: data.actorUserId ?? null,
        actorMembershipId: data.actorMembershipId ?? null,
        eventType: data.eventType,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        description: data.description,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue,
        requestId: data.requestId ?? null,
      },
    });
  }
}
