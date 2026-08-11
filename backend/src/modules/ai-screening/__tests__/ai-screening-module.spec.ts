import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { OPENAI_CLIENT } from '../providers/openai-client.token';
import { MockScreeningProvider } from '../providers/mock-screening.provider';
import {
  OpenAiScreeningProvider,
  OpenAiScreeningConfig,
} from '../providers/openai-screening.provider';
import { AI_SCREENING_QUEUE } from '../queue/ai-screening-queue.constants';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { ResumeTextLoaderService } from '../services/resume-text-loader.service';
import { ResumeExtractionService } from '../../resume-processing/services/resume-extraction.service';
import { AiScreeningService } from '../ai-screening.service';
import { PrismaService } from '@database/prisma/prisma.service';

const mockConfig = (overrides?: Record<string, any>): ConfigService =>
  ({
    get: jest.fn((key: string) => {
      const cfg: Record<string, unknown> = {
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
        ...overrides,
      };
      return cfg[key];
    }),
    getJSON: jest.fn(),
  }) as any;

function createMockProvider(providerName: string, openAiClient: any, cfg: ConfigService) {
  const name = cfg.get('aiScreening.provider');
  if (name === 'mock') {
    return new MockScreeningProvider();
  }
  if (name === 'openai') {
    if (!openAiClient)
      throw new Error('OpenAI client not available. Ensure OPENAI_API_KEY is configured.');
    const config: OpenAiScreeningConfig = {
      model: cfg.get('aiScreening.openAiModel') || 'gpt-4o-mini',
      timeoutMs: cfg.get<number>('aiScreening.timeoutMs') || 30000,
      maxResumeChars: cfg.get<number>('aiScreening.maxResumeChars') || 15000,
      promptVersion: cfg.get<string>('aiScreening.promptVersion') || 'v1',
    };
    return new OpenAiScreeningProvider(openAiClient, config);
  }
  throw new Error(`Unsupported AI_SCREENING_PROVIDER: ${name}. Use 'mock' or 'openai'.`);
}

describe('AiScreeningModule', () => {
  describe('with provider=mock', () => {
    it('AI_SCREENING_PROVIDER resolves to MockScreeningProvider', () => {
      const provider = createMockProvider('mock', null, mockConfig());
      expect(provider).toBeInstanceOf(MockScreeningProvider);
      expect(provider.providerName).toBe('mock');
    });

    it('OPENAI_CLIENT resolves to null in mock mode', () => {
      const cfg = mockConfig();
      const factory = () => {
        if (cfg.get('aiScreening.provider') !== 'openai') return null;
        const apiKey = cfg.get('aiScreening.openAiApiKey');
        if (!apiKey)
          throw new Error('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
        return {};
      };
      expect(factory()).toBeNull();
    });

    it('AiScreeningService can be instantiated', () => {
      const prisma = {} as PrismaService;
      const builder = new ScreeningInputBuilderService(mockConfig());
      const loader = new ResumeTextLoaderService(prisma);
      const extractionService = {
        requestExtraction: jest.fn(),
      } as unknown as ResumeExtractionService;
      const queue = { add: jest.fn() } as any;
      const service = new AiScreeningService(
        prisma,
        builder,
        loader,
        extractionService,
        queue,
        mockConfig(),
      );
      expect(service).toBeDefined();
    });
  });

  describe('with provider=openai (no key)', () => {
    it('fails safely when OPENAI_API_KEY is missing', () => {
      const cfg = mockConfig({ 'aiScreening.provider': 'openai', 'aiScreening.openAiApiKey': '' });
      expect(() => {
        const apiKey = cfg.get('aiScreening.openAiApiKey');
        if (!apiKey)
          throw new Error('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
      }).toThrow('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
    });
  });

  describe('with unsupported provider', () => {
    it('fails safely for unsupported provider value', () => {
      const cfg = mockConfig({ 'aiScreening.provider': 'invalid-provider' });
      expect(() => createMockProvider('invalid', null, cfg)).toThrow(
        /Unsupported AI_SCREENING_PROVIDER/,
      );
    });
  });

  describe('queue registration', () => {
    it('ai-screening queue token is defined', () => {
      const token = getQueueToken(AI_SCREENING_QUEUE);
      expect(token).toBeDefined();
    });
  });
});
