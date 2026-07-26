import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import OpenAI from 'openai';
import { DatabaseModule } from '@database/database.module';
import { ResumeProcessingModule } from '../resume-processing/resume-processing.module';
import { AI_SCREENING_PROVIDER } from './providers/ai-screening-provider.token';
import { OPENAI_CLIENT } from './providers/openai-client.token';
import { AiScreeningProvider } from './providers/ai-screening-provider.interface';
import { OpenAiScreeningProvider, OpenAiScreeningConfig } from './providers/openai-screening.provider';
import { MockScreeningProvider, MockScreeningProviderOptions } from './providers/mock-screening.provider';
import { AiScreeningController } from './ai-screening.controller';
import { AiScreeningService } from './ai-screening.service';
import { AiScreeningProcessor } from './queue/ai-screening.processor';
import { ScreeningInputBuilderService } from './services/screening-input-builder.service';
import { ResumeTextLoaderService } from './services/resume-text-loader.service';
import { AI_SCREENING_QUEUE } from './queue/ai-screening-queue.constants';

function createAiScreeningProvider(
  configService: ConfigService,
  openAiClient: OpenAI | null,
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
      timeoutMs: configService.get<number>('aiScreening.timeoutMs') || 30000,
      maxResumeChars: configService.get<number>('aiScreening.maxResumeChars') || 15000,
      promptVersion: configService.get<string>('aiScreening.promptVersion') || 'v1',
    };
    return new OpenAiScreeningProvider(openAiClient, config);
  }

  throw new Error(
    `Unsupported AI_SCREENING_PROVIDER: ${providerName}. Use 'mock' or 'openai'.`,
  );
}

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    ResumeProcessingModule,
    BullModule.registerQueue({ name: AI_SCREENING_QUEUE }),
  ],
  controllers: [AiScreeningController],
  providers: [
    ScreeningInputBuilderService,
    ResumeTextLoaderService,
    AiScreeningService,
    AiScreeningProcessor,
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
    {
      provide: AI_SCREENING_PROVIDER,
      useFactory: (
        configService: ConfigService,
        openAiClient: OpenAI | null,
      ): AiScreeningProvider => {
        return createAiScreeningProvider(configService, openAiClient);
      },
      inject: [ConfigService, { token: OPENAI_CLIENT, optional: true }],
    },
  ],
  exports: [AiScreeningService],
})
export class AiScreeningModule implements OnModuleInit {
  private readonly logger = new Logger(AiScreeningModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const provider = this.configService.get<string>('aiScreening.provider') || 'mock';
    this.logger.log(`AiScreeningModule initialized with provider: ${provider}`);
  }
}
