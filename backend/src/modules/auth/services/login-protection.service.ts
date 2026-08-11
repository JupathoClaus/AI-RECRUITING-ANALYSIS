import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { AUTH_ERROR_CODES } from '../constants/auth.constants';
import * as crypto from 'crypto';

@Injectable()
export class LoginProtectionService {
  private readonly maxFailedAttempts: number;
  private readonly lockoutDurationMinutes: number;
  private readonly rateLimitWindowSeconds: number;
  private readonly rateLimitMax: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxFailedAttempts = this.configService.get<number>('auth.maxFailedAttempts') ?? 5;
    this.lockoutDurationMinutes =
      this.configService.get<number>('auth.lockoutDurationMinutes') ?? 15;
    this.rateLimitWindowSeconds =
      this.configService.get<number>('auth.loginRateLimitWindowSeconds') ?? 900;
    this.rateLimitMax = this.configService.get<number>('auth.loginRateLimitMax') ?? 10;
  }

  async checkLockout(userId: string): Promise<{ locked: boolean; remainingLockTimeMs: number }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true },
    });

    if (!user?.lockedUntil) {
      return { locked: false, remainingLockTimeMs: 0 };
    }

    const now = Date.now();
    const lockTime = user.lockedUntil.getTime();

    if (lockTime <= now) {
      return { locked: false, remainingLockTimeMs: 0 };
    }

    return { locked: true, remainingLockTimeMs: lockTime - now };
  }

  async recordFailedAttempt(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });

    if (!user) return;

    const newAttempts = user.failedLoginAttempts + 1;

    const shouldLock = newAttempts >= this.maxFailedAttempts;

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: newAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + this.lockoutDurationMinutes * 60 * 1000)
          : user.lockedUntil,
      },
    });
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async checkLoginRateLimit(
    ipAddress: string,
    normalizedEmail: string,
  ): Promise<{ allowed: boolean; remaining: number; resetTimeSeconds: number }> {
    const key = `ratelimit:login:${crypto.createHash('sha256').update(`${ipAddress}:${normalizedEmail}`).digest('hex')}`;

    try {
      const currentStr = await this.redisService.get(key);
      const current = currentStr ? parseInt(currentStr, 10) : 0;

      const remaining = Math.max(0, this.rateLimitMax - current);
      const allowed = current < this.rateLimitMax;

      return { allowed, remaining, resetTimeSeconds: this.rateLimitWindowSeconds };
    } catch {
      throw new ServiceUnavailableException({
        code: AUTH_ERROR_CODES.SESSION_STORE_UNAVAILABLE,
        message: 'Authentication session store is temporarily unavailable',
      });
    }
  }

  async recordLoginAttempt(ipAddress: string, normalizedEmail: string): Promise<void> {
    const key = `ratelimit:login:${crypto.createHash('sha256').update(`${ipAddress}:${normalizedEmail}`).digest('hex')}`;

    try {
      const exists = await this.redisService.exists(key);
      if (!exists) {
        await this.redisService.setWithExpiry(key, '1', this.rateLimitWindowSeconds);
      } else {
        await this.redisService.increment(key);
      }
    } catch {
      throw new ServiceUnavailableException({
        code: AUTH_ERROR_CODES.SESSION_STORE_UNAVAILABLE,
        message: 'Authentication session store is temporarily unavailable',
      });
    }
  }
}
