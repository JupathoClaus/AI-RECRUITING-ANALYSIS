import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@database/database.module';
import { AiScreeningController } from './ai-screening.controller';
import { AiScreeningService } from './ai-screening.service';
import { AI_SCREENING_PROVIDER } from './providers/ai-screening-provider.token';
import { MockScreeningProvider } from './providers/mock-screening.provider';
import { OpenAiScreeningProvider } from './providers/openai-screening.provider';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [AiScreeningController],
  providers: [
    AiScreeningService,
    {
      provide: AI_SCREENING_PROVIDER,
      useFactory: (configService: ConfigService) => {
        if (isTest) {
          return new MockScreeningProvider(configService);
        }
        const provider = configService.get<string>('app.aiScreeningProvider') || 'mock';
        if (provider === 'openai') {
          return new OpenAiScreeningProvider(configService);
        }
        return new MockScreeningProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [AiScreeningService],
})
export class AiScreeningModule {}
