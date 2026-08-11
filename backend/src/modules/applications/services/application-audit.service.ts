import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationAuditEventType, ApplicationActorType, Prisma } from '@prisma/client';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'credential',
  'apiKey',
  'accessToken',
  'refreshToken',
];

function sanitize(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk))) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class ApplicationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: {
    companyId: string;
    eventType: ApplicationAuditEventType;
    actorType: ApplicationActorType;
    entityType: string;
    description: string;
    applicationId?: string | null;
    companyCandidateId?: string | null;
    candidateId?: string | null;
    actorUserId?: string | null;
    actorMembershipId?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    requestId?: string | null;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const client = data.tx ?? this.prisma;
    await (client as any).applicationAuditEvent.create({
      data: {
        companyId: data.companyId,
        applicationId: data.applicationId ?? null,
        companyCandidateId: data.companyCandidateId ?? null,
        candidateId: data.candidateId ?? null,
        actorUserId: data.actorUserId ?? null,
        actorMembershipId: data.actorMembershipId ?? null,
        actorType: data.actorType,
        eventType: data.eventType,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        description: data.description,
        metadata: (sanitize(data.metadata) as Prisma.InputJsonValue) ?? undefined,
        requestId: data.requestId ?? null,
      },
    });
  }
}
