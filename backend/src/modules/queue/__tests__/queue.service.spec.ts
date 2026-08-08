import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueService, QUEUE_NAMES } from '../queue.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('QueueService', () => {
  let service: QueueService;

  const makeMockQueue = (pingImpl?: () => Promise<unknown>) => ({
    client: {
      info: jest.fn(pingImpl ?? (() => Promise.resolve('INFO'))),
    },
    close: jest.fn().mockResolvedValue(undefined),
  });

  const ALL_QUEUES = [
    QUEUE_NAMES.EMAIL,
    QUEUE_NAMES.NOTIFICATIONS,
    QUEUE_NAMES.ANALYTICS,
    QUEUE_NAMES.AI_PROCESSING,
    QUEUE_NAMES.INTERVIEW_REMINDER,
    QUEUE_NAMES.INTERVIEW_NOTIFICATION,
    QUEUE_NAMES.AI_SCREENING,
    QUEUE_NAMES.RESUME_PROCESSING,
  ];

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'app.healthCheckTimeoutMs': 3000,
      };
      return config[key];
    }),
  };

  function buildModule(overrides: Partial<Record<string, unknown>> = {}) {
    const providers: Record<string, unknown> = {};
    for (const name of ALL_QUEUES) {
      providers[name] = { ...makeMockQueue() };
    }
    Object.assign(providers, overrides);

    return Test.createTestingModule({
      providers: [
        QueueService,
        ...ALL_QUEUES.map((name) => ({
          provide: getQueueToken(name),
          useValue: providers[name],
        })),
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
  }

  beforeAll(async () => {
    const module = await buildModule();
    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHealthy', () => {
    it('should report every production queue up when Redis ping succeeds', async () => {
      const result = await service.isHealthy();

      expect(result.healthy).toBe(true);
      expect(Object.keys(result.details).sort()).toEqual(ALL_QUEUES.sort());
      for (const name of ALL_QUEUES) {
        expect(result.details[name]).toBe('up');
      }
    });

    it('should require a real Redis round trip (INFO) for every queue', async () => {
      await service.isHealthy();
      // waitUntilReady is never used; each queue must round-trip on its own client
      const entries: { name: string; queue: { client: { info: jest.Mock } } }[] = (
        service as any
      ).queueEntries();
      for (const entry of entries) {
        expect(entry.queue.client.info).toHaveBeenCalledTimes(1);
      }
      expect((service as any).queueEntries()[0].queue.waitUntilReady).toBeUndefined();
    });

    it('should mark a single queue down when its Redis ping fails', async () => {
      const failing = {
        ...makeMockQueue(),
        client: { info: jest.fn().mockRejectedValue(new Error('Connection is closed')) },
      };
      const module = await buildModule({ [QUEUE_NAMES.AI_SCREENING]: failing });
      const svc = module.get<QueueService>(QueueService);

      const result = await svc.isHealthy();

      expect(result.healthy).toBe(false);
      expect(result.details[QUEUE_NAMES.AI_SCREENING]).toBe('down');
      expect(result.details[QUEUE_NAMES.EMAIL]).toBe('up');
    });

    it('should mark the queue down when the round trip exceeds the health timeout', async () => {
      const hung = {
        ...makeMockQueue(),
        client: { info: jest.fn(() => new Promise<never>(() => undefined)) },
      };
      const module = await Test.createTestingModule({
        providers: [
          QueueService,
          ...ALL_QUEUES.filter((n) => n !== QUEUE_NAMES.EMAIL).map((name) => ({
            provide: getQueueToken(name),
            useValue: { ...makeMockQueue() },
          })),
          { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: hung },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const config: Record<string, unknown> = {
                  'app.healthCheckTimeoutMs': 60,
                };
                return config[key];
              }),
            },
          },
        ],
      }).compile();

      const svc = module.get<QueueService>(QueueService);
      const start = Date.now();
      const result = await svc.isHealthy();
      const elapsed = Date.now() - start;

      expect(result.healthy).toBe(false);
      expect(result.details[QUEUE_NAMES.EMAIL]).toBe('down');
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('onModuleDestroy', () => {
    it('should call close on all eight queues', async () => {
      const closes: Record<string, jest.Mock> = {};
      for (const name of ALL_QUEUES) {
        closes[name] = jest.fn().mockResolvedValue(undefined);
      }

      const module = await Test.createTestingModule({
        providers: [
          QueueService,
          ...ALL_QUEUES.map((name) => ({
            provide: getQueueToken(name),
            useValue: { close: closes[name] },
          })),
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<QueueService>(QueueService);
      await svc.onModuleDestroy();

      for (const name of ALL_QUEUES) {
        expect(closes[name]).toHaveBeenCalled();
      }
    });
  });
});