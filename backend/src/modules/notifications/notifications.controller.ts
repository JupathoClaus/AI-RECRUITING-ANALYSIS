import {
  Controller, Get, Patch, Delete, Param, Query, Body,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../auth/interfaces/auth.interface';
import { InAppNotificationsService } from './services/in-app-notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: InAppNotificationsService) {}

  @Get()
  async findAll(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.notificationsService.findAll(user.userId, user.activeCompanyId, query);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthenticatedPrincipal) {
    const count = await this.notificationsService.getUnreadCount(
      user.userId,
      user.activeCompanyId,
    );
    return { count };
  }

  @Patch(':notificationId/read')
  async markRead(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    await this.notificationsService.markRead(notificationId, user.userId);
    return { success: true };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedPrincipal) {
    const count = await this.notificationsService.markAllRead(
      user.userId,
      user.activeCompanyId,
    );
    return { count };
  }

  @Delete(':notificationId')
  async delete(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    await this.notificationsService.delete(notificationId, user.userId);
    return { success: true };
  }
}
