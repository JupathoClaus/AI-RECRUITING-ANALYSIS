import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { DepartmentsService } from '../departments.service';
import { DepartmentStatus, OrganizationAuditEventType } from '@prisma/client';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let prisma: any;
  let orgAuditService: any;

  const mockPrismaService = {
    department: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    companyMembership: {
      findFirst: jest.fn(),
    },
    organizationAuditEvent: {
      create: jest.fn(),
    },
  };

  const mockOrgAuditService = {
    record: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationAuditService, useValue: mockOrgAuditService },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
    prisma = mockPrismaService;
    orgAuditService = mockOrgAuditService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a root department', async () => {
      prisma.department.findFirst.mockResolvedValue(null);
      prisma.department.create.mockResolvedValue({
        id: 'dept-1',
        companyId: 'company-1',
        name: 'Engineering',
        code: 'ENG',
        description: null,
        parentDepartmentId: null,
        managerMembershipId: null,
        sortOrder: 0,
        status: DepartmentStatus.ACTIVE,
        createdByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        'company-1',
        { name: 'Engineering', code: 'ENG' },
        'user-1',
      );

      expect(result.name).toBe('Engineering');
      expect(prisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            name: 'Engineering',
            parentDepartmentId: null,
          }),
        }),
      );
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.DEPARTMENT_CREATED,
        }),
      );
    });

    it('should create a child department with parent', async () => {
      prisma.department.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'parent-1', companyId: 'company-1', name: 'Parent' });
      prisma.department.create.mockResolvedValue({
        id: 'dept-2',
        companyId: 'company-1',
        name: 'Frontend',
        code: null,
        description: null,
        parentDepartmentId: 'parent-1',
        managerMembershipId: null,
        sortOrder: 1,
        status: DepartmentStatus.ACTIVE,
        createdByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        'company-1',
        { name: 'Frontend', parentDepartmentId: 'parent-1', sortOrder: 1 },
        'user-1',
      );

      expect(result.parentDepartmentId).toBe('parent-1');
      expect(result.sortOrder).toBe(1);
    });

    it('should reject duplicate name within company', async () => {
      prisma.department.findFirst.mockResolvedValue({
        id: 'existing',
        companyId: 'company-1',
        name: 'Engineering',
      });

      await expect(service.create('company-1', { name: 'Engineering' }, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject cross-company parent', async () => {
      prisma.department.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(
        service.create(
          'company-1',
          { name: 'New Dept', parentDepartmentId: 'parent-other-company' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTree', () => {
    it('should build hierarchy from flat department list', async () => {
      prisma.department.findMany.mockResolvedValue([
        {
          id: 'root-1',
          name: 'Engineering',
          code: 'ENG',
          description: null,
          parentDepartmentId: null,
          managerMembershipId: null,
          status: DepartmentStatus.ACTIVE,
          sortOrder: 0,
          _count: { departmentMemberships: 5 },
          managerMembership: null,
        },
        {
          id: 'child-1',
          name: 'Frontend',
          code: null,
          description: null,
          parentDepartmentId: 'root-1',
          managerMembershipId: null,
          status: DepartmentStatus.ACTIVE,
          sortOrder: 1,
          _count: { departmentMemberships: 3 },
          managerMembership: null,
        },
      ]);

      const tree = await service.getTree('company-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Engineering');
      expect(tree[0].children as any[]).toHaveLength(1);
      expect((tree[0].children as any[])[0].name).toBe('Frontend');
    });
  });

  describe('softDelete', () => {
    it('should reject deletion when children exist', async () => {
      prisma.department.findFirst.mockResolvedValue({
        id: 'dept-1',
        companyId: 'company-1',
        name: 'Engineering',
        createdByUserId: 'user-1',
      });
      prisma.department.count.mockResolvedValue(2);

      await expect(service.softDelete('company-1', 'dept-1')).rejects.toThrow(BadRequestException);
      expect(prisma.department.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('should change status to archived', async () => {
      const activeDept = {
        id: 'dept-1',
        companyId: 'company-1',
        name: 'Engineering',
        status: DepartmentStatus.ACTIVE,
        createdByUserId: 'user-1',
      };
      prisma.department.findFirst.mockResolvedValue(activeDept);
      prisma.department.update.mockResolvedValue({
        ...activeDept,
        status: DepartmentStatus.ARCHIVED,
      });

      const result = await service.archive('company-1', 'dept-1', 'user-1');

      expect(result.status).toBe(DepartmentStatus.ARCHIVED);
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.DEPARTMENT_ARCHIVED,
        }),
      );
    });
  });

  describe('restore', () => {
    it('should change status back to active', async () => {
      const archivedDept = {
        id: 'dept-1',
        companyId: 'company-1',
        name: 'Engineering',
        status: DepartmentStatus.ARCHIVED,
      };
      prisma.department.findFirst.mockResolvedValue(archivedDept);
      prisma.department.update.mockResolvedValue({
        ...archivedDept,
        status: DepartmentStatus.ACTIVE,
      });

      const result = await service.restore('company-1', 'dept-1', 'user-1');

      expect(result.status).toBe(DepartmentStatus.ACTIVE);
      expect(orgAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: OrganizationAuditEventType.DEPARTMENT_RESTORED,
        }),
      );
    });
  });
});
