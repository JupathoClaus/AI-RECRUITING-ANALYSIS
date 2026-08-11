import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { QueueService } from '@modules/queue/queue.service';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const mockHealthService = {
    check: jest.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 100,
      version: '1.0.0',
      environment: 'test',
      checks: {
        database: { status: 'up', latencyMs: 5 },
        redis: { status: 'up', latencyMs: 2 },
        queues: { status: 'up' },
        memory: { status: 'up', heapUsedMb: 50, heapTotalMb: 100, rssMb: 120, externalMb: 10 },
      },
    }),
    liveness: jest.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 100,
    }),
    readiness: jest.fn().mockResolvedValue({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'up', latencyMs: 5 },
        redis: { status: 'up', latencyMs: 2 },
        queues: { status: 'up' },
      },
    }),
    version: jest.fn().mockResolvedValue({
      name: 'TalentAI',
      version: '1.0.0',
      apiVersion: 'v1',
      environment: 'test',
      nodeVersion: process.version,
      uptimeSeconds: 100,
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: mockHealthService },
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check()', () => {
    it('should call healthService.check() and return status', async () => {
      const result = await controller.check(mockResponse);
      expect(service.check).toHaveBeenCalled();
      expect(result.status).toBe('ok');
    });

    it('should set 503 when health status is error', async () => {
      mockHealthService.check.mockResolvedValueOnce({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptimeSeconds: 100,
        version: '1.0.0',
        environment: 'test',
        checks: {
          database: { status: 'down', latencyMs: 5000 },
          redis: { status: 'up', latencyMs: 2 },
          queues: { status: 'up' },
          memory: { status: 'up', heapUsedMb: 50, heapTotalMb: 100, rssMb: 120, externalMb: 10 },
        },
      });

      await controller.check(mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });
  });

  describe('liveness()', () => {
    it('should call healthService.liveness() and set 200', async () => {
      const result = await controller.liveness(mockResponse);
      expect(service.liveness).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('ok');
    });
  });

  describe('readiness()', () => {
    it('should set 200 when ready', async () => {
      await controller.readiness(mockResponse);
      expect(service.readiness).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should set 503 when database is down', async () => {
      mockHealthService.readiness.mockResolvedValueOnce({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'down', latencyMs: 5000 },
          redis: { status: 'up', latencyMs: 2 },
          queues: { status: 'up' },
        },
      });

      await controller.readiness(mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });

    it('should set 503 when queue is down', async () => {
      mockHealthService.readiness.mockResolvedValueOnce({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'up', latencyMs: 5 },
          redis: { status: 'up', latencyMs: 2 },
          queues: { status: 'down', details: { email: 'down' } },
        },
      });

      await controller.readiness(mockResponse);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });
  });

  describe('version()', () => {
    it('should call healthService.version() and set 200', async () => {
      const result = await controller.version(mockResponse);
      expect(service.version).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(result.name).toBe('TalentAI');
    });
  });
});
