import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobActivityEventType, Prisma } from '@prisma/client';

@Injectable()
export class JobActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    jobId: string;
    eventType: JobActivityEventType;
    description: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string;
    actorMembershipId?: string;
    requestId?: string;
  }): Promise<void> {
    await this.prisma.jobActivityEvent.create({
      data: {
        companyId: params.companyId,
        jobId: params.jobId,
        actorUserId: params.actorUserId ?? null,
        actorMembershipId: params.actorMembershipId ?? null,
        eventType: params.eventType,
        description: params.description,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue,
        requestId: params.requestId ?? null,
      },
    });
  }

  async getByJob(
    companyId: string,
    jobId: string,
    query: {
      page?: number;
      limit?: number;
      eventType?: JobActivityEventType;
      actorMembershipId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const { page = 1, limit = 20, eventType, actorMembershipId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.JobActivityEventWhereInput = { companyId, jobId };

    if (eventType) where.eventType = eventType;
    if (actorMembershipId) where.actorMembershipId = actorMembershipId;

    if (dateFrom || dateTo) {
      where.occurredAt = {};
      if (dateFrom) where.occurredAt.gte = new Date(dateFrom);
      if (dateTo) where.occurredAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.jobActivityEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.jobActivityEvent.count({ where }),
    ]);

    const sanitized = data.map((event) => ({
      ...event,
      metadata: this.sanitizeMetadata(event.metadata as Record<string, unknown> | null),
    }));

    return {
      data: sanitized,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!metadata) return null;

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'authorization',
      'credential',
      'apiKey',
      'api_key',
      'accessToken',
      'refreshToken',
    ];

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
