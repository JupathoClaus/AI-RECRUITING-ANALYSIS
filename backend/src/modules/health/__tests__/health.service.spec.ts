import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { QueueService } from '@modules/queue/queue.service';

describe('HealthService', () => {
  let service: HealthService;

  const mockPrismaService = {
    isHealthy: jest.fn().mockResolvedValue({ healthy: true, latencyMs: 5 }),
  };

  const mockRedisService = {
    isHealthy: jest.fn().mockResolvedValue({ healthy: true, latencyMs: 2 }),
  };

  const mockQueueService = {
    isHealthy: jest.fn().mockResolvedValue({ healthy: true, details: { email: 'up' } }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'app.version': '1.0.0',
        'app.env': 'test',
        'app.name': 'TalentAI',
        'app.apiVersion': 'v1',
        'app.healthCheckTimeoutMs': 3000,
      };
      return config[key];
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check()', () => {
    it('should return ok status when all services are healthy', async () => {
      const result = await service.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(result.version).toBe('1.0.0');
      expect(result.environment).toBe('test');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.memory).toBeDefined();
      expect(result.checks.memory.heapUsedMb).toBeGreaterThan(0);
    });

    it('should return error status when database is down', async () => {
      mockPrismaService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        latencyMs: 5000,
      });

      const result = await service.check();

      expect(result.status).toBe('error');
      expect(result.checks.database.status).toBe('down');
    });

    it('should return error status when redis is down', async () => {
      mockRedisService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        latencyMs: 3000,
      });

      const result = await service.check();

      expect(result.status).toBe('error');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return degraded when queue is down (db+redis up)', async () => {
      mockQueueService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        details: { error: 'failed' },
      });

      const result = await service.check();

      expect(result.status).toBe('degraded');
    });
  });

  describe('liveness()', () => {
    it('should return ok status', async () => {
      const result = await service.liveness();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readiness()', () => {
    it('should return ready when all dependencies are healthy', async () => {
      const result = await service.readiness();

      expect(result.status).toBe('ready');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.queues.status).toBe('up');
    });

    it('should return not_ready when database is down', async () => {
      mockPrismaService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        latencyMs: 5000,
      });

      const result = await service.readiness();

      expect(result.status).toBe('not_ready');
    });

    it('should return not_ready when redis is down', async () => {
      mockRedisService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        latencyMs: 3000,
      });

      const result = await service.readiness();

      expect(result.status).toBe('not_ready');
    });

    it('should return not_ready when queue is down', async () => {
      mockQueueService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        details: { email: 'down' },
      });

      const result = await service.readiness();

      expect(result.status).toBe('not_ready');
    });

    it('should return not_ready when a single named queue fails', async () => {
      mockQueueService.isHealthy.mockResolvedValueOnce({
        healthy: false,
        details: { email: 'down', notifications: 'up', analytics: 'up', 'ai-processing': 'up' },
      });

      const result = await service.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.queues.details?.email).toBe('down');
    });
  });

  describe('version()', () => {
    it('should return version information', async () => {
      const result = await service.version();

      expect(result.name).toBe('TalentAI');
      expect(result.version).toBe('1.0.0');
      expect(result.apiVersion).toBe('v1');
      expect(result.environment).toBe('test');
      expect(result.nodeVersion).toBeDefined();
    });
  });

  describe('withTimeout', () => {
    it('should return fast result normally', async () => {
      jest.useFakeTimers();
      const checkPromise = service.readiness();

      const result = await checkPromise;
      expect(result.status).toBe('ready');
      jest.useRealTimers();
    });

    it('should return fallback when operation times out', async () => {
      jest.useFakeTimers();
      mockPrismaService.isHealthy.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      );

      const checkPromise = service.readiness();
      jest.advanceTimersByTime(4000);

      const result = await checkPromise;
      expect(result.checks.database.status).toBe('down');
      jest.useRealTimers();
    });

    it('should return fallback when operation rejects', async () => {
      jest.useFakeTimers();
      mockRedisService.isHealthy.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.readiness();
      expect(result.checks.redis.status).toBe('down');
      jest.useRealTimers();
    });
  });
});
