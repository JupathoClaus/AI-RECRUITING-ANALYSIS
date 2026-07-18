import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobActivityService } from '../job-activity.service';
import { JobActivityEventType } from '@prisma/client';

describe('JobActivityService', () => {
  let service: JobActivityService;
  let prisma: any;

  const mockPrismaService = {
    jobActivityEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobActivityService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<JobActivityService>(JobActivityService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── record ────────────────────────────────────────────────────────────────────
  describe('record', () => {
    it('should create an activity event', async () => {
      prisma.jobActivityEvent.create.mockResolvedValue({
        id: 'event-1',
        companyId: 'company-1',
        jobId: 'job-1',
        eventType: JobActivityEventType.JOB_CREATED,
        description: 'Job created',
        metadata: { jobCode: 'JOB-001' },
      });

      await service.record({
        companyId: 'company-1',
        jobId: 'job-1',
        eventType: JobActivityEventType.JOB_CREATED,
        description: 'Job created',
        actorUserId: 'user-1',
        actorMembershipId: 'mem-1',
        metadata: { jobCode: 'JOB-001' },
      });

      expect(prisma.jobActivityEvent.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
          jobId: 'job-1',
          actorUserId: 'user-1',
          actorMembershipId: 'mem-1',
          eventType: JobActivityEventType.JOB_CREATED,
          description: 'Job created',
          metadata: { jobCode: 'JOB-001' },
          requestId: null,
        },
      });
    });

    it('should create event with null actor fields when not provided', async () => {
      prisma.jobActivityEvent.create.mockResolvedValue({ id: 'event-2' });

      await service.record({
        companyId: 'company-1',
        jobId: 'job-1',
        eventType: JobActivityEventType.JOB_UPDATED,
        description: 'Updated',
      });

      expect(prisma.jobActivityEvent.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
          jobId: 'job-1',
          actorUserId: null,
          actorMembershipId: null,
          eventType: JobActivityEventType.JOB_UPDATED,
          description: 'Updated',
          metadata: undefined,
          requestId: null,
        },
      });
    });

    it('should accept and store requestId', async () => {
      prisma.jobActivityEvent.create.mockResolvedValue({ id: 'event-3' });

      await service.record({
        companyId: 'company-1',
        jobId: 'job-1',
        eventType: JobActivityEventType.JOB_CREATED,
        description: 'Created',
        requestId: 'req-123',
      });

      expect(prisma.jobActivityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'req-123',
        }),
      });
    });
  });

  // ─── getByJob ──────────────────────────────────────────────────────────────────
  describe('getByJob', () => {
    it('should return paginated activity events', async () => {
      const mockEvents = [
        { id: 'event-1', eventType: JobActivityEventType.JOB_CREATED, metadata: null },
        { id: 'event-2', eventType: JobActivityEventType.JOB_UPDATED, metadata: { key: 'val' } },
      ];
      prisma.jobActivityEvent.findMany.mockResolvedValue(mockEvents);
      prisma.jobActivityEvent.count.mockResolvedValue(2);

      const result = await service.getByJob('company-1', 'job-1', { page: 1, limit: 20 });

      expect(result.meta.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by eventType', async () => {
      prisma.jobActivityEvent.findMany.mockResolvedValue([]);
      prisma.jobActivityEvent.count.mockResolvedValue(0);

      await service.getByJob('company-1', 'job-1', {
        eventType: JobActivityEventType.JOB_PUBLISHED,
      });

      expect(prisma.jobActivityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: JobActivityEventType.JOB_PUBLISHED,
          }),
        }),
      );
    });

    it('should filter by actorMembershipId', async () => {
      prisma.jobActivityEvent.findMany.mockResolvedValue([]);
      prisma.jobActivityEvent.count.mockResolvedValue(0);

      await service.getByJob('company-1', 'job-1', { actorMembershipId: 'mem-1' });

      expect(prisma.jobActivityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorMembershipId: 'mem-1',
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      prisma.jobActivityEvent.findMany.mockResolvedValue([]);
      prisma.jobActivityEvent.count.mockResolvedValue(0);

      const dateFrom = '2026-01-01';
      const dateTo = '2026-06-30';

      await service.getByJob('company-1', 'job-1', { dateFrom, dateTo });

      expect(prisma.jobActivityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo),
            },
          }),
        }),
      );
    });

    it('should compute totalPages correctly', async () => {
      prisma.jobActivityEvent.findMany.mockResolvedValue(
        Array(25).fill({ id: 'e', metadata: null }),
      );
      prisma.jobActivityEvent.count.mockResolvedValue(25);

      const result = await service.getByJob('company-1', 'job-1', { page: 1, limit: 10 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ─── Metadata sanitization ─────────────────────────────────────────────────────
  describe('metadata sanitization', () => {
    it('should redact sensitive keys from metadata', async () => {
      const mockEvent = {
        id: 'event-1',
        companyId: 'company-1',
        jobId: 'job-1',
        eventType: JobActivityEventType.JOB_UPDATED,
        description: 'Updated',
        metadata: {
          password: 'supersecret',
          token: 'tok-abc',
          secret: 'buried',
          credential: 'cred-123',
          safeField: 'hello',
          nested: {
            authorization: 'Bearer xyz',
            visible: 'ok',
          },
        },
        occurredAt: new Date(),
      };

      prisma.jobActivityEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.jobActivityEvent.count.mockResolvedValue(1);

      const result = await service.getByJob('company-1', 'job-1', {});

      const meta = result.data[0].metadata as Record<string, unknown>;
      expect(meta.password).toBe('[REDACTED]');
      expect(meta.token).toBe('[REDACTED]');
      expect(meta.secret).toBe('[REDACTED]');
      expect(meta.credential).toBe('[REDACTED]');
      expect(meta.safeField).toBe('hello');
      expect((meta.nested as Record<string, unknown>).authorization).toBe('[REDACTED]');
      expect((meta.nested as Record<string, unknown>).visible).toBe('ok');
    });

    it('should return null metadata when event metadata is null', async () => {
      prisma.jobActivityEvent.findMany.mockResolvedValue([{ id: 'event-1', metadata: null }]);
      prisma.jobActivityEvent.count.mockResolvedValue(1);

      const result = await service.getByJob('company-1', 'job-1', {});

      expect(result.data[0].metadata).toBeNull();
    });
  });
});
