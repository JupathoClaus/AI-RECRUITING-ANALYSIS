import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobTemplatesService } from '../job-templates.service';
import { JobStatus } from '@prisma/client';

describe('JobTemplatesService', () => {
  let service: JobTemplatesService;
  let prisma: any;

  const mockPrismaService = {
    $transaction: jest.fn(),
    jobTemplate: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    job: {
      create: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobTemplatesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<JobTemplatesService>(JobTemplatesService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a template with validated name uniqueness', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);
      prisma.jobTemplate.create.mockResolvedValue({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Engineer Template',
        description: 'Standard template',
        category: 'Engineering',
        departmentId: null,
        employmentType: 'FULL_TIME',
        workplaceType: null,
        experienceLevel: null,
        titleTemplate: null,
        descriptionTemplate: 'We need...',
        responsibilitiesTemplate: null,
        qualificationsTemplate: null,
        benefitsTemplate: null,
        createdByMembershipId: 'mem-1',
        isActive: true,
        isSystem: false,
        usageCount: 0,
      });

      const result = await service.create(
        'company-1',
        {
          name: 'Engineer Template',
          descriptionTemplate: 'We need...',
        },
        'mem-1',
      );

      expect(result.name).toBe('Engineer Template');
      expect(prisma.jobTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            name: 'Engineer Template',
          }),
        }),
      );
    });

    it('should reject duplicate name within company', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'existing',
        companyId: 'company-1',
        name: 'Engineer Template',
        deletedAt: null,
      });

      await expect(
        service.create(
          'company-1',
          { name: 'Engineer Template', descriptionTemplate: 'Test' },
          'mem-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should validate department belongs to company', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'company-1',
          {
            name: 'Template',
            descriptionTemplate: 'Test',
            departmentId: 'dept-other',
          },
          'mem-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow same name across different companies', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);
      prisma.jobTemplate.create.mockResolvedValue({
        id: 'template-2',
        companyId: 'company-2',
        name: 'Engineer Template',
        descriptionTemplate: 'We need...',
      });

      const result = await service.create(
        'company-2',
        {
          name: 'Engineer Template',
          descriptionTemplate: 'We need...',
        },
        'mem-1',
      );

      expect(result.name).toBe('Engineer Template');
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated, searchable templates', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([
        { id: 'template-1', name: 'Engineer', department: null, _count: { jobs: 3 } },
      ]);
      prisma.jobTemplate.count.mockResolvedValue(1);

      const result = await service.findAll('company-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1', deletedAt: null }),
        }),
      );
    });

    it('should filter by search query', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([]);
      prisma.jobTemplate.count.mockResolvedValue(0);

      await service.findAll('company-1', { search: 'Engineer' });

      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Engineer', mode: 'insensitive' } },
              { description: { contains: 'Engineer', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should filter by category', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([]);
      prisma.jobTemplate.count.mockResolvedValue(0);

      await service.findAll('company-1', { category: 'Engineering' });

      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'Engineering' }),
        }),
      );
    });

    it('should filter by isActive status', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([]);
      prisma.jobTemplate.count.mockResolvedValue(0);

      await service.findAll('company-1', { isActive: true });

      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('should return template if found', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Engineer',
        department: { id: 'dept-1', name: 'Engineering' },
        _count: { jobs: 5 },
      });

      const result = await service.findById('company-1', 'template-1');

      expect(result.name).toBe('Engineer');
      expect(result._count.jobs).toBe(5);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findById('company-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for cross-company template', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findById('company-1', 'template-other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update a non-system template', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValueOnce({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Old Name',
        isSystem: false,
      });
      prisma.jobTemplate.findFirst.mockResolvedValueOnce(null);
      prisma.jobTemplate.update.mockResolvedValue({
        id: 'template-1',
        name: 'New Name',
      });

      const result = await service.update('company-1', 'template-1', { name: 'New Name' }, 'mem-1');

      expect(result.name).toBe('New Name');
    });

    it('should reject update of system template', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'sys-template',
        companyId: 'company-1',
        name: 'System',
        isSystem: true,
      });

      await expect(
        service.update('company-1', 'sys-template', { name: 'Hacked' }, 'mem-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate name on update', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValueOnce({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Old Name',
        isSystem: false,
      });
      prisma.jobTemplate.findFirst.mockResolvedValueOnce({
        id: 'template-2',
        companyId: 'company-1',
        name: 'Existing Name',
        deletedAt: null,
      });

      await expect(
        service.update('company-1', 'template-1', { name: 'Existing Name' }, 'mem-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── softDelete ────────────────────────────────────────────────────────────────
  describe('softDelete', () => {
    it('should soft delete a non-system template', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Template',
        isSystem: false,
      });
      prisma.jobTemplate.update.mockResolvedValue({
        id: 'template-1',
        deletedAt: new Date(),
      });

      const result = await service.softDelete('company-1', 'template-1');

      expect(result.deletedAt).toBeDefined();
      expect(prisma.jobTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'template-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject deletion of system template', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'sys-template',
        companyId: 'company-1',
        name: 'System',
        isSystem: true,
      });

      await expect(service.softDelete('company-1', 'sys-template')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── createJob ─────────────────────────────────────────────────────────────────
  describe('createJob', () => {
    it('should create a job from template and increment usageCount', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Engineer',
        descriptionTemplate: 'We need...',
        responsibilitiesTemplate: 'Lead...',
        qualificationsTemplate: '5+ years',
        benefitsTemplate: 'Health',
        departmentId: null,
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        experienceLevel: 'SENIOR',
        isSystem: false,
        usageCount: 3,
      });
      prisma.job.count.mockResolvedValue(10);
      prisma.job.create.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        jobCode: 'JOB-ABC-0011',
        slug: 'senior-dev-abc',
        title: 'Senior Dev',
        status: JobStatus.DRAFT,
      });
      prisma.jobTemplate.update.mockResolvedValue({});

      const result = await service.createJob(
        'company-1',
        'template-1',
        {
          title: 'Senior Dev',
        },
        'mem-1',
        'user-1',
      );

      expect(result.title).toBe('Senior Dev');
      expect(result.status).toBe(JobStatus.DRAFT);
      expect(prisma.jobTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'template-1' },
          data: { usageCount: { increment: 1 } },
        }),
      );
    });

    it('should throw when template not found', async () => {
      prisma.jobTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.createJob('company-1', 'bad-template-id', { title: 'Title' }, 'mem-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllSystem ─────────────────────────────────────────────────────────────
  describe('findAllSystem', () => {
    it('should return system templates accessible to company', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([
        {
          id: 'sys-template',
          name: 'Standard Engineer',
          isSystem: true,
          companyId: null,
          department: null,
        },
        {
          id: 'company-template',
          name: 'Custom',
          isSystem: false,
          companyId: 'company-1',
          department: null,
        },
      ]);

      const result = await service.findAllSystem('company-1');

      expect(result).toHaveLength(2);
      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ companyId: 'company-1' }, { companyId: null, isSystem: true }],
          }),
        }),
      );
    });

    it('should filter only active and non-deleted templates', async () => {
      prisma.jobTemplate.findMany.mockResolvedValue([]);

      await service.findAllSystem('company-1');

      expect(prisma.jobTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            isActive: true,
          }),
        }),
      );
    });
  });
});
