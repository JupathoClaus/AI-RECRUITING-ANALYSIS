import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { InAppNotificationsService } from '../services/in-app-notifications.service';
import { NotificationType } from '@prisma/client';
import { NotificationQueryDto } from '../dto/notification-query.dto';

describe('InAppNotificationsService', () => {
  let service: InAppNotificationsService;
  let prisma: any;

  const mockPrisma = {
    userNotification: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const USER_ID = 'user-1';
  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';
  const NOTIF_ID = 'notif-1';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InAppNotificationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<InAppNotificationsService>(InAppNotificationsService);
    prisma = mockPrisma;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    const buildQuery = (overrides?: Partial<NotificationQueryDto>): NotificationQueryDto =>
      Object.assign(new NotificationQueryDto(), { page: 1, limit: 20, ...overrides });

    it('scopes by authenticated user', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, undefined, buildQuery());
      expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        }),
      );
    });

    it('scopes by active company including global records', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, COMPANY_A, buildQuery());
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(USER_ID);
      expect(where.OR).toEqual(
        expect.arrayContaining([{ companyId: COMPANY_A }, { companyId: null }]),
      );
    });

    it('restricts to global-only when no active company', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, undefined, buildQuery());
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBeNull();
      expect(where.OR).toBeUndefined();
    });

    it('applies unread filter', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, undefined, buildQuery({ unread: true }));
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.readAt).toBeNull();
    });

    it('applies category=system filter', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, undefined, buildQuery({ category: 'system' }));
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.type).toEqual({
        in: [NotificationType.AI_SCREENING_COMPLETED, NotificationType.SYSTEM],
      });
    });

    it('uses createdAt descending ordering', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      await service.findAll(USER_ID, undefined, buildQuery());
      expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('applies skip and take correctly', async () => {
      prisma.userNotification.count.mockResolvedValue(50);
      prisma.userNotification.findMany.mockResolvedValue(Array(20).fill({}));
      await service.findAll(USER_ID, undefined, buildQuery({ page: 2, limit: 10 }));
      expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('returns accurate pagination metadata', async () => {
      prisma.userNotification.count.mockResolvedValue(25);
      prisma.userNotification.findMany.mockResolvedValue(Array(20).fill({ id: 'n' }));
      const result = await service.findAll(USER_ID, undefined, buildQuery({ page: 1, limit: 20 }));
      expect(result.meta).toEqual({ total: 25, page: 1, limit: 20, totalPages: 2 });
      expect(result.items).toHaveLength(20);
    });
  });

  // ── getUnreadCount ──

  describe('getUnreadCount', () => {
    it('scopes by user and readAt=null', async () => {
      prisma.userNotification.count.mockResolvedValue(3);
      const count = await service.getUnreadCount(USER_ID, undefined);
      expect(count).toBe(3);
      expect(prisma.userNotification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, readAt: null }),
        }),
      );
    });

    it('scopes by active company including global records', async () => {
      prisma.userNotification.count.mockResolvedValue(2);
      await service.getUnreadCount(USER_ID, COMPANY_A);
      const where = prisma.userNotification.count.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ companyId: COMPANY_A }, { companyId: null }]),
      );
    });

    it('restricts to global-only when no active company', async () => {
      prisma.userNotification.count.mockResolvedValue(1);
      await service.getUnreadCount(USER_ID, undefined);
      const where = prisma.userNotification.count.mock.calls[0][0].where;
      expect(where.companyId).toBeNull();
    });
  });

  // ── markRead ──

  describe('markRead', () => {
    it('succeeds for correct user and company', async () => {
      prisma.userNotification.findFirst.mockResolvedValue({
        id: NOTIF_ID,
        userId: USER_ID,
        companyId: COMPANY_A,
      });
      await service.markRead(NOTIF_ID, USER_ID, COMPANY_A);
      expect(prisma.userNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTIF_ID },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects wrong user', async () => {
      prisma.userNotification.findFirst.mockResolvedValue(null);
      await expect(service.markRead(NOTIF_ID, 'other-user', COMPANY_A)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects wrong company', async () => {
      prisma.userNotification.findFirst.mockResolvedValue(null);
      await expect(service.markRead(NOTIF_ID, USER_ID, COMPANY_B)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows global notification from any company', async () => {
      prisma.userNotification.findFirst.mockResolvedValue({
        id: NOTIF_ID,
        userId: USER_ID,
        companyId: null,
      });
      await service.markRead(NOTIF_ID, USER_ID, COMPANY_A);
      expect(prisma.userNotification.update).toHaveBeenCalled();
    });

    it('writes readAt', async () => {
      prisma.userNotification.findFirst.mockResolvedValue({
        id: NOTIF_ID,
        userId: USER_ID,
        companyId: COMPANY_A,
      });
      await service.markRead(NOTIF_ID, USER_ID, COMPANY_A);
      expect(prisma.userNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { readAt: expect.any(Date) },
        }),
      );
    });
  });

  // ── markAllRead ──

  describe('markAllRead', () => {
    it('affects only current user and company scope', async () => {
      prisma.userNotification.updateMany.mockResolvedValue({ count: 5 });
      const count = await service.markAllRead(USER_ID, COMPANY_A);
      expect(count).toBe(5);
      const where = prisma.userNotification.updateMany.mock.calls[0][0].where;
      expect(where.userId).toBe(USER_ID);
      expect(where.readAt).toBeNull();
      expect(where.OR).toEqual(
        expect.arrayContaining([{ companyId: COMPANY_A }, { companyId: null }]),
      );
    });

    it('includes global records when scoped by company', async () => {
      prisma.userNotification.updateMany.mockResolvedValue({ count: 3 });
      await service.markAllRead(USER_ID, COMPANY_A);
      const where = prisma.userNotification.updateMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ companyId: COMPANY_A }, { companyId: null }]),
      );
    });
  });

  // ── delete ──

  describe('delete', () => {
    it('succeeds for correct owner and tenant', async () => {
      prisma.userNotification.findFirst.mockResolvedValue({
        id: NOTIF_ID,
        userId: USER_ID,
        companyId: COMPANY_A,
      });
      await service.delete(NOTIF_ID, USER_ID, COMPANY_A);
      expect(prisma.userNotification.delete).toHaveBeenCalledWith({ where: { id: NOTIF_ID } });
    });

    it('rejects wrong user', async () => {
      prisma.userNotification.findFirst.mockResolvedValue(null);
      await expect(service.delete(NOTIF_ID, 'other-user', COMPANY_A)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects wrong company', async () => {
      prisma.userNotification.findFirst.mockResolvedValue(null);
      await expect(service.delete(NOTIF_ID, USER_ID, COMPANY_B)).rejects.toThrow(NotFoundException);
    });

    it('allows global record deletion from any company', async () => {
      prisma.userNotification.findFirst.mockResolvedValue({
        id: NOTIF_ID,
        userId: USER_ID,
        companyId: null,
      });
      await service.delete(NOTIF_ID, USER_ID, COMPANY_A);
      expect(prisma.userNotification.delete).toHaveBeenCalled();
    });
  });

  // ── create ──

  describe('create', () => {
    const dto = {
      userId: USER_ID,
      companyId: COMPANY_A,
      type: NotificationType.APPLICATION_SUBMITTED,
      title: 'New application',
      body: 'A candidate applied',
    };

    it('creates a correctly typed notification', async () => {
      prisma.userNotification.create.mockResolvedValue({ id: 'new-id' });
      await service.create(dto);
      expect(prisma.userNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          companyId: COMPANY_A,
          type: NotificationType.APPLICATION_SUBMITTED,
          title: 'New application',
          body: 'A candidate applied',
        }),
      });
    });

    it('logs warning and resolves without throwing when Prisma creation fails', async () => {
      const loggerWarn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
      prisma.userNotification.create.mockRejectedValue(new Error('DB timeout'));
      await expect(service.create(dto)).resolves.toBeUndefined();
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create notification: DB timeout'),
      );
      loggerWarn.mockRestore();
    });
  });

  // ── buildUserScope policy ──

  describe('global-notification policy (private helper)', () => {
    it('includes company-scoped and global records when companyId is set', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      const query = Object.assign(new NotificationQueryDto(), { page: 1, limit: 20 });
      await service.findAll(USER_ID, COMPANY_A, query);
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.OR).toContainEqual({ companyId: COMPANY_A });
      expect(where.OR).toContainEqual({ companyId: null });
    });

    it('filters to only global records when no active company', async () => {
      prisma.userNotification.count.mockResolvedValue(0);
      prisma.userNotification.findMany.mockResolvedValue([]);
      const query = Object.assign(new NotificationQueryDto(), { page: 1, limit: 20 });
      await service.findAll(USER_ID, undefined, query);
      const where = prisma.userNotification.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBeNull();
      expect(where.OR).toBeUndefined();
    });
  });
});
