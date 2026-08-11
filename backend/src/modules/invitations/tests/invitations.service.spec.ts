import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { QueueService } from '@modules/queue/queue.service';
import { PasswordService } from '@modules/auth/services/password.service';
import { InvitationsService } from '../invitations.service';
import { OrganizationAuditEventType, InvitationStatus, MembershipStatus } from '@prisma/client';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: any;
  let orgAuditService: any;
  let queueService: any;
  let passwordService: any;

  const mockPrismaService = {
    $transaction: jest.fn(),
    role: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    companyInvitation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    companyMembership: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    departmentMembership: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    organizationAuditEvent: { create: jest.fn() },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'app.env': 'test',
        'invitations.defaultExpiresInDays': 30,
      };
      return config[key];
    }),
  };

  const mockOrgAuditService = {
    record: jest.fn(),
  };

  const mockQueueService = {
    addEmailJob: jest.fn(),
    addNotificationJob: jest.fn(),
  };

  const mockPasswordService = {
    validatePasswordPolicy: jest.fn(),
    hashPassword: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OrganizationAuditService, useValue: mockOrgAuditService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: PasswordService, useValue: mockPasswordService },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
    prisma = mockPrismaService;
    orgAuditService = mockOrgAuditService;
    queueService = mockQueueService;
    passwordService = mockPasswordService;

    mockPrismaService.$transaction.mockImplementation(async (cb: (...args: unknown[]) => unknown) =>
      cb(mockPrismaService),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (cb: (...args: unknown[]) => unknown) =>
      cb(mockPrismaService),
    );
  });

  describe('create', () => {
    const createDto = {
      email: 'user@test.com',
      roleId: 'role-1',
      jobTitle: 'Engineer',
    };

    it('should create invitation with hashed token', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', name: 'Member', code: 'MEMBER' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.companyInvitation.findFirst.mockResolvedValue(null);
      prisma.companyInvitation.create.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        roleId: 'role-1',
        departmentId: null,
        jobTitle: 'Engineer',
        invitedByUserId: 'user-1',
        tokenHash: 'mocked-hash',
        expiresAt: new Date(Date.now() + 86400000 * 30),
        status: InvitationStatus.PENDING,
        sendCount: 1,
        lastSentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
        department: null,
        invitedBy: { id: 'user-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
      });

      const result = await service.create('company-1', createDto, 'user-1', 'req-1', '127.0.0.1');

      expect(result).not.toHaveProperty('tokenHash');
      expect(result.rawToken).toBeDefined();
      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        'organization.invitation',
        expect.objectContaining({
          email: 'user@test.com',
          type: 'company-invitation',
        }),
      );
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.MEMBER_INVITED,
          requestId: 'req-1',
          ipAddress: '127.0.0.1',
        }),
      );
    });

    it('should reject unknown role', async () => {
      prisma.role.findFirst.mockResolvedValue(null);

      await expect(service.create('company-1', createDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate active membership', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', name: 'Member', code: 'MEMBER' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        normalizedEmail: 'user@test.com',
        memberships: [{ id: 'mem-1', status: MembershipStatus.ACTIVE }],
      });

      await expect(service.create('company-1', createDto, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('validateToken', () => {
    it('should return invitation info for valid token', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        tokenHash: 'any-hash',
        roleId: 'role-1',
        departmentId: 'dept-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
        department: { id: 'dept-1', name: 'Engineering' },
      });

      const result = await service.validateToken('any-raw-token');

      expect(result.valid).toBe(true);
      expect(result.companyName).toBe('Acme Corp');
      expect(result.roleName).toBe('Member');
      expect(result.departmentName).toBe('Engineering');
      expect(result.maskedEmail).toBeDefined();
      expect(result.hasExistingAccount).toBe(false);
    });

    it('should reject expired invitation', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue(null);

      await expect(service.validateToken('expired-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptAsNewUser', () => {
    const acceptData = {
      firstName: 'John',
      lastName: 'Doe',
      password: 'StrongP@ss1',
      passwordConfirmation: 'StrongP@ss1',
      timezone: 'UTC',
      preferredLocale: 'en',
    };

    it('should accept invitation and create new user', async () => {
      passwordService.validatePasswordPolicy.mockReturnValue({ valid: true, errors: [] });
      passwordService.hashPassword.mockResolvedValue('hashed-password');
      prisma.companyInvitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        tokenHash: 'hash',
        roleId: 'role-1',
        departmentId: null,
        jobTitle: 'Engineer',
        invitedByUserId: 'inviter-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
      });
      prisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
      });
      prisma.companyMembership.create.mockResolvedValue({
        id: 'new-membership-1',
        userId: 'new-user-1',
        companyId: 'company-1',
      });
      prisma.companyInvitation.update.mockResolvedValue({});

      const result = await service.acceptAsNewUser('any-raw-token', acceptData);

      expect(result.userId).toBe('new-user-1');
      expect(result.membershipId).toBe('new-membership-1');
      expect(queueService.addNotificationJob).toHaveBeenCalledWith(
        'organization.member-added',
        expect.objectContaining({
          type: 'member-added',
        }),
      );
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.INVITATION_ACCEPTED,
        }),
      );
    });

    it('should reject password mismatch', async () => {
      await expect(
        service.acceptAsNewUser('token', { ...acceptData, passwordConfirmation: 'different' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptExistingUser', () => {
    it('should accept invitation for existing user', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        tokenHash: 'hash',
        roleId: 'role-1',
        departmentId: null,
        jobTitle: 'Engineer',
        invitedByUserId: 'inviter-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user-1',
        normalizedEmail: 'user@test.com',
      });
      prisma.companyMembership.findUnique.mockResolvedValue(null);
      prisma.companyMembership.create.mockResolvedValue({
        id: 'mem-1',
        userId: 'existing-user-1',
        companyId: 'company-1',
      });
      prisma.companyInvitation.update.mockResolvedValue({});

      const result = await service.acceptExistingUser('any-raw-token', 'existing-user-1');

      expect(result.userId).toBe('existing-user-1');
      expect(result.membershipId).toBe('mem-1');
    });

    it('should reject email mismatch on accept', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        roleId: 'role-1',
        departmentId: null,
        jobTitle: 'Engineer',
        invitedByUserId: 'inviter-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'other-user',
        normalizedEmail: 'other@test.com',
      });

      await expect(service.acceptExistingUser('any-raw-token', 'other-user')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject expired invitation', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue(null);

      await expect(service.acceptExistingUser('expired-token', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resend', () => {
    it('should rotate token and resend email', async () => {
      prisma.companyInvitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        companyId: 'company-1',
        email: 'user@test.com',
        normalizedEmail: 'user@test.com',
        tokenHash: 'old-hash',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        sendCount: 1,
        lastSentAt: new Date(Date.now() - 86400000),
        company: { id: 'company-1', name: 'Acme Corp' },
        role: { id: 'role-1', name: 'Member', code: 'MEMBER' },
      });
      prisma.companyInvitation.update.mockResolvedValue({
        id: 'inv-1',
        sendCount: 2,
      });

      await service.resend('company-1', 'inv-1', 'user-1', 'req-1', '127.0.0.1');

      expect(prisma.companyInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            sendCount: 2,
          }),
        }),
      );
      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        'organization.invitation',
        expect.objectContaining({
          email: 'user@test.com',
          type: 'company-invitation',
        }),
      );
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.INVITATION_RESENT,
          requestId: 'req-1',
          ipAddress: '127.0.0.1',
        }),
      );
    });
  });
});
