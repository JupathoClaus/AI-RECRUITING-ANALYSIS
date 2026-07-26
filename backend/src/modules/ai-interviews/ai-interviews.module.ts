import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '@database/database.module';
import { EmailModule } from '@modules/email/email.module';
import { AiInterviewsController } from './controllers/ai-interviews.controller';
import { PublicAiInterviewsController } from './controllers/public-ai-interviews.controller';
import { TavusCallbackController } from './controllers/tavus-callback.controller';
import { AiInterviewsService } from './services/ai-interviews.service';
import { AiInterviewCodeService } from './services/ai-interview-code.service';
import { TavusClientService } from './services/tavus-client.service';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    HttpModule,
  ],
  controllers: [
    AiInterviewsController,
    PublicAiInterviewsController,
    TavusCallbackController,
  ],
  providers: [
    AiInterviewsService,
    AiInterviewCodeService,
    TavusClientService,
  ],
  exports: [AiInterviewsService],
})
export class AiInterviewsModule {}
