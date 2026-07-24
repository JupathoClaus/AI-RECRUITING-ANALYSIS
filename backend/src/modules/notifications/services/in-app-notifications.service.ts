import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { NotificationType } from '@prisma/client';
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

  async findAll(userId: string, companyId: string | undefined, query: NotificationQueryDto) {
    const where: Record<string, unknown> = { userId };
    if (companyId) where.companyId = companyId;
    if (query.type) where.type = query.type;
    if (query.unread === true) where.readAt = null;

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
    const where: Record<string, unknown> = { userId, readAt: null };
    if (companyId) where.companyId = companyId;
    return this.prisma.userNotification.count({ where });
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.userNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string, companyId?: string): Promise<number> {
    const where: Record<string, unknown> = { userId, readAt: null };
    if (companyId) where.companyId = companyId;

    const result = await this.prisma.userNotification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async archive(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.userNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async delete(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.userNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.userNotification.delete({
      where: { id: notificationId },
    });
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
      this.logger.warn(`Failed to create notification: ${(err as Error).message}`);
    }
  }
}
