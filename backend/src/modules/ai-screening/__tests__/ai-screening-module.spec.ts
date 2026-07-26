import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { OPENAI_CLIENT } from '../providers/openai-client.token';
import { AiScreeningModule } from '../ai-screening.module';
import { AiScreeningService } from '../ai-screening.service';
import { AiScreeningController } from '../ai-screening.controller';
import { AiScreeningProcessor } from '../queue/ai-screening.processor';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { AI_SCREENING_QUEUE } from '../queue/ai-screening-queue.constants';

const mockPrismaService = {
  application: { findFirst: jest.fn() },
  aiScreeningResult: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  storedFile: { findUnique: jest.fn() },
};

const mockQueue = {
  add: jest.fn(),
  close: jest.fn(),
  waitUntilReady: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'aiScreening.provider': 'mock',
      'aiScreening.openAiApiKey': '',
      'aiScreening.openAiModel': 'gpt-4o-mini',
      'aiScreening.timeoutMs': 30000,
      'aiScreening.maxResumeChars': 15000,
      'aiScreening.promptVersion': 'v1',
      'aiScreening.schemaVersion': 'v1',
      'aiScreening.workerConcurrency': 3,
      'aiScreening.mockScenario': '',
      'app.uploadDir': './uploads',
      'app.resumeTextParserSuffix': '_parsed.txt',
    };
    return config[key];
  }),
};

describe('AiScreeningModule', () => {
  describe('with provider=mock', () => {
    let module: TestingModule;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [AiScreeningModule],
      })
        .overrideProvider(PrismaService)
        .useValue(mockPrismaService)
        .overrideProvider(getQueueToken(AI_SCREENING_QUEUE))
        .useValue(mockQueue)
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .compile();
    });

    it('compiles successfully', () => {
      expect(module).toBeDefined();
    });

    it('resolves AiScreeningService', () => {
      const service = module.get<AiScreeningService>(AiScreeningService);
      expect(service).toBeDefined();
    });

    it('resolves AiScreeningController', () => {
      const controller = module.get<AiScreeningController>(AiScreeningController);
      expect(controller).toBeDefined();
    });

    it('resolves AiScreeningProcessor', () => {
      const processor = module.get<AiScreeningProcessor>(AiScreeningProcessor);
      expect(processor).toBeDefined();
    });

    it('resolves ScreeningInputBuilderService', () => {
      const builder = module.get<ScreeningInputBuilderService>(ScreeningInputBuilderService);
      expect(builder).toBeDefined();
    });

    it('AI_SCREENING_PROVIDER resolves to MockScreeningProvider in mock mode', () => {
      const provider = module.get<MockScreeningProvider>(AI_SCREENING_PROVIDER);
      expect(provider).toBeInstanceOf(MockScreeningProvider);
      expect(provider.providerName).toBe('mock');
    });

    it('OPENAI_CLIENT resolves to null in mock mode', () => {
      const client = module.get(OPENAI_CLIENT);
      expect(client).toBeNull();
    });

    it('AiScreeningService does not inject AI_SCREENING_PROVIDER directly', () => {
      const service = module.get<AiScreeningService>(AiScreeningService);
      expect(service).toBeDefined();
      expect((service as unknown as Record<string, unknown>).provider).toBe('mock');
    });
  });

  describe('with provider=openai (no key)', () => {
    it('fails safely when OPENAI_API_KEY is missing', async () => {
      const openaiConfig = {
        ...mockConfigService,
        get: jest.fn((key: string) => {
          if (key === 'aiScreening.provider') return 'openai';
          if (key === 'aiScreening.openAiApiKey') return '';
          return mockConfigService.get(key);
        }),
      };

      await expect(
        Test.createTestingModule({
          imports: [AiScreeningModule],
        })
          .overrideProvider(PrismaService)
          .useValue(mockPrismaService)
          .overrideProvider(getQueueToken(AI_SCREENING_QUEUE))
          .useValue(mockQueue)
          .overrideProvider(ConfigService)
          .useValue(openaiConfig)
          .compile(),
      ).rejects.toThrow('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
    });
  });

  describe('with unsupported provider', () => {
    it('fails safely for unsupported provider value', async () => {
      const badConfig = {
        ...mockConfigService,
        get: jest.fn((key: string) => {
          if (key === 'aiScreening.provider') return 'invalid-provider';
          return mockConfigService.get(key);
        }),
      };

      await expect(
        Test.createTestingModule({
          imports: [AiScreeningModule],
        })
          .overrideProvider(PrismaService)
          .useValue(mockPrismaService)
          .overrideProvider(getQueueToken(AI_SCREENING_QUEUE))
          .useValue(mockQueue)
          .overrideProvider(ConfigService)
          .useValue(badConfig)
          .compile(),
      ).rejects.toThrow(/Unsupported AI_SCREENING_PROVIDER/);
    });
  });

  describe('queue registration', () => {
    it('ai-screening queue is registered', async () => {
      const module = await Test.createTestingModule({
        imports: [AiScreeningModule],
      })
        .overrideProvider(PrismaService)
        .useValue(mockPrismaService)
        .overrideProvider(getQueueToken(AI_SCREENING_QUEUE))
        .useValue(mockQueue)
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .compile();

      const queue = module.get(getQueueToken(AI_SCREENING_QUEUE));
      expect(queue).toBeDefined();
    });
  });
});
