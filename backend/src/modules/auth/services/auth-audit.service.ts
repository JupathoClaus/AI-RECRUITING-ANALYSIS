import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { AuditEventType, Prisma } from '@prisma/client';

@Injectable()
export class AuthAuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async record(data: {
    eventType: AuditEventType;
    success: boolean;
    userId?: string | null;
    companyId?: string | null;
    sessionId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const {
      eventType,
      success,
      userId,
      companyId,
      sessionId,
      ipAddress,
      userAgent,
      requestId,
      metadata,
    } = data;

    await this.prismaService.authAuditEvent.create({
      data: {
        eventType,
        success,
        userId: userId ?? null,
        companyId: companyId ?? null,
        sessionId: sessionId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  async getUserEvents(userId: string, limit = 50, offset = 0) {
    return this.prismaService.authAuditEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getCompanyEvents(companyId: string, limit = 50, offset = 0) {
    return this.prismaService.authAuditEvent.findMany({
      where: { companyId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}
