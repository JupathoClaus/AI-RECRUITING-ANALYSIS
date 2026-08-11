import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { VerificationTokenType } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class VerificationTokenService {
  private readonly defaultTtlMinutes: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtlMinutes =
      this.configService.get<number>('auth.verificationTokenTtlMinutes') ?? 1440;
  }

  async create(
    email: string,
    type: VerificationTokenType,
    userId?: string,
    ttlMinutes?: number,
  ): Promise<{ rawToken: string; hashedToken: string }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const ttl = ttlMinutes ?? this.defaultTtlMinutes;

    await this.prismaService.verificationToken.create({
      data: {
        userId: userId ?? null,
        email,
        type,
        tokenHash: hashedToken,
        expiresAt: new Date(Date.now() + ttl * 60 * 1000),
      },
    });

    return { rawToken, hashedToken };
  }

  async findValid(tokenHash: string, type: VerificationTokenType) {
    return this.prismaService.verificationToken.findFirst({
      where: {
        tokenHash,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.prismaService.verificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async invalidateOlder(email: string, type: VerificationTokenType): Promise<number> {
    const result = await this.prismaService.verificationToken.updateMany({
      where: {
        email,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    return result.count;
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prismaService.verificationToken.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }
}
