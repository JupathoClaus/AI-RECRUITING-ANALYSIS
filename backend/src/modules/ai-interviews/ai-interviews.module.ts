import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import OpenAI from 'openai';
import { DatabaseModule } from '@database/database.module';
import { EmailModule } from '@modules/email/email.module';
import { ApplicationsModule } from '@modules/applications/applications.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { AiInterviewsController } from './controllers/ai-interviews.controller';
import { PublicAiInterviewsController } from './controllers/public-ai-interviews.controller';
import { TavusCallbackController } from './controllers/tavus-callback.controller';
import { AiInterviewsService } from './services/ai-interviews.service';
import { AiInterviewCodeService } from './services/ai-interview-code.service';
import { AiInterviewTokenService } from './services/ai-interview-token.service';
import { TavusClientService } from './services/tavus-client.service';
import { TavusArtifactSyncService } from './services/tavus-artifact-sync.service';
import { TavusArtifactSyncScheduler } from './services/tavus-artifact-sync-scheduler.service';
import { RecordingPlaybackService } from './services/recording-playback.service';
import { AiInterviewEvaluationService } from './evaluation/ai-interview-evaluation.service';
import { AiInterviewTranscriptService } from './evaluation/ai-interview-transcript.service';
import { AiInterviewEvidenceService } from './evaluation/ai-interview-evidence.service';
import { AiInterviewScoringService } from './evaluation/ai-interview-scoring.service';
import { MockAiInterviewEvaluationProvider } from './evaluation/mock-ai-interview-evaluation.provider';
import { QwenAiInterviewEvaluationProvider } from './evaluation/qwen-ai-interview-evaluation.provider';
import {
  AI_INTERVIEW_EVALUATION_AI_PROVIDER,
  AiInterviewAiProvider,
} from './evaluation/ai-interview-ai-provider.token';
import { AiInterviewEvaluationProcessor } from './evaluation/queue/ai-interview-evaluation.processor';
import { AI_INTERVIEW_EVALUATION_QUEUE } from './evaluation/queue/ai-interview-evaluation-queue.constants';

function createAiInterviewEvaluationProvider(configService: ConfigService): AiInterviewAiProvider {
  const provider = configService.get<string>('aiInterviewEvaluation.provider') || 'mock';
  if (provider === 'mock') return new MockAiInterviewEvaluationProvider();
  if (provider === 'qwen') {
    const baseURL = process.env.QWEN_BASE_URL || 'http://localhost:11434/v1';
    const client = new OpenAI({ apiKey: process.env.QWEN_API_KEY || 'ollama', baseURL });
    return new QwenAiInterviewEvaluationProvider(client, {
      model: process.env.QWEN_MODEL || 'qwen3.5:9b',
      baseUrl: baseURL,
      timeoutMs: configService.get<number>('aiInterviewEvaluation.timeoutMs') || 60000,
      maxResponseChars: 15000,
      promptVersion: configService.get<string>('aiInterviewEvaluation.promptVersion') || 'v1',
    });
  }
  throw new Error(
    `Unsupported AI_INTERVIEW_EVALUATION_PROVIDER: "${provider}". Valid values: mock, qwen`,
  );
}

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    ApplicationsModule,
    NotificationsModule,
    EmailModule,
    HttpModule,
    BullModule.registerQueue({ name: AI_INTERVIEW_EVALUATION_QUEUE }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('aiInterview.accessTokenSecret') || '',
        signOptions: {
          expiresIn: `${configService.get<number>('aiInterview.accessTokenTtlMinutes') || 60}m`,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AiInterviewsController, PublicAiInterviewsController, TavusCallbackController],
  providers: [
    AiInterviewsService,
    AiInterviewCodeService,
    AiInterviewTokenService,
    TavusClientService,
    TavusArtifactSyncService,
    TavusArtifactSyncScheduler,
    RecordingPlaybackService,
    AiInterviewEvaluationService,
    AiInterviewTranscriptService,
    AiInterviewEvidenceService,
    AiInterviewScoringService,
    AiInterviewEvaluationProcessor,
    {
      provide: AI_INTERVIEW_EVALUATION_AI_PROVIDER,
      useFactory: (configService: ConfigService): AiInterviewAiProvider =>
        createAiInterviewEvaluationProvider(configService),
      inject: [ConfigService],
    },
  ],
  exports: [AiInterviewsService],
})
export class AiInterviewsModule implements OnModuleInit {
  private readonly logger = new Logger(AiInterviewsModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const provider = this.configService.get<string>('aiInterviewEvaluation.provider') || 'mock';
    this.logger.log(
      `AiInterviewsModule initialized with post-interview evaluation provider: ${provider}`,
    );
  }
}
