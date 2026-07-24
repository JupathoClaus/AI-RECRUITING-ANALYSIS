import { Module } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import {
  MockNotificationProvider,
  NOTIFICATION_PROVIDER,
} from './interfaces/notification-provider.interface';
import { InAppNotificationsService } from './services/in-app-notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    InAppNotificationsService,
    { provide: NOTIFICATION_PROVIDER, useClass: MockNotificationProvider },
  ],
  exports: [NotificationService, NOTIFICATION_PROVIDER, InAppNotificationsService],
})
export class NotificationsModule {}
