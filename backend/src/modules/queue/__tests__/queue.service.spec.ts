import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueService, QUEUE_NAMES } from '../queue.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('QueueService', () => {
  let service: QueueService;

  const mockQueue = {
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'app.healthCheckTimeoutMs': 3000,
      };
      return config[key];
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: { ...mockQueue } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: { ...mockQueue } },
        { provide: getQueueToken(QUEUE_NAMES.ANALYTICS), useValue: { ...mockQueue } },
        { provide: getQueueToken(QUEUE_NAMES.AI_PROCESSING), useValue: { ...mockQueue } },
        { provide: getQueueToken(QUEUE_NAMES.INTERVIEW_REMINDER), useValue: { ...mockQueue } },
        { provide: getQueueToken(QUEUE_NAMES.INTERVIEW_NOTIFICATION), useValue: { ...mockQueue } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHealthy', () => {
    it('should return healthy with per-queue details', async () => {
      const result = await service.isHealthy();

      expect(result.healthy).toBe(true);
      expect(result.details).toEqual({
        email: 'up',
        notifications: 'up',
        analytics: 'up',
        'ai-processing': 'up',
        'interview-reminder': 'up',
        'interview-notification': 'up',
      });
    });

    it('should mark queue as down when waitUntilReady fails', async () => {
      const failingQueue = {
        waitUntilReady: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueService,
          { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: failingQueue },
          { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: { ...mockQueue } },
          { provide: getQueueToken(QUEUE_NAMES.ANALYTICS), useValue: { ...mockQueue } },
          { provide: getQueueToken(QUEUE_NAMES.AI_PROCESSING), useValue: { ...mockQueue } },
          { provide: getQueueToken(QUEUE_NAMES.INTERVIEW_REMINDER), useValue: { ...mockQueue } },
          {
            provide: getQueueToken(QUEUE_NAMES.INTERVIEW_NOTIFICATION),
            useValue: { ...mockQueue },
          },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<QueueService>(QueueService);
      const result = await svc.isHealthy();

      expect(result.healthy).toBe(false);
      expect(result.details).toEqual({
        email: 'down',
        notifications: 'up',
        analytics: 'up',
        'ai-processing': 'up',
        'interview-reminder': 'up',
        'interview-notification': 'up',
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should call close on all queues', async () => {
      const emailClose = jest.fn().mockResolvedValue(undefined);
      const notifClose = jest.fn().mockResolvedValue(undefined);
      const analyticsClose = jest.fn().mockResolvedValue(undefined);
      const aiClose = jest.fn().mockResolvedValue(undefined);
      const reminderClose = jest.fn().mockResolvedValue(undefined);
      const notifQClose = jest.fn().mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueService,
          {
            provide: getQueueToken(QUEUE_NAMES.EMAIL),
            useValue: { close: emailClose },
          },
          {
            provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS),
            useValue: { close: notifClose },
          },
          {
            provide: getQueueToken(QUEUE_NAMES.ANALYTICS),
            useValue: { close: analyticsClose },
          },
          {
            provide: getQueueToken(QUEUE_NAMES.AI_PROCESSING),
            useValue: { close: aiClose },
          },
          {
            provide: getQueueToken(QUEUE_NAMES.INTERVIEW_REMINDER),
            useValue: { close: reminderClose },
          },
          {
            provide: getQueueToken(QUEUE_NAMES.INTERVIEW_NOTIFICATION),
            useValue: { close: notifQClose },
          },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<QueueService>(QueueService);
      await svc.onModuleDestroy();

      expect(emailClose).toHaveBeenCalled();
      expect(notifClose).toHaveBeenCalled();
      expect(analyticsClose).toHaveBeenCalled();
      expect(aiClose).toHaveBeenCalled();
      expect(reminderClose).toHaveBeenCalled();
      expect(notifQClose).toHaveBeenCalled();
    });
  });
});
