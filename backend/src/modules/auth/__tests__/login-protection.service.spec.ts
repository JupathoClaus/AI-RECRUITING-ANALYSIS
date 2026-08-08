import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { LoginProtectionService } from '../services/login-protection.service';

describe('LoginProtectionService', () => {
  let service: LoginProtectionService;
  let prisma: any;
  let redis: any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'auth.maxFailedAttempts': 5,
        'auth.lockoutDurationMinutes': 15,
        'auth.loginRateLimitWindowSeconds': 900,
        'auth.loginRateLimitMax': 10,
      };
      return config[key];
    }),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    exists: jest.fn(),
    setWithExpiry: jest.fn(),
    increment: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginProtectionService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<LoginProtectionService>(LoginProtectionService);
    prisma = mockPrismaService;
    redis = mockRedisService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLockout', () => {
    it('should return not locked when user has no lockout', async () => {
      prisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

      const result = await service.checkLockout('user-1');
      expect(result.locked).toBe(false);
      expect(result.remainingLockTimeMs).toBe(0);
    });

    it('should return not locked when lockout has expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        lockedUntil: new Date(Date.now() - 60000),
      });

      const result = await service.checkLockout('user-1');
      expect(result.locked).toBe(false);
      expect(result.remainingLockTimeMs).toBe(0);
    });

    it('should return locked with remaining time when lockout is active', async () => {
      const future = new Date(Date.now() + 300000);
      prisma.user.findUnique.mockResolvedValue({
        lockedUntil: future,
      });

      const result = await service.checkLockout('user-1');
      expect(result.locked).toBe(true);
      expect(result.remainingLockTimeMs).toBeGreaterThan(0);
      expect(result.remainingLockTimeMs).toBeLessThanOrEqual(300000);
    });

    it('should return not locked when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkLockout('nonexistent');
      expect(result.locked).toBe(false);
      expect(result.remainingLockTimeMs).toBe(0);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment failed attempts and lock when threshold reached', async () => {
      prisma.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 4,
        lockedUntil: null,
      });

      await service.recordFailedAttempt('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        },
      });
    });

    it('should increment but not lock below threshold', async () => {
      prisma.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 2,
        lockedUntil: null,
      });

      await service.recordFailedAttempt('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 3,
          lockedUntil: null,
        },
      });
    });

    it('should silently return if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.recordFailedAttempt('ghost');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resetFailedAttempts', () => {
    it('should reset attempts and clear lockout', async () => {
      await service.resetFailedAttempts('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });
  });

  describe('checkLoginRateLimit', () => {
    it('should allow request when under rate limit', async () => {
      redis.get.mockResolvedValue('3');

      const result = await service.checkLoginRateLimit('127.0.0.1', 'test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
      expect(result.resetTimeSeconds).toBe(900);
    });

    it('should block request when at rate limit', async () => {
      redis.get.mockResolvedValue('10');

      const result = await service.checkLoginRateLimit('127.0.0.1', 'test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow request when no previous attempts', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.checkLoginRateLimit('127.0.0.1', 'test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('should throw 503 AUTH_SESSION_STORE_UNAVAILABLE when Redis is down', async () => {
      redis.get.mockRejectedValue(new Error('Connection is closed'));

      await expect(
        service.checkLoginRateLimit('127.0.0.1', 'test@example.com'),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'AUTH_SESSION_STORE_UNAVAILABLE' },
      });
    });
  });

  describe('recordLoginAttempt', () => {
    it('should set initial key when no previous attempts', async () => {
      redis.exists.mockResolvedValue(false);

      await service.recordLoginAttempt('127.0.0.1', 'test@example.com');

      expect(redis.setWithExpiry).toHaveBeenCalledWith(expect.any(String), '1', 900);
      expect(redis.increment).not.toHaveBeenCalled();
    });

    it('should increment existing key', async () => {
      redis.exists.mockResolvedValue(true);

      await service.recordLoginAttempt('127.0.0.1', 'test@example.com');

      expect(redis.increment).toHaveBeenCalledWith(expect.any(String));
      expect(redis.setWithExpiry).not.toHaveBeenCalled();
    });

    it('should throw 503 AUTH_SESSION_STORE_UNAVAILABLE when Redis is down', async () => {
      redis.exists.mockRejectedValue(new Error('Connection is closed'));

      await expect(
        service.recordLoginAttempt('127.0.0.1', 'test@example.com'),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'AUTH_SESSION_STORE_UNAVAILABLE' },
      });
    });
  });
});
