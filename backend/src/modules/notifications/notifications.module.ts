import { Module } from '@nestjs/common';
import { EmailModule } from '@modules/email/email.module';
import { NotificationService } from './services/notification.service';
import {
  MockNotificationProvider,
  NOTIFICATION_PROVIDER,
} from './interfaces/notification-provider.interface';
import { InAppNotificationsService } from './services/in-app-notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailNotificationProvider } from './providers/email-notification.provider';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    InAppNotificationsService,
    {
      provide: NOTIFICATION_PROVIDER,
      useClass: isTest ? MockNotificationProvider : EmailNotificationProvider,
    },
  ],
  exports: [NotificationService, NOTIFICATION_PROVIDER, InAppNotificationsService],
})
export class NotificationsModule {}
