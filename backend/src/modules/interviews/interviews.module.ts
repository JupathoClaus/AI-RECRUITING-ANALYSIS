import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@database/database.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { InterviewsController } from './controllers/interviews.controller';
import { ApplicationInterviewsController } from './controllers/application-interviews.controller';
import { InterviewConfirmationController } from './controllers/interview-confirmation.controller';
import { InterviewsService } from './services/interviews.service';
import { InterviewConflictService } from './services/interview-conflict.service';
import { InterviewReminderService } from './services/interview-reminder.service';
import { InterviewTokenService } from './services/interview-token.service';

// Workers are excluded in test mode to prevent BullMQ open-handle issues
// in Jest. Workers are production-only.
const isTest = process.env.NODE_ENV === 'test';

const providers = [
  InterviewsService,
  InterviewConflictService,
  InterviewReminderService,
  InterviewTokenService,
];

if (!isTest) {
  // Lazy import to avoid loading BullMQ workers during unit tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { InterviewNotificationWorker } = require('./workers/interview-notification.worker');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { InterviewReminderWorker } = require('./workers/interview-reminder.worker');
  providers.push(InterviewNotificationWorker, InterviewReminderWorker);
}

@Module({
  imports: [
    DatabaseModule,
    NotificationsModule,
    // FIX 3: Each worker owns its own dedicated queue
    BullModule.registerQueue({ name: 'interview-reminder' }, { name: 'interview-notification' }),
  ],
  controllers: [
    InterviewsController,
    ApplicationInterviewsController,
    InterviewConfirmationController,
  ],
  providers,
  exports: [
    InterviewsService,
    InterviewConflictService,
    InterviewReminderService,
    InterviewTokenService,
  ],
})
export class InterviewsModule {}
