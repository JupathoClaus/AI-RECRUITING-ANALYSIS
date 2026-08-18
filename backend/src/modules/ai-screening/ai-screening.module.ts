import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import OpenAI from 'openai';
import { DatabaseModule } from '@database/database.module';
import { ResumeProcessingModule } from '../resume-processing/resume-processing.module';
import { AI_SCREENING_PROVIDER } from './providers/ai-screening-provider.token';
import { OPENAI_CLIENT } from './providers/openai-client.token';
import { AiScreeningProvider } from './providers/ai-screening-provider.interface';
import {
  OpenAiScreeningProvider,
  OpenAiScreeningConfig,
} from './providers/openai-screening.provider';
import {
  DeepSeekScreeningProvider,
  DeepSeekScreeningConfig,
} from './providers/deepseek-screening.provider';
import { QwenScreeningProvider, QwenScreeningConfig } from './providers/qwen-screening.provider';
import {
  MockScreeningProvider,
  MockScreeningProviderOptions,
} from './providers/mock-screening.provider';
import { AiScreeningController } from './ai-screening.controller';
import { AiScreeningService } from './ai-screening.service';
import { AiScreeningProcessor } from './queue/ai-screening.processor';
import { ScreeningInputBuilderService } from './services/screening-input-builder.service';
import { ResumeTextLoaderService } from './services/resume-text-loader.service';
import { CriterionBuilderService } from './services/criterion-builder.service';
import { ExperienceDurationService } from './services/experience-duration.service';
import { BackendScoringService } from './services/backend-scoring.service';
import { EvidenceVerificationService } from './services/evidence-verification.service';
import { BulkScreeningService } from './services/bulk-screening.service';
import { BulkScreeningController } from './controllers/bulk-screening.controller';
import { AI_SCREENING_QUEUE } from './queue/ai-screening-queue.constants';

function createAiScreeningProvider(
  configService: ConfigService,
  openAiClient: OpenAI | null,
  scorer: BackendScoringService,
  evidenceVerifier: EvidenceVerificationService,
): AiScreeningProvider {
  const providerName = configService.get<string>('aiScreening.provider') || 'mock';

  if (providerName === 'mock') {
    const scenario = configService.get<string>('aiScreening.mockScenario') || undefined;
    const options: MockScreeningProviderOptions = {};
    if (scenario) options.scenario = scenario as MockScreeningProviderOptions['scenario'];
    return new MockScreeningProvider(options);
  }

  if (providerName === 'openai') {
    if (!openAiClient) {
      throw new Error('OpenAI client not available. Ensure OPENAI_API_KEY is configured.');
    }
    const config: OpenAiScreeningConfig = {
      model: configService.get<string>('aiScreening.openAiModel') || 'gpt-4o-mini',
      timeoutMs: configService.get<number>('aiScreening.timeoutMs') || 60000,
      maxResumeChars: configService.get<number>('aiScreening.maxResumeChars') || 15000,
      promptVersion: configService.get<string>('aiScreening.promptVersion') || 'v1',
    };
    return new OpenAiScreeningProvider(openAiClient, config);
  }

  if (providerName === 'deepseek') {
    const apiKey = configService.get<string>('aiScreening.deepSeekApiKey');
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required when AI_SCREENING_PROVIDER=deepseek');
    }
    const baseURL =
      configService.get<string>('aiScreening.deepSeekBaseUrl') || 'https://api.deepseek.com';
    const deepSeekClient = new OpenAI({ apiKey, baseURL });
    const config: DeepSeekScreeningConfig = {
      model: configService.get<string>('aiScreening.deepSeekModel') || 'deepseek-chat',
      timeoutMs: configService.get<number>('aiScreening.timeoutMs') || 60000,
      maxResumeChars: configService.get<number>('aiScreening.maxResumeChars') || 15000,
      promptVersion: configService.get<string>('aiScreening.promptVersion') || 'v1',
    };
    return new DeepSeekScreeningProvider(deepSeekClient, config);
  }

  if (providerName === 'qwen') {
    const apiKey = configService.get<string>('aiScreening.qwenApiKey') || 'ollama';
    const baseURL =
      configService.get<string>('aiScreening.qwenBaseUrl') || 'http://localhost:11434/v1';
    if (!baseURL) {
      throw new Error('QWEN_BASE_URL is required when AI_SCREENING_PROVIDER=qwen');
    }
    const qwenClient = new OpenAI({ apiKey, baseURL });
    const config: QwenScreeningConfig = {
      model: configService.get<string>('aiScreening.qwenModel') || 'qwen3.5:9b',
      baseUrl: baseURL,
      timeoutMs: configService.get<number>('aiScreening.timeoutMs') || 60000,
      maxResumeChars: configService.get<number>('aiScreening.maxResumeChars') || 15000,
      promptVersion: configService.get<string>('aiScreening.promptVersion') || 'v1',
    };
    return new QwenScreeningProvider(qwenClient, config, scorer, evidenceVerifier);
  }

  throw new Error(
    `Unsupported AI_SCREENING_PROVIDER: "${providerName}". Valid values: mock, openai, deepseek, qwen`,
  );
}

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    ResumeProcessingModule,
    BullModule.registerQueue({ name: AI_SCREENING_QUEUE }),
  ],
  controllers: [AiScreeningController, BulkScreeningController],
  providers: [
    // Core infrastructure (unchanged)
    ScreeningInputBuilderService,
    ResumeTextLoaderService,
    AiScreeningService,
    AiScreeningProcessor,
    // New Qwen-era services
    CriterionBuilderService,
    ExperienceDurationService,
    BackendScoringService,
    EvidenceVerificationService,
    BulkScreeningService,
    // OpenAI client (only created when provider=openai)
    {
      provide: OPENAI_CLIENT,
      useFactory: (configService: ConfigService): OpenAI | null => {
        const provider = configService.get<string>('aiScreening.provider');
        if (provider !== 'openai') return null;
        const apiKey = configService.get<string>('aiScreening.openAiApiKey');
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
        }
        return new OpenAI({ apiKey });
      },
      inject: [ConfigService],
    },
    // Provider selection factory
    {
      provide: AI_SCREENING_PROVIDER,
      useFactory: (
        configService: ConfigService,
        openAiClient: OpenAI | null,
        scorer: BackendScoringService,
        evidenceVerifier: EvidenceVerificationService,
      ): AiScreeningProvider => {
        return createAiScreeningProvider(configService, openAiClient, scorer, evidenceVerifier);
      },
      inject: [
        ConfigService,
        { token: OPENAI_CLIENT, optional: true },
        BackendScoringService,
        EvidenceVerificationService,
      ],
    },
  ],
  exports: [AiScreeningService, BulkScreeningService, CriterionBuilderService],
})
export class AiScreeningModule implements OnModuleInit {
  private readonly logger = new Logger(AiScreeningModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const provider = this.configService.get<string>('aiScreening.provider') || 'mock';
    let model: string;
    switch (provider) {
      case 'openai':
        model = this.configService.get<string>('aiScreening.openAiModel') || 'gpt-4o-mini';
        break;
      case 'deepseek':
        model = this.configService.get<string>('aiScreening.deepSeekModel') || 'deepseek-chat';
        break;
      case 'qwen':
        model = this.configService.get<string>('aiScreening.qwenModel') || 'qwen3.5:9b';
        break;
      default:
        model = 'mock';
    }
    this.logger.log(`AiScreeningModule initialized with provider: ${provider} (model: ${model})`);
  }
}
