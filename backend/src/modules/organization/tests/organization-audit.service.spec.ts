import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '../organization-audit.service';
import { OrganizationAuditEventType } from '@prisma/client';

describe('OrganizationAuditService', () => {
  let service: OrganizationAuditService;
  let prisma: any;

  const mockPrismaService = {
    organizationAuditEvent: {
      create: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationAuditService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OrganizationAuditService>(OrganizationAuditService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should record an audit event correctly with all fields', async () => {
    const data = {
      companyId: 'company-1',
      actorUserId: 'user-1',
      actorMembershipId: 'membership-1',
      eventType: OrganizationAuditEventType.COMPANY_PROFILE_UPDATED,
      entityType: 'company',
      entityId: 'company-1',
      description: 'Company profile updated',
      metadata: { changes: ['name'] },
      requestId: 'req-1',
      ipAddress: '127.0.0.1',
    };

    prisma.organizationAuditEvent.create.mockResolvedValue({ id: 'audit-1' });

    await service.record(data);

    expect(prisma.organizationAuditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        actorUserId: 'user-1',
        actorMembershipId: 'membership-1',
        eventType: OrganizationAuditEventType.COMPANY_PROFILE_UPDATED,
        entityType: 'company',
        entityId: 'company-1',
        description: 'Company profile updated',
        metadata: { changes: ['name'] },
        requestId: 'req-1',
        ipAddress: '127.0.0.1',
      },
    });
  });

  it('should handle null optional fields mapping to null (undefined for metadata)', async () => {
    prisma.organizationAuditEvent.create.mockResolvedValue({ id: 'audit-2' });

    await service.record({
      companyId: 'company-1',
      eventType: OrganizationAuditEventType.DEPARTMENT_CREATED,
      entityType: 'Department',
      description: 'Test event',
    });

    expect(prisma.organizationAuditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        actorUserId: null,
        actorMembershipId: null,
        eventType: OrganizationAuditEventType.DEPARTMENT_CREATED,
        entityType: 'Department',
        entityId: null,
        description: 'Test event',
        metadata: undefined,
        requestId: null,
        ipAddress: null,
      },
    });
  });

  it('should handle metadata sanitization by passing objects through', async () => {
    prisma.organizationAuditEvent.create.mockResolvedValue({ id: 'audit-3' });

    const metadata = { sensitive: 'data', nested: { key: 'value' } };
    await service.record({
      companyId: 'company-1',
      actorUserId: null,
      eventType: OrganizationAuditEventType.MEMBER_INVITED,
      entityType: 'CompanyInvitation',
      description: 'Invitation sent',
      metadata,
    });

    const callArg = prisma.organizationAuditEvent.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual(metadata);
  });
});
