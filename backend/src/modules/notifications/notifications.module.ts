import { Module } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import {
  MockNotificationProvider,
  NOTIFICATION_PROVIDER,
} from './interfaces/notification-provider.interface';

@Module({
  providers: [
    NotificationService,
    { provide: NOTIFICATION_PROVIDER, useClass: MockNotificationProvider },
  ],
  exports: [NotificationService, NOTIFICATION_PROVIDER],
})
export class NotificationsModule {}
