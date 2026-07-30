import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { SessionStatus, Prisma } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionLimitPerUser: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.sessionLimitPerUser = this.configService.get<number>('auth.sessionLimitPerUser') ?? 10;
  }

  async create(data: {
    userId: string;
    activeCompanyId?: string | null;
    membershipId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceName?: string | null;
    refreshTokenHash: string;
    refreshTokenFamilyId: string;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    const {
      userId,
      activeCompanyId,
      membershipId,
      ipAddress,
      userAgent,
      deviceName,
      refreshTokenHash,
      refreshTokenFamilyId,
      expiresAt,
    } = data;

    const session = await this.prismaService.userSession.create({
      data: {
        userId,
        activeCompanyId: activeCompanyId ?? null,
        membershipId: membershipId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        deviceName: deviceName ?? null,
        refreshTokenHash,
        refreshTokenFamilyId,
        status: SessionStatus.ACTIVE,
        expiresAt,
      },
      select: { id: true },
    });

    await this.enforceSessionLimit(userId);

    return session;
  }

  async findByRefreshTokenHash(hash: string) {
    return this.prismaService.userSession.findFirst({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
  }

  async findActiveById(id: string) {
    return this.prismaService.userSession.findFirst({
      where: { id, status: SessionStatus.ACTIVE },
    });
  }

  async revoke(id: string, reason?: string): Promise<void> {
    await this.prismaService.userSession.update({
      where: { id },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: reason ?? null,
      },
    });
  }

  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    const idsToRevoke = exceptSessionId
      ? await this.prismaService.userSession.findMany({
          where: {
            userId,
            status: SessionStatus.ACTIVE,
            id: { not: exceptSessionId },
          },
          select: { id: true },
        })
      : await this.prismaService.userSession.findMany({
          where: { userId, status: SessionStatus.ACTIVE },
          select: { id: true },
        });

    const result = await this.prismaService.userSession.updateMany({
      where: { id: { in: idsToRevoke.map((s) => s.id) } },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: exceptSessionId
          ? 'User logged out all other sessions'
          : 'User logged out all sessions',
      },
    });

    return result.count;
  }

  async revokeFamily(refreshTokenFamilyId: string): Promise<number> {
    const result = await this.prismaService.userSession.updateMany({
      where: { refreshTokenFamilyId, status: SessionStatus.ACTIVE },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'Refresh token reuse detected',
      },
    });

    return result.count;
  }

  async updateRefreshToken(sessionId: string, newRefreshTokenHash: string): Promise<void> {
    const session = await this.prismaService.userSession.findUnique({
      where: { id: sessionId },
      select: { refreshTokenHash: true },
    });

    await this.prismaService.userSession.update({
      where: { id: sessionId },
      data: {
        previousRefreshTokenHash: session?.refreshTokenHash ?? null,
        refreshTokenHash: newRefreshTokenHash,
      },
    });
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    await this.prismaService.userSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }

  async updateActiveCompany(
    sessionId: string,
    companyId: string,
    membershipId?: string,
  ): Promise<void> {
    await this.prismaService.userSession.update({
      where: { id: sessionId },
      data: { activeCompanyId: companyId, membershipId: membershipId ?? null },
    });
  }

  async listUserSessions(userId: string, includeRevoked = false) {
    const where: Prisma.UserSessionWhereInput = { userId };
    if (!includeRevoked) {
      where.status = SessionStatus.ACTIVE;
    }

    return this.prismaService.userSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        activeCompanyId: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        deviceName: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async enforceSessionLimit(userId: string): Promise<void> {
    const activeCount = await this.countActiveSessions(userId);

    if (activeCount <= this.sessionLimitPerUser) return;

    const excessCount = activeCount - this.sessionLimitPerUser;

    const oldestSessions = await this.prismaService.userSession.findMany({
      where: { userId, status: SessionStatus.ACTIVE },
      orderBy: { lastUsedAt: 'asc' },
      take: excessCount,
      select: { id: true },
    });

    const idsToRevoke = oldestSessions.map((s) => s.id);

    await this.prismaService.userSession.updateMany({
      where: { id: { in: idsToRevoke } },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'Session limit exceeded, oldest session revoked',
      },
    });

    this.logger.warn(
      `Revoked ${idsToRevoke.length} oldest sessions for user ${userId} due to session limit`,
    );
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.prismaService.userSession.count({
      where: { userId, status: SessionStatus.ACTIVE },
    });
  }
}
