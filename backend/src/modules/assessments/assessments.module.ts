import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import OpenAI from 'openai';
import { DatabaseModule } from '@database/database.module';
import { ApplicationsModule } from '@modules/applications/applications.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { AssessmentsController } from './controllers/assessments.controller';
import { PublicAssessmentsController } from './controllers/public-assessments.controller';
import { AssessmentsService } from './services/assessments.service';
import { AssessmentValidationService } from './services/assessment-validation.service';
import { AssessmentScoringService } from './services/assessment-scoring.service';
import { AssessmentCodeService } from './services/assessment-code.service';
import { AssessmentTokenService } from './services/assessment-token.service';
import { AssessmentGenerationService } from './services/assessment-generation.service';
import { AssessmentAssignmentsService } from './services/assessment-assignments.service';
import { AssessmentSessionsService } from './services/assessment-sessions.service';
import { AssessmentEvaluationService } from './services/assessment-evaluation.service';
import { AssessmentResultsService } from './services/assessment-results.service';
import { AssessmentEvidenceService } from './ai/assessment-evidence.service';
import { ASSESSMENT_AI_PROVIDER, AssessmentAiProvider } from './ai/assessment-ai-provider.token';
import { MockAssessmentProvider } from './ai/mock-assessment.provider';
import { QwenAssessmentProvider } from './ai/qwen-assessment.provider';
import { AssessmentProcessor } from './queue/assessment.processor';
import { ASSESSMENT_QUEUE } from './queue/assessment-queue.constants';

function createAssessmentAiProvider(configService: ConfigService): AssessmentAiProvider {
  const provider = configService.get<string>('assessment.aiProvider') || 'mock';
  if (provider === 'mock') return new MockAssessmentProvider();
  if (provider === 'qwen') {
    const baseURL = process.env.QWEN_BASE_URL || 'http://localhost:11434/v1';
    const client = new OpenAI({ apiKey: process.env.QWEN_API_KEY || 'ollama', baseURL });
    return new QwenAssessmentProvider(client, {
      model: process.env.QWEN_MODEL || 'qwen3.5:9b',
      baseUrl: baseURL,
      timeoutMs: configService.get<number>('assessment.aiTimeoutMs') || 60000,
      maxResponseChars: 15000,
      promptVersion: configService.get<string>('assessment.aiPromptVersion') || 'v1',
    });
  }
  throw new Error(`Unsupported ASSESSMENT_AI_PROVIDER: "${provider}". Valid values: mock, qwen`);
}

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    IdempotencyModule,
    ApplicationsModule,
    NotificationsModule,
    BullModule.registerQueue({ name: ASSESSMENT_QUEUE }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('assessment.accessTokenSecret') || '',
        signOptions: {
          expiresIn: `${configService.get<number>('assessment.accessTokenTtlMinutes') || 120}m`,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AssessmentsController, PublicAssessmentsController],
  providers: [
    AssessmentsService,
    AssessmentValidationService,
    AssessmentScoringService,
    AssessmentCodeService,
    AssessmentTokenService,
    AssessmentGenerationService,
    AssessmentAssignmentsService,
    AssessmentSessionsService,
    AssessmentEvaluationService,
    AssessmentResultsService,
    AssessmentEvidenceService,
    AssessmentProcessor,
    {
      provide: ASSESSMENT_AI_PROVIDER,
      useFactory: (configService: ConfigService): AssessmentAiProvider =>
        createAssessmentAiProvider(configService),
      inject: [ConfigService],
    },
  ],
  exports: [AssessmentsService, AssessmentAssignmentsService, AssessmentResultsService],
})
export class AssessmentsModule implements OnModuleInit {
  private readonly logger = new Logger(AssessmentsModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const provider = this.configService.get<string>('assessment.aiProvider') || 'mock';
    this.logger.log(`AssessmentsModule initialized with AI provider: ${provider}`);
  }
}
