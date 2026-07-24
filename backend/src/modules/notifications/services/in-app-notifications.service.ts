import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationQueryDto } from '../dto/notification-query.dto';

export interface CreateNotificationDto {
  userId: string;
  companyId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
}

@Injectable()
export class InAppNotificationsService {
  private readonly logger = new Logger(InAppNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a consistent user-scope filter.
   *
   * Policy: A notification is visible when:
   *  - notification.userId === userId, AND
   *  - notification.companyId === activeCompanyId, OR notification.companyId IS NULL
   *
   * When no activeCompanyId is set, only global (companyId = null) records are accessible.
   */
  private buildUserScope(userId: string, companyId?: string): Prisma.UserNotificationWhereInput {
    const base: Prisma.UserNotificationWhereInput = { userId };
    if (companyId) {
      base.OR = [
        { companyId },
        { companyId: null },
      ];
    } else {
      base.companyId = null;
    }
    return base;
  }

  async findAll(userId: string, companyId: string | undefined, query: NotificationQueryDto) {
    const where: Prisma.UserNotificationWhereInput = this.buildUserScope(userId, companyId);
    if (query.type) where.type = query.type;
    if (query.unread === true) where.readAt = null;
    if (query.category === 'system') {
      where.type = { in: [NotificationType.AI_SCREENING_COMPLETED, NotificationType.SYSTEM] };
    }
    if (query.category === 'application') {
      where.type = { in: [NotificationType.APPLICATION_SUBMITTED, NotificationType.APPLICATION_STAGE_CHANGED] };
    }
    if (query.category === 'interview') {
      where.type = {
        in: [NotificationType.INTERVIEW_SCHEDULED, NotificationType.INTERVIEW_RESCHEDULED, NotificationType.INTERVIEW_CANCELLED, NotificationType.INTERVIEW_COMPLETED],
      };
    }
    if (query.category === 'invitation') {
      where.type = { in: [NotificationType.INVITATION_SENT, NotificationType.INVITATION_ACCEPTED] };
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userNotification.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string, companyId?: string): Promise<number> {
    const where: Prisma.UserNotificationWhereInput = this.buildUserScope(userId, companyId);
    where.readAt = null;
    return this.prisma.userNotification.count({ where });
  }

  async markRead(notificationId: string, userId: string, companyId?: string): Promise<void> {
    const where: Prisma.UserNotificationWhereInput = {
      id: notificationId,
      ...this.buildUserScope(userId, companyId),
    };
    const notification = await this.prisma.userNotification.findFirst({ where });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string, companyId?: string): Promise<number> {
    const where: Prisma.UserNotificationWhereInput = this.buildUserScope(userId, companyId);
    where.readAt = null;
    const result = await this.prisma.userNotification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async delete(notificationId: string, userId: string, companyId?: string): Promise<void> {
    const where: Prisma.UserNotificationWhereInput = {
      id: notificationId,
      ...this.buildUserScope(userId, companyId),
    };
    const notification = await this.prisma.userNotification.findFirst({ where });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.userNotification.delete({ where: { id: notificationId } });
  }

  async create(dto: CreateNotificationDto): Promise<void> {
    try {
      await this.prisma.userNotification.create({
        data: {
          userId: dto.userId,
          companyId: dto.companyId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          actionUrl: dto.actionUrl,
        },
      });
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Unknown error';
      this.logger.warn(`Failed to create notification: ${message}`);
    }
  }
}
