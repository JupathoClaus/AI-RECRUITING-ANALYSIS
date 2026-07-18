import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { AuthorizationCacheService } from '@modules/organization/authorization-cache.service';
import { SessionService } from '@modules/auth/services/session.service';
import { CompaniesService } from '../companies.service';
import { OrganizationAuditEventType, MembershipStatus } from '@prisma/client';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: any;
  let orgAuditService: any;
  let authCacheService: any;
  let sessionService: any;

  const mockPrismaService = {
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    companyLocation: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    companyMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    companySettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    department: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    organizationAuditEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userSession: {
      findMany: jest.fn(),
    },
    departmentMembership: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
    },
  };

  const mockOrgAuditService = {
    record: jest.fn(),
  };

  const mockAuthCacheService = {
    clearMemberCache: jest.fn(),
    clearCompanyMemberCache: jest.fn(),
  };

  const mockSessionService = {
    revoke: jest.fn(),
  };

  const companyFixture = {
    id: 'company-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'ACTIVE',
    emailDomain: null,
    logoUrl: null,
    country: null,
    timezone: 'UTC',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    legalName: null,
    registrationNumber: null,
    taxNumber: null,
    industry: null,
    companySize: null,
    website: null,
    phone: null,
    supportEmail: null,
    description: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateOrProvince: null,
    postalCode: null,
    countryCode: null,
    defaultLanguage: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currencyCode: null,
    recruitmentEmail: null,
    logoFileId: null,
    coverImageFileId: null,
    onboardingCompletedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationAuditService, useValue: mockOrgAuditService },
        { provide: AuthorizationCacheService, useValue: mockAuthCacheService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    prisma = mockPrismaService;
    orgAuditService = mockOrgAuditService;
    authCacheService = mockAuthCacheService;
    sessionService = mockSessionService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCompanyProfile', () => {
    it('should return company with counts', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyLocation.findFirst.mockResolvedValue({
        id: 'loc-1',
        name: 'Head Office',
        isPrimary: true,
      });
      prisma.companyMembership.count.mockResolvedValue(15);
      prisma.department.count.mockResolvedValue(5);

      const result = await service.getCompanyProfile('company-1');

      expect(result.name).toBe('Acme Corp');
      expect(result.primaryLocation).toEqual({ id: 'loc-1', name: 'Head Office', isPrimary: true });
      expect(result.memberCount).toBe(15);
      expect(result.departmentCount).toBe(5);
      expect(result.onboardingCompleted).toBe(false);
    });

    it('should throw NotFoundException for missing company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getCompanyProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCompany', () => {
    it('should update allowed fields and record audit', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.company.update.mockResolvedValue({
        ...companyFixture,
        name: 'Acme Updated',
        industry: 'Tech',
      });

      const result = await service.updateCompany(
        'company-1',
        { name: 'Acme Updated', industry: 'Tech' },
        'user-1',
        'req-1',
        '127.0.0.1',
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { name: 'Acme Updated', industry: 'Tech', updatedByUserId: 'user-1' },
      });
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          actorUserId: 'user-1',
          eventType: OrganizationAuditEventType.COMPANY_PROFILE_UPDATED,
          requestId: 'req-1',
          ipAddress: '127.0.0.1',
        }),
      );
      expect(result.name).toBe('Acme Updated');
    });

    it('should reject update with no valid fields', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);

      await expect(
        service.updateCompany('company-1', { invalidField: 'test' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should only update allowed fields and skip disallowed ones', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.company.update.mockResolvedValue(companyFixture);

      const result = await service.updateCompany(
        'company-1',
        { name: 'Valid', slug: 'hacker', invalidField: 'nope' },
        'user-1',
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { name: 'Valid', updatedByUserId: 'user-1' },
      });
    });
  });

  describe('completeOnboarding', () => {
    it('should succeed when requirements met', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...companyFixture,
        onboardingCompletedAt: null,
      });
      prisma.companyMembership.count.mockResolvedValue(3);
      prisma.companyLocation.count.mockResolvedValue(1);
      prisma.company.update.mockResolvedValue({
        ...companyFixture,
        onboardingCompletedAt: new Date(),
      });

      const result = await service.completeOnboarding('company-1');

      expect(result.onboardingCompletedAt).toBeDefined();
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.ONBOARDING_COMPLETED,
        }),
      );
    });

    it('should fail when no active members', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...companyFixture,
        onboardingCompletedAt: null,
      });
      prisma.companyMembership.count.mockResolvedValue(0);

      await expect(service.completeOnboarding('company-1')).rejects.toThrow(BadRequestException);
    });

    it('should fail when already completed', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...companyFixture,
        onboardingCompletedAt: new Date(),
      });

      await expect(service.completeOnboarding('company-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const settings = {
        id: 'settings-1',
        companyId: 'company-1',
        requireEmailVerification: true,
        allowCustomRoles: false,
        allowCandidateDataExport: true,
        defaultApplicationRetentionDays: 90,
        defaultInterviewDurationMinutes: 60,
        defaultInterviewTimezone: 'UTC',
        defaultInterviewLanguage: 'en',
        aiScreeningEnabled: false,
        aiInterviewEnabled: false,
        recruiterOverrideRequired: true,
        notifyRecruiterOnNewApplication: true,
        notifyCandidateOnStatusChange: true,
        emailSenderName: null,
        emailReplyTo: null,
        brandPrimaryColor: null,
        brandSecondaryColor: null,
        dataRetentionEnabled: false,
        candidateDataRetentionDays: null,
        interviewRecordingRetentionDays: null,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companySettings.findUnique.mockResolvedValue(settings);

      const result = await service.getSettings('company-1');

      expect(result.companyId).toBe('company-1');
      expect(prisma.companySettings.create).not.toHaveBeenCalled();
    });

    it('should lazy-create settings when not found', async () => {
      const newSettings = {
        id: 'settings-new',
        companyId: 'company-1',
        requireEmailVerification: false,
        allowCustomRoles: false,
        allowCandidateDataExport: false,
        defaultApplicationRetentionDays: 90,
        defaultInterviewDurationMinutes: 60,
        defaultInterviewTimezone: 'UTC',
        defaultInterviewLanguage: 'en',
        aiScreeningEnabled: false,
        aiInterviewEnabled: false,
        recruiterOverrideRequired: false,
        notifyRecruiterOnNewApplication: true,
        notifyCandidateOnStatusChange: true,
        emailSenderName: null,
        emailReplyTo: null,
        brandPrimaryColor: null,
        brandSecondaryColor: null,
        dataRetentionEnabled: false,
        candidateDataRetentionDays: null,
        interviewRecordingRetentionDays: null,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companySettings.findUnique.mockResolvedValue(null);
      prisma.companySettings.create.mockResolvedValue(newSettings);

      const result = await service.getSettings('company-1');

      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: { companyId: 'company-1' },
      });
      expect(result.id).toBe('settings-new');
    });
  });

  describe('getMember', () => {
    const membershipFixture = {
      id: 'membership-1',
      userId: 'user-1',
      companyId: 'company-1',
      roleId: 'role-1',
      status: MembershipStatus.ACTIVE,
      jobTitle: 'Engineer',
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: new Date(),
      lastActiveAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        avatarUrl: null,
        status: 'ACTIVE',
      },
      role: { id: 'role-1', code: 'MEMBER', name: 'Member', description: null, isSystem: false },
      departmentMemberships: [
        {
          id: 'dm-1',
          departmentId: 'dept-1',
          isPrimary: true,
          department: { id: 'dept-1', name: 'Engineering', code: 'ENG' },
        },
      ],
    };

    it('should return membership with user, role, and departments', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(membershipFixture);

      const result = await service.getMember('company-1', 'membership-1');

      expect(result.id).toBe('membership-1');
      expect(result.user?.email).toBe('user@test.com');
      expect(result.role?.code).toBe('MEMBER');
      expect(result.departments).toHaveLength(1);
      expect(result.departments[0].department.name).toBe('Engineering');
    });

    it('should throw NotFoundException for cross-company membership', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(null);

      await expect(service.getMember('company-1', 'foreign-membership')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('suspendMember', () => {
    const activeMembership = {
      id: 'membership-1',
      userId: 'user-1',
      companyId: 'company-1',
      roleId: 'role-1',
      status: MembershipStatus.ACTIVE,
      jobTitle: 'Engineer',
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: new Date(),
      lastActiveAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        avatarUrl: null,
        status: 'ACTIVE',
      },
      role: { id: 'role-1', code: 'MEMBER', name: 'Member', description: null, isSystem: false },
      departmentMemberships: [],
    };
    const suspendedMembership = {
      ...activeMembership,
      status: MembershipStatus.SUSPENDED,
    };

    it('should suspend member, record audit, and clear cache', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(activeMembership);
      prisma.companyMembership.update.mockResolvedValue(suspendedMembership);

      await service.suspendMember('company-1', 'membership-1', 'actor-1', 'req-1', '127.0.0.1');

      expect(prisma.companyMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: MembershipStatus.SUSPENDED } }),
      );
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          eventType: OrganizationAuditEventType.MEMBER_SUSPENDED,
        }),
      );
      expect(authCacheService.clearMemberCache).toHaveBeenCalledWith('membership-1');
    });

    it('should protect final admin from suspension', async () => {
      const adminMembership = {
        ...activeMembership,
        role: { id: 'admin-role', code: 'ADMIN', name: 'Admin', description: null, isSystem: true },
      };
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(adminMembership);
      prisma.companyMembership.count.mockResolvedValue(1);

      await expect(service.suspendMember('company-1', 'membership-1', 'actor-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('removeMember', () => {
    it('should revoke sessions and clear both caches', async () => {
      const membership = {
        id: 'membership-1',
        userId: 'user-1',
        companyId: 'company-1',
        roleId: 'role-1',
        status: MembershipStatus.ACTIVE,
        role: { id: 'role-1', code: 'MEMBER', name: 'Member', description: null, isSystem: false },
      };
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(membership);
      prisma.companyMembership.update.mockResolvedValue({
        ...membership,
        status: MembershipStatus.REMOVED,
      });
      prisma.userSession.findMany.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);

      await service.removeMember('company-1', 'membership-1', 'actor-1');

      expect(sessionService.revoke).toHaveBeenCalledTimes(2);
      expect(sessionService.revoke).toHaveBeenCalledWith('sess-1', 'User removed from company');
      expect(sessionService.revoke).toHaveBeenCalledWith('sess-2', 'User removed from company');
      expect(authCacheService.clearMemberCache).toHaveBeenCalledWith('membership-1');
      expect(authCacheService.clearCompanyMemberCache).toHaveBeenCalledWith('company-1');
    });

    it('should protect final admin from removal', async () => {
      const adminMembership = {
        id: 'membership-1',
        userId: 'user-1',
        companyId: 'company-1',
        roleId: 'admin-role',
        status: MembershipStatus.ACTIVE,
        role: { id: 'admin-role', code: 'ADMIN', name: 'Admin', description: null, isSystem: true },
      };
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findFirst.mockResolvedValue(adminMembership);
      prisma.companyMembership.count.mockResolvedValue(1);

      await expect(service.removeMember('company-1', 'membership-1', 'actor-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('bulkMemberAction', () => {
    it('should validate all targets belong to company', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.companyMembership.findMany.mockResolvedValue([
        { id: 'membership-1', role: { isSystem: false } },
      ]);

      await expect(
        service.bulkMemberAction(
          'company-1',
          'SUSPEND',
          ['membership-1', 'membership-2'],
          'actor-1',
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAuditEvents', () => {
    it('should return paginated audit events', async () => {
      const auditItems = [
        {
          id: 'audit-1',
          eventType: 'COMPANY_PROFILE_UPDATED',
          description: 'Profile updated',
          occurredAt: new Date(),
        },
        {
          id: 'audit-2',
          eventType: 'MEMBER_INVITED',
          description: 'Member invited',
          occurredAt: new Date(),
        },
      ];

      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.organizationAuditEvent.findMany.mockResolvedValue(auditItems);
      prisma.organizationAuditEvent.count.mockResolvedValue(10);

      const result = await service.getAuditEvents('company-1', { page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.meta.total).toBe(10);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply filters correctly', async () => {
      prisma.company.findUnique.mockResolvedValue(companyFixture);
      prisma.organizationAuditEvent.findMany.mockResolvedValue([]);
      prisma.organizationAuditEvent.count.mockResolvedValue(0);

      await service.getAuditEvents('company-1', {
        page: 1,
        limit: 20,
        eventType: 'MEMBER_SUSPENDED',
        entityType: 'membership',
        actorUserId: 'user-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        search: 'suspended',
      });

      expect(prisma.organizationAuditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'MEMBER_SUSPENDED',
            entityType: 'membership',
            actorUserId: 'user-1',
          }),
        }),
      );
    });
  });
});
