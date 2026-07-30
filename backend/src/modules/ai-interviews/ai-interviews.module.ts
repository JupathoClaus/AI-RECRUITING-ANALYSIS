import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '@database/database.module';
import { EmailModule } from '@modules/email/email.module';
import { AiInterviewsController } from './controllers/ai-interviews.controller';
import { PublicAiInterviewsController } from './controllers/public-ai-interviews.controller';
import { TavusCallbackController } from './controllers/tavus-callback.controller';
import { AiInterviewsService } from './services/ai-interviews.service';
import { AiInterviewCodeService } from './services/ai-interview-code.service';
import { AiInterviewTokenService } from './services/ai-interview-token.service';
import { TavusClientService } from './services/tavus-client.service';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    HttpModule,
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
  ],
  exports: [AiInterviewsService],
})
export class AiInterviewsModule {}
