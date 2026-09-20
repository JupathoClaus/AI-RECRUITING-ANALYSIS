import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { JobsService } from '../jobs.service';
import { JobCodeService } from '../job-code.service';
import { JobActivityService } from '../job-activity.service';
import { JobWorkflowService } from '../job-workflow.service';
import {
  JobStatus,
  JobVisibility,
  JobApprovalStatus,
  JobPublicationStatus,
  JobCollaboratorType,
  PipelineStageType,
  JobActivityEventType,
  OrganizationAuditEventType,
} from '@prisma/client';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: any;
  let orgAuditService: any;
  let jobCodeService: any;
  let jobActivityService: any;
  let jobWorkflowService: any;

  const mockPrismaService = {
    $transaction: jest.fn(),
    job: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    companyLocation: {
      findFirst: jest.fn(),
    },
    companyMembership: {
      findFirst: jest.fn(),
    },
    jobScreeningConfiguration: {
      create: jest.fn(),
      update: jest.fn(),
    },
    jobAccessibilityConfiguration: {
      create: jest.fn(),
      update: jest.fn(),
    },
    jobPipeline: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    jobPipelineStage: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    jobCollaborator: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    jobSkill: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    jobEducationRequirement: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    jobExperienceRequirement: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    jobLanguageRequirement: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    jobScreeningQuestion: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
    },
    jobTemplate: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    jobActivityEvent: {
      create: jest.fn(),
    },
    skill: {
      findFirst: jest.fn(),
    },
    application: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    aiScreeningResult: {
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    interview: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    aiInterview: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const mockOrgAuditService = {
    record: jest.fn(),
  };

  const mockJobCodeService = {
    generateCode: jest.fn(),
    generateSlug: jest.fn(),
    regenerateSlug: jest.fn(),
  };

  const mockJobActivityService = {
    record: jest.fn(),
    getByJob: jest.fn(),
  };

  const mockJobWorkflowService = {
    transition: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationAuditService, useValue: mockOrgAuditService },
        { provide: JobCodeService, useValue: mockJobCodeService },
        { provide: JobActivityService, useValue: mockJobActivityService },
        { provide: JobWorkflowService, useValue: mockJobWorkflowService },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    prisma = mockPrismaService;
    orgAuditService = mockOrgAuditService;
    jobCodeService = mockJobCodeService;
    jobActivityService = mockJobActivityService;
    jobWorkflowService = mockJobWorkflowService;

    mockPrismaService.$transaction.mockImplementation(async (cb: ((tx: any) => any) | any[]) => {
      if (typeof cb === 'function') return cb(mockPrismaService);
      return Promise.all(cb);
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (cb: ((tx: any) => any) | any[]) => {
      if (typeof cb === 'function') return cb(mockPrismaService);
      return Promise.all(cb);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      title: 'Senior Engineer',
      employmentType: 'FULL_TIME' as any,
      workplaceType: 'HYBRID' as any,
      experienceLevel: 'SENIOR' as any,
      description: 'We need a senior engineer',
    };

    it('should create a draft job with code and slug', async () => {
      jobCodeService.generateCode.mockResolvedValue('JOB-2026-00001');
      jobCodeService.generateSlug.mockResolvedValue('senior-engineer');

      prisma.companyMembership.findFirst.mockResolvedValue({
        id: 'membership-1',
        companyId: 'company-1',
        status: 'ACTIVE',
      });

      prisma.job.create.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        jobCode: 'JOB-2026-00001',
        slug: 'senior-engineer',
        title: 'Senior Engineer',
        status: JobStatus.DRAFT,
        visibility: JobVisibility.INTERNAL,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        publicationStatus: JobPublicationStatus.NOT_PUBLISHED,
        ownerMembershipId: 'membership-1',
        createdByMembershipId: 'membership-1',
        departmentId: null,
        locationId: null,
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        experienceLevel: 'SENIOR',
        description: 'We need a senior engineer',
        responsibilities: null,
        qualifications: null,
        benefits: null,
        numberOfOpenings: 1,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        salaryVisible: false,
        applicationDeadline: null,
        expectedStartDate: null,
        templateId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        jobCode: 'JOB-2026-00001',
        slug: 'senior-engineer',
        title: 'Senior Engineer',
        status: JobStatus.DRAFT,
      });

      prisma.jobScreeningConfiguration.create.mockResolvedValue({});
      prisma.jobAccessibilityConfiguration.create.mockResolvedValue({});
      prisma.jobPipeline.create.mockResolvedValue({
        id: 'pipeline-1',
        stages: [],
      });
      prisma.jobCollaborator.create.mockResolvedValue({});

      const result = await service.create('company-1', createDto, 'membership-1', 'user-1');

      expect(result.title).toBe('Senior Engineer');
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            jobCode: 'JOB-2026-00001',
            slug: 'senior-engineer',
            status: JobStatus.DRAFT,
          }),
        }),
      );
      expect(prisma.jobScreeningConfiguration.create).toHaveBeenCalled();
      expect(prisma.jobAccessibilityConfiguration.create).toHaveBeenCalled();
      expect(prisma.jobPipeline.create).toHaveBeenCalled();
      expect(prisma.jobCollaborator.create).toHaveBeenCalled();
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_CREATED,
        }),
      );
    });

    it('should validate cross-tenant department', async () => {
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'company-1',
          { ...createDto, departmentId: 'dept-other' },
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate cross-tenant location', async () => {
      prisma.department.findFirst.mockResolvedValue({ id: 'dept-1', companyId: 'company-1' });
      prisma.companyLocation.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'company-1',
          { ...createDto, departmentId: 'dept-1', locationId: 'loc-other' },
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid owner membership', async () => {
      prisma.department.findFirst.mockResolvedValue(null);
      prisma.companyLocation.findFirst.mockResolvedValue(null);
      prisma.companyMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.create('company-1', createDto, 'membership-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject salary range where min > max', async () => {
      await expect(
        service.create(
          'company-1',
          { ...createDto, salaryMin: 100, salaryMax: 50 },
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid numberOfOpenings', async () => {
      await expect(
        service.create(
          'company-1',
          { ...createDto, numberOfOpenings: 0 },
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject past application deadline', async () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      await expect(
        service.create(
          'company-1',
          { ...createDto, applicationDeadline: past },
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated tenant-scoped results', async () => {
      prisma.job.findMany.mockResolvedValue([{ id: 'job-1', title: 'Eng' }]);
      prisma.job.count.mockResolvedValue(1);

      const result = await service.findAll('company-1', { page: 1, limit: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1', deletedAt: null }),
        }),
      );
    });

    it('should filter by status', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', { status: [JobStatus.DRAFT, JobStatus.PUBLISHED] });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [JobStatus.DRAFT, JobStatus.PUBLISHED] },
          }),
        }),
      );
    });

    it('should filter by search on title and jobCode', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', { search: 'engineer' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'engineer', mode: 'insensitive' } },
              { jobCode: { contains: 'engineer', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should exclude archived by default', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', {});

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('should include archived when requested', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', { archived: true });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('should use allowed sort fields only', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', { sortBy: 'title', sortOrder: 'asc' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: 'asc' },
        }),
      );
    });

    it('should fallback to createdAt for invalid sortBy', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.findAll('company-1', { sortBy: 'invalidField' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('should return full job with relations', async () => {
      const mockJob = {
        id: 'job-1',
        companyId: 'company-1',
        title: 'Senior Engineer',
        department: { id: 'dept-1', name: 'Engineering', code: 'ENG' },
        location: null,
        ownerMembership: null,
        createdBy: null,
        updatedBy: null,
        skills: [],
        educationRequirements: [],
        experienceRequirements: [],
        languageRequirements: [],
        screeningQuestions: [],
        screeningConfig: null,
        accessibilityConfig: null,
        pipeline: null,
        collaborators: [],
        approvals: [],
        publications: [],
        activityEvents: [],
      };

      prisma.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.findById('company-1', 'job-1');

      expect(result.id).toBe('job-1');
      expect(result.department!.name).toBe('Engineering');
    });

    it('should request _count matching JobListDto (screeningQuestions etc.)', async () => {
      const mockJob = { id: 'job-1', _count: { collaborators: 0, screeningQuestions: 2, skills: 1 } };
      prisma.job.findFirst.mockResolvedValue(mockJob);

      await service.findById('company-1', 'job-1');

      const include = prisma.job.findFirst.mock.calls[0][0].include;
      expect(include._count).toEqual({
        select: {
          collaborators: { where: { removedAt: null } },
          screeningQuestions: { where: { deletedAt: null } },
          skills: true,
        },
      });
    });

    it('should throw NotFoundException for cross-tenant access', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.findById('company-1', 'job-other')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update with optimistic locking', async () => {
      prisma.job.findFirst
        .mockResolvedValueOnce({
          id: 'job-1',
          companyId: 'company-1',
          status: JobStatus.DRAFT,
          version: 1,
          title: 'Old Title',
          jobCode: 'JOB-2026-00001',
          slug: 'old-title',
          deletedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          companyId: 'company-1',
          title: 'New Title',
          status: JobStatus.DRAFT,
          version: 2,
        });
      prisma.job.update.mockResolvedValue({ id: 'job-1' });

      const result = await service.update(
        'company-1',
        'job-1',
        { title: 'New Title', expectedVersion: 1 } as any,
        'membership-1',
        'user-1',
      );

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ version: 2 }),
        }),
      );
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_UPDATED,
          metadata: expect.objectContaining({
            previousVersion: 1,
            newVersion: 2,
          }),
        }),
      );
    });

    it('should reject stale version with ConflictException', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        version: 2,
        title: 'Title',
        jobCode: 'JOB-2026-00001',
        slug: 'title',
        deletedAt: null,
      });

      await expect(
        service.update(
          'company-1',
          'job-1',
          { title: 'New', expectedVersion: 1 } as any,
          'membership-1',
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when job missing', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.update('company-1', 'job-1', { title: 'New' } as any, 'membership-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── softDelete ────────────────────────────────────────────────────────────────
  describe('softDelete', () => {
    it('should soft delete a draft job', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        title: 'Draft Job',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });
      prisma.job.update.mockResolvedValue({ id: 'job-1', deletedAt: new Date() });

      await service.softDelete('company-1', 'job-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw BadRequestException for published job', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Published Job',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });

      await expect(service.softDelete('company-1', 'job-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for missing job', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('company-1', 'job-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── archive / restore ─────────────────────────────────────────────────────────
  describe('archive', () => {
    it('should call workflow transition to ARCHIVED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'My Job',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });

      await service.archive('company-1', 'job-1', 'membership-1');

      expect(jobWorkflowService.transition).toHaveBeenCalledWith(
        'company-1',
        'job-1',
        JobStatus.ARCHIVED,
        'membership-1',
      );
    });

    it('should throw if already archived', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.ARCHIVED,
        title: 'Archived',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });

      await expect(service.archive('company-1', 'job-1', 'membership-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('restore', () => {
    it('should restore archived job to DRAFT', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.ARCHIVED,
        title: 'Archived Job',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });
      prisma.job.update.mockResolvedValue({ id: 'job-1', status: JobStatus.DRAFT });

      await service.restore('company-1', 'job-1', 'membership-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: JobStatus.DRAFT,
            archivedAt: null,
          }),
        }),
      );
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_RESTORED,
        }),
      );
    });

    it('should throw if not archived', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        title: 'Draft',
        jobCode: 'JOB-2026-00001',
        deletedAt: null,
      });

      await expect(service.restore('company-1', 'job-1', 'membership-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── duplicate ─────────────────────────────────────────────────────────────────
  describe('duplicate', () => {
    it('should create a new DRAFT job with new code/slug', async () => {
      const sourceJob = {
        id: 'source-1',
        companyId: 'company-1',
        title: 'Original',
        jobCode: 'JOB-2026-00001',
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        experienceLevel: 'SENIOR',
        visibility: JobVisibility.INTERNAL,
        description: 'Original desc',
        responsibilities: 'Resp',
        qualifications: 'Quals',
        benefits: 'Benefits',
        numberOfOpenings: 1,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        salaryVisible: false,
        departmentId: 'dept-1',
        locationId: null,
        screeningConfig: null,
        accessibilityConfig: null,
        skills: [],
        educationRequirements: [],
        experienceRequirements: [],
        languageRequirements: [],
        screeningQuestions: [],
        pipeline: null,
        deletedAt: null,
      };

      prisma.job.findFirst.mockResolvedValueOnce(sourceJob);
      jobCodeService.generateCode.mockResolvedValue('JOB-2026-00002');
      jobCodeService.generateSlug.mockResolvedValue('original-copy');
      prisma.job.create.mockResolvedValue({
        id: 'job-2',
        companyId: 'company-1',
        jobCode: 'JOB-2026-00002',
        slug: 'original-copy',
        title: 'Original (Copy)',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        publicationStatus: JobPublicationStatus.NOT_PUBLISHED,
      });
      prisma.jobPipeline.create.mockResolvedValue({ id: 'pipeline-2', stages: [] });
      prisma.jobCollaborator.create.mockResolvedValue({});
      prisma.job.findFirst.mockResolvedValueOnce({ id: 'job-2', title: 'Original (Copy)' });

      const result = await service.duplicate(
        'company-1',
        'source-1',
        { title: 'Original (Copy)' },
        'membership-1',
      );

      expect(result.title).toBe('Original (Copy)');
      expect(jobCodeService.generateCode).toHaveBeenCalled();
      expect(jobCodeService.generateSlug).toHaveBeenCalled();
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_DUPLICATED,
        }),
      );
    });

    it('should throw NotFoundException when source is missing', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.duplicate('company-1', 'bad-id', {}, 'membership-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSummary ────────────────────────────────────────────────────────────────
  describe('getSummary', () => {
    it('should return aggregate counts', async () => {
      prisma.job.count.mockResolvedValue(10);
      prisma.job.groupBy
        .mockResolvedValueOnce([
          { status: JobStatus.DRAFT, _count: { id: 5 } },
          { status: JobStatus.PUBLISHED, _count: { id: 3 } },
          { status: JobStatus.CLOSED, _count: { id: 1 } },
          { status: JobStatus.FILLED, _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ employmentType: 'FULL_TIME', _count: { id: 8 } }])
        .mockResolvedValueOnce([{ workplaceType: 'HYBRID', _count: { id: 8 } }]);
      prisma.job.findMany.mockResolvedValue([]);

      const result = await service.getSummary('company-1');

      expect(result.totalJobs).toBe(10);
      expect(result.summary.draft).toBe(5);
      expect(result.summary.published).toBe(3);
    });
  });

  // ─── getAnalytics ──────────────────────────────────────────────────────────────
  describe('getAnalytics', () => {
    const stubAggregates = () => {
      prisma.application.count.mockResolvedValue(10);
      prisma.application.groupBy
        .mockResolvedValueOnce([
          { status: 'SUBMITTED', _count: { id: 4 } },
          { status: 'HIRED', _count: { id: 2 } },
          { status: 'REJECTED', _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([{ currentStageId: 'stage-1', _count: { id: 5 } }]);
      prisma.jobPipelineStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'Applied', sortOrder: 0 },
        { id: 'stage-2', name: 'Interview', sortOrder: 1 },
      ]);
      prisma.application.findMany.mockResolvedValue([
        { createdAt: new Date('2025-01-01T00:00:00Z'), hiredAt: new Date('2025-01-11T00:00:00Z') },
      ]);
      prisma.aiScreeningResult.count.mockResolvedValue(6);
      prisma.aiScreeningResult.groupBy
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _count: { id: 4 } },
          { status: 'FAILED', _count: { id: 1 } },
          { status: 'PENDING', _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([
          { recommendation: 'SHORTLIST', _count: { id: 2 } },
          { recommendation: 'HUMAN_REVIEW', _count: { id: 2 } },
        ]);
      prisma.aiScreeningResult.aggregate.mockResolvedValue({
        _avg: { overallScore: 78.4 },
        _count: { _all: 4 },
      });
      prisma.interview.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
      prisma.interview.groupBy
        .mockResolvedValueOnce([
          { status: 'SCHEDULED', _count: { id: 2 } },
          { status: 'COMPLETED', _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([
          { result: 'PASS', _count: { id: 1 } },
          { result: 'NOT_RECORDED', _count: { id: 2 } },
        ]);
      prisma.aiInterview.count.mockResolvedValue(2);
      prisma.aiInterview.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _count: { id: 1 } },
        { status: 'SENT', _count: { id: 1 } },
      ]);
    };

    it('should aggregate all job metrics from backend queries', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', numberOfOpenings: 2 });
      stubAggregates();

      const result = await service.getAnalytics('company-1', 'job-1');

      expect(prisma.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', companyId: 'company-1', deletedAt: null },
        select: { id: true, numberOfOpenings: true },
      });
      expect(result.applications.total).toBe(10);
      expect(result.applications.active).toBe(7);
      expect(result.applications.byStage).toEqual([
        { stageId: 'stage-1', name: 'Applied', count: 5 },
        { stageId: 'stage-2', name: 'Interview', count: 0 },
      ]);
      expect(result.screening).toMatchObject({
        total: 6,
        completed: 4,
        failed: 1,
        pending: 1,
        scored: 4,
        averageScore: 78,
      });
      expect(result.screening.byRecommendation).toEqual({
        SHORTLIST: 2,
        NOT_SHORTLIST: 0,
        HUMAN_REVIEW: 2,
      });
      expect(result.interviews.total).toBe(3);
      expect(result.interviews.upcoming).toBe(2);
      expect(result.interviews.byResult).toEqual({ PASS: 1, NOT_RECORDED: 2 });
      expect(result.aiInterviews.total).toBe(2);
      expect(result.aiInterviews.byStatus).toEqual({ COMPLETED: 1, SENT: 1 });
      expect(result.timeToHireDays).toBe(10);
      expect(result.jobId).toBe('job-1');
      expect(result.numberOfOpenings).toBe(2);
    });

    it('should isolate every aggregate by tenant and job', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', numberOfOpenings: 1 });
      stubAggregates();

      await service.getAnalytics('company-1', 'job-1');

      expect(prisma.application.count).toHaveBeenCalledWith({
        where: { companyId: 'company-1', jobId: 'job-1', deletedAt: null },
      });
      expect(prisma.aiInterview.count).toHaveBeenCalledWith({
        where: {
          companyId: 'company-1',
          application: { jobId: 'job-1', deletedAt: null },
        },
      });
    });

    it('should return null average and zero metrics when no data exists', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', numberOfOpenings: 1 });
      prisma.application.count.mockResolvedValue(0);
      prisma.application.groupBy.mockResolvedValue([]);
      prisma.jobPipelineStage.findMany.mockResolvedValue([]);
      prisma.application.findMany.mockResolvedValue([]);
      prisma.aiScreeningResult.count.mockResolvedValue(0);
      prisma.aiScreeningResult.groupBy.mockResolvedValue([]);
      prisma.aiScreeningResult.aggregate.mockResolvedValue({
        _avg: { overallScore: null },
        _count: { _all: 0 },
      });
      prisma.interview.count.mockResolvedValue(0);
      prisma.interview.groupBy.mockResolvedValue([]);
      prisma.aiInterview.count.mockResolvedValue(0);
      prisma.aiInterview.groupBy.mockResolvedValue([]);

      const result = await service.getAnalytics('company-1', 'job-1');

      expect(result.screening.averageScore).toBeNull();
      expect(result.timeToHireDays).toBeNull();
      expect(result.applications.byStage).toEqual([]);
      expect(result.interviews.byResult).toEqual({});
    });

    it('should throw JOB_NOT_FOUND and skip aggregates when the job is out of tenant scope', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.getAnalytics('company-1', 'job-1')).rejects.toThrow(NotFoundException);
      expect(prisma.application.count).not.toHaveBeenCalled();
    });
  });

  // ─── updateRequirements ────────────────────────────────────────────────────────
  describe('updateRequirements', () => {
    it('should transactionally replace requirements', async () => {
      prisma.job.findFirst.mockResolvedValueOnce({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.job.findFirst.mockResolvedValueOnce({ id: 'job-1' });

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementationOnce(async (cb: any) => cb(mockPrismaService));

      prisma.skill.findFirst.mockResolvedValue({ id: 'skill-1', isGlobal: true, companyId: null });
      prisma.jobSkill.deleteMany.mockResolvedValue({ count: 0 });
      prisma.jobEducationRequirement.deleteMany.mockResolvedValue({ count: 0 });
      prisma.jobExperienceRequirement.deleteMany.mockResolvedValue({ count: 0 });
      prisma.jobLanguageRequirement.deleteMany.mockResolvedValue({ count: 0 });
      prisma.job.update.mockResolvedValue({});
      prisma.job.findFirst.mockResolvedValueOnce({ id: 'job-1' });

      const result = await service.updateRequirements(
        'company-1',
        'job-1',
        {
          skills: [{ skillId: 'skill-1', importance: 'REQUIRED' }],
          education: [{ level: 'BACHELORS', importance: 'PREFERRED' }],
          experience: [{ minimumYears: 3, importance: 'REQUIRED' }],
          languages: [{ languageCode: 'en', proficiency: 'PROFESSIONAL', importance: 'PREFERRED' }],
        },
        'membership-1',
      );

      expect(prisma.jobSkill.deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
      expect(prisma.jobEducationRequirement.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
      expect(prisma.jobExperienceRequirement.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
      expect(prisma.jobLanguageRequirement.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
    });

    it('should reject cross-company skill', async () => {
      prisma.job.findFirst.mockResolvedValueOnce({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.job.findFirst.mockResolvedValueOnce({ id: 'job-1' });

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementationOnce(async (cb: any) => cb(mockPrismaService));

      prisma.jobSkill.deleteMany.mockResolvedValue({ count: 0 });
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-1',
        isGlobal: false,
        companyId: 'company-2',
      });

      await expect(
        service.updateRequirements(
          'company-1',
          'job-1',
          {
            skills: [{ skillId: 'skill-1', importance: 'REQUIRED' }],
          },
          'membership-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateScreeningConfig ─────────────────────────────────────────────────────
  describe('updateScreeningConfig', () => {
    it('should update the screening configuration', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobScreeningConfiguration.update.mockResolvedValue({
        jobId: 'job-1',
        enabled: false,
        updatedByMembershipId: 'membership-1',
      });

      const result = await service.updateScreeningConfig(
        'company-1',
        'job-1',
        { enabled: false },
        'membership-1',
      );

      expect(result.enabled).toBe(false);
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.SCREENING_CONFIG_UPDATED,
        }),
      );
    });
  });

  // ─── addScreeningQuestions ─────────────────────────────────────────────────────
  describe('addScreeningQuestions', () => {
    it('should create questions with auto-incrementing sortOrder', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prisma.jobScreeningQuestion.create.mockResolvedValueOnce({
        id: 'q-1',
        question: 'Do you have experience?',
        sortOrder: 3,
      });

      const result = await service.addScreeningQuestions(
        'company-1',
        'job-1',
        [{ question: 'Do you have experience?', type: 'BOOLEAN' }],
        'membership-1',
      );

      expect(result).toHaveLength(1);
      expect(prisma.jobScreeningQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 3 }),
        }),
      );
    });
  });

  describe('updateScreeningQuestion', () => {
    it('should update a question', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.findFirst.mockResolvedValue({
        id: 'q-1',
        jobId: 'job-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.update.mockResolvedValue({ id: 'q-1', question: 'Updated?' });

      const result = await service.updateScreeningQuestion(
        'company-1',
        'job-1',
        'q-1',
        { question: 'Updated?' },
        'membership-1',
      );

      expect(result.question).toBe('Updated?');
    });
  });

  describe('deleteScreeningQuestion', () => {
    it('should soft delete a question', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.findFirst.mockResolvedValue({
        id: 'q-1',
        jobId: 'job-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.update.mockResolvedValue({ id: 'q-1', deletedAt: new Date() });

      const result = await service.deleteScreeningQuestion(
        'company-1',
        'job-1',
        'q-1',
        'membership-1',
      );

      expect(result.deletedAt).toBeDefined();
    });
  });

  describe('reorderScreeningQuestions', () => {
    it('should reorder questions in a transaction', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobScreeningQuestion.update.mockResolvedValue({});

      await service.reorderScreeningQuestions(
        'company-1',
        'job-1',
        [
          { id: 'q-1', sortOrder: 1 },
          { id: 'q-2', sortOrder: 2 },
        ],
        'membership-1',
      );

      expect(prisma.jobScreeningQuestion.update).toHaveBeenCalledTimes(2);
    });
  });

  // ─── updateAccessibility ───────────────────────────────────────────────────────
  describe('updateAccessibility', () => {
    it('should update accessibility config', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobAccessibilityConfiguration.update.mockResolvedValue({
        jobId: 'job-1',
        remoteAccommodationAvailable: true,
      });

      const result = await service.updateAccessibility(
        'company-1',
        'job-1',
        { remoteAccommodationAvailable: true },
        'membership-1',
      );

      expect(result.remoteAccommodationAvailable).toBe(true);
    });
  });

  // ─── Pipeline mutations ────────────────────────────────────────────────────────
  describe('updatePipeline', () => {
    it('should update pipeline name', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPipeline.update.mockResolvedValue({ jobId: 'job-1', name: 'New Pipeline' });

      const result = await service.updatePipeline(
        'company-1',
        'job-1',
        { name: 'New Pipeline' },
        'membership-1',
      );

      expect(result.name).toBe('New Pipeline');
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.PIPELINE_UPDATED,
        }),
      );
    });
  });

  describe('addPipelineStage', () => {
    it('should create a pipeline stage', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPipeline.findUnique.mockResolvedValue({ id: 'pipeline-1', jobId: 'job-1' });
      prisma.jobPipelineStage.create.mockResolvedValue({
        id: 'stage-1',
        pipelineId: 'pipeline-1',
        name: 'Phone Screen',
        sortOrder: 1,
      });

      const result = await service.addPipelineStage(
        'company-1',
        'job-1',
        { name: 'Phone Screen', type: PipelineStageType.SCREENING, sortOrder: 1 },
        'membership-1',
      );

      expect(result.name).toBe('Phone Screen');
    });
  });

  describe('updatePipelineStage', () => {
    it('should update a stage', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPipelineStage.findFirst.mockResolvedValue({
        id: 'stage-1',
        deletedAt: null,
        pipeline: { jobId: 'job-1' },
      });
      prisma.jobPipelineStage.update.mockResolvedValue({ id: 'stage-1', name: 'Updated' });

      const result = await service.updatePipelineStage(
        'company-1',
        'job-1',
        'stage-1',
        { name: 'Updated' },
        'membership-1',
      );

      expect(result.name).toBe('Updated');
    });
  });

  describe('deletePipelineStage', () => {
    it('should soft delete a stage', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPipelineStage.findFirst.mockResolvedValue({
        id: 'stage-1',
        deletedAt: null,
        pipeline: { jobId: 'job-1' },
      });
      prisma.jobPipelineStage.update.mockResolvedValue({ id: 'stage-1', deletedAt: new Date() });

      const result = await service.deletePipelineStage(
        'company-1',
        'job-1',
        'stage-1',
        'membership-1',
      );

      expect(result.deletedAt).toBeDefined();
    });
  });

  describe('reorderPipelineStages', () => {
    it('should reorder stages in a transaction', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPipelineStage.update.mockResolvedValue({});

      await service.reorderPipelineStages(
        'company-1',
        'job-1',
        [
          { id: 'stage-1', sortOrder: 0 },
          { id: 'stage-2', sortOrder: 1 },
        ],
        'membership-1',
      );

      expect(prisma.jobPipelineStage.update).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Collaborator mutations ────────────────────────────────────────────────────
  describe('addCollaborator', () => {
    it('should add a collaborator', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.companyMembership.findFirst.mockResolvedValue({
        id: 'mem-2',
        companyId: 'company-1',
        status: 'ACTIVE',
      });
      prisma.jobCollaborator.create.mockResolvedValue({
        id: 'collab-1',
        jobId: 'job-1',
        companyMembershipId: 'mem-2',
        type: 'REVIEWER',
      });

      const result = await service.addCollaborator(
        'company-1',
        'job-1',
        { membershipId: 'mem-2', type: 'REVIEWER' },
        'mem-1',
      );

      expect(result.type).toBe('REVIEWER');
    });
  });

  describe('updateCollaborator', () => {
    it('should update collaborator permissions', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobCollaborator.findFirst.mockResolvedValue({
        id: 'collab-1',
        jobId: 'job-1',
        removedAt: null,
      });
      prisma.jobCollaborator.update.mockResolvedValue({ id: 'collab-1', canEdit: true });

      const result = await service.updateCollaborator(
        'company-1',
        'job-1',
        'collab-1',
        { canEdit: true },
        'mem-1',
      );

      expect(result.canEdit).toBe(true);
    });
  });

  describe('removeCollaborator', () => {
    it('should remove collaborator and record activity', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobCollaborator.findFirst.mockResolvedValue({
        id: 'collab-1',
        jobId: 'job-1',
        type: 'REVIEWER',
        removedAt: null,
      });
      prisma.jobCollaborator.count.mockResolvedValue(2);
      prisma.jobCollaborator.update.mockResolvedValue({ id: 'collab-1', removedAt: new Date() });

      await service.removeCollaborator('company-1', 'job-1', 'collab-1', 'mem-1');

      expect(prisma.jobCollaborator.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'collab-1' },
          data: expect.objectContaining({ removedAt: expect.any(Date) }),
        }),
      );
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.COLLABORATOR_REMOVED,
        }),
      );
    });

    it('should protect the final owner from removal', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobCollaborator.findFirst.mockResolvedValue({
        id: 'collab-1',
        jobId: 'job-1',
        type: 'OWNER',
        removedAt: null,
      });
      prisma.jobCollaborator.count.mockResolvedValue(1);

      await expect(
        service.removeCollaborator('company-1', 'job-1', 'collab-1', 'mem-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership to another membership', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
        title: 'Test',
      });
      prisma.companyMembership.findFirst.mockResolvedValue({
        id: 'new-owner',
        companyId: 'company-1',
        status: 'ACTIVE',
      });

      prisma.jobCollaborator.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobCollaborator.findFirst.mockResolvedValue(null);
      prisma.jobCollaborator.create.mockResolvedValue({
        id: 'collab-new',
        companyMembershipId: 'new-owner',
        type: 'OWNER',
      });
      prisma.job.update.mockResolvedValue({ ownerMembershipId: 'new-owner' });

      await service.transferOwnership('company-1', 'job-1', 'new-owner', 'old-owner');

      expect(prisma.jobCollaborator.updateMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1', type: 'OWNER', removedAt: null },
        data: { removedAt: expect.any(Date) },
      });
      expect(prisma.jobCollaborator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyMembershipId: 'new-owner',
            type: 'OWNER',
          }),
        }),
      );
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { ownerMembershipId: 'new-owner', updatedByMembershipId: 'old-owner' },
      });
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.COLLABORATOR_UPDATED,
        }),
      );
    });
  });

  // ─── saveAsTemplate ────────────────────────────────────────────────────────────
  describe('saveAsTemplate', () => {
    it('should create a template from a job', async () => {
      prisma.job.findFirst.mockResolvedValueOnce({
        id: 'job-1',
        companyId: 'company-1',
        title: 'Senior Engineer',
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        experienceLevel: 'SENIOR',
        departmentId: 'dept-1',
        description: 'Job desc',
        responsibilities: 'Resp',
        qualifications: 'Quals',
        benefits: 'Benefits',
        deletedAt: null,
      });
      prisma.jobTemplate.findFirst.mockResolvedValue(null);
      prisma.jobTemplate.create.mockResolvedValue({
        id: 'template-1',
        companyId: 'company-1',
        name: 'Engineer Template',
        description: 'Template',
      });

      const result = await service.saveAsTemplate(
        'company-1',
        'job-1',
        { name: 'Engineer Template' },
        'membership-1',
      );

      expect(result.name).toBe('Engineer Template');
    });

    it('should reject duplicate template name', async () => {
      prisma.job.findFirst.mockResolvedValueOnce({
        id: 'job-1',
        companyId: 'company-1',
        title: 'Senior Engineer',
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        experienceLevel: 'SENIOR',
        deletedAt: null,
      });
      prisma.jobTemplate.findFirst.mockResolvedValue({ id: 'existing', name: 'Engineer Template' });

      await expect(
        service.saveAsTemplate('company-1', 'job-1', { name: 'Engineer Template' }, 'membership-1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
