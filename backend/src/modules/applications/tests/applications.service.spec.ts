import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InAppNotificationsService } from '@modules/notifications/services/in-app-notifications.service';
import { ApplicationsService } from '../services/applications.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { LocalStorageProvider } from '@modules/files/providers/local-storage.provider';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { ApplicationNumberService } from '../services/application-number.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { ApplicationWorkflowService } from '../services/application-workflow.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';

const JOB_ID = 'job-1';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    title: 'Engineer',
    pipeline: { stages: [{ id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 }] },
    screeningQuestions: [{ id: 'q-1' }, { id: 'q-2' }],
    ...overrides,
  };
}

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: any;
  let numberService: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      job: { findFirst: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      candidate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cand-new' }),
      },
      application: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'app-new' }),
      },
      applicationStageHistory: { create: jest.fn() },
      applicationScreeningAnswer: { createMany: jest.fn() },
      storedFile: {
        create: jest.fn().mockResolvedValue({ id: 'file-new', checksumSha256: 'sha-cv' }),
      },
      resumeTextExtraction: { create: jest.fn().mockResolvedValue({ id: 'ex-new' }) },
      extractionDispatch: { create: jest.fn() },
    };
    numberService = { generate: jest.fn().mockResolvedValue('APP-2026-000042') };
    auditService = { record: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LocalStorageProvider, useValue: { put: jest.fn(), delete: jest.fn() } },
        {
          provide: CompanyCandidateService,
          useValue: { findOrCreate: jest.fn().mockResolvedValue({ id: 'cc-1' }) },
        },
        { provide: ApplicationNumberService, useValue: numberService },
        { provide: ApplicationAuditService, useValue: auditService },
        { provide: ApplicationWorkflowService, useValue: { transition: jest.fn() } },
        { provide: IdempotencyService, useValue: { claim: jest.fn(), getRecord: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(10 * 1024 * 1024) } },
        { provide: InAppNotificationsService, useValue: { create: jest.fn() } },
        { provide: ApplicationWorkflowService, useValue: { transition: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get<ApplicationsService>(ApplicationsService);
  });

  describe('create', () => {
    it('throws NotFoundException if job not found in company', async () => {
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue(null);
      await expect(
        service.create(
          { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
          'company-1',
          'u1',
          'm1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if job is not PUBLISHED', async () => {
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue({ ...makeJob(), status: 'DRAFT' });
      await expect(
        service.create(
          { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
          'company-1',
          'u1',
          'm1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if job is CLOSED', async () => {
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue({ ...makeJob(), status: 'CLOSED' });
      await expect(
        service.create(
          { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
          'company-1',
          'u1',
          'm1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if application deadline has passed', async () => {
      const past = new Date(Date.now() - 86400000);
      jest
        .spyOn(prisma.job, 'findFirst')
        .mockResolvedValue({ ...makeJob(), applicationDeadline: past });
      await expect(
        service.create(
          { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
          'company-1',
          'u1',
          'm1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on duplicate active application', async () => {
      const jobWithPipeline = {
        ...makeJob(),
        pipeline: { stages: [{ id: 'stage-1' }] },
        status: 'PUBLISHED',
      };
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue(jobWithPipeline);
      jest.spyOn(prisma.candidate, 'findUnique').mockResolvedValue({ id: 'cand-1' });
      jest
        .spyOn(prisma.application, 'findFirst')
        .mockResolvedValue({ id: 'dup-1', status: 'SUBMITTED' });
      await expect(
        service.create(
          { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
          'company-1',
          'u1',
          'm1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates application and creates/reuses CompanyCandidate', async () => {
      const jobWithPipeline = {
        ...makeJob(),
        pipeline: { stages: [{ id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 }] },
        status: 'PUBLISHED',
      };
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue(jobWithPipeline);
      jest.spyOn(prisma.candidate, 'findUnique').mockResolvedValue({ id: 'cand-1' });
      jest
        .spyOn(prisma.application, 'findFirst')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'app-new',
          companyId: 'company-1',
          jobId: 'job-1',
          applicationNumber: 'APP-2026-000042',
          publicReference: 'ref1',
          status: 'DRAFT',
          version: 1,
          candidate: { id: 'cand-new', firstName: 'Test', lastName: 'User' },
          job: {
            id: 'job-1',
            title: 'Engineer',
            jobCode: 'JOB-2026-00001',
            pipeline: {
              stages: [{ id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 }],
            },
            screeningQuestions: [],
          },
          companyCandidate: { id: 'cc-1' },
          currentStage: { id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 },
          stageHistory: [],
          assignments: [],
          notes: [],
          flags: [],
          screeningAnswers: [],
          decisions: [],
          tagAssignments: [],
          deletedAt: null,
        });
      jest.spyOn(prisma.application, 'create').mockResolvedValue({
        id: 'app-new',
        companyId: 'company-1',
        jobId: 'job-1',
        applicationNumber: 'APP-2026-000042',
        publicReference: 'ref1',
        status: 'DRAFT',
        version: 1,
      });
      const result = await service.create(
        { candidateId: 'cand-1', jobId: 'job-1', source: 'RECRUITER_CREATED' },
        'company-1',
        'u1',
        'm1',
      );
      expect(result!.applicationNumber).toBe('APP-2026-000042');
    });
  });

  describe('findAll – latestScreening in list response', () => {
    function makeListApp(screeningOverride?: { id: string; status: string } | null) {
      return {
        id: 'app-1',
        applicationNumber: 'APP-001',
        publicReference: 'ref-1',
        status: 'SUBMITTED',
        source: 'DIRECT',
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        candidate: { id: 'c-1', firstName: 'Ada', lastName: 'Lovelace', headline: null, currentJobTitle: null },
        job: { id: 'j-1', title: 'Engineer', jobCode: 'JOB-001', departmentId: null },
        currentStage: { id: 's-1', name: 'Applied', type: 'APPLIED' },
        assignments: [],
        flags: [],
        _count: { screeningAnswers: 0, notes: 0 },
        aiScreeningResults:
          screeningOverride === undefined
            ? []
            : screeningOverride === null
              ? []
              : [screeningOverride],
      };
    }

    beforeEach(() => {
      prisma.application = {
        ...prisma.application,
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      };
    });

    it('returns latestScreening null when no screening record exists', async () => {
      prisma.application.findMany.mockResolvedValue([makeListApp(undefined)]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      expect(result.data[0].latestScreening).toBeNull();
    });

    it('returns latestScreening with COMPLETED status', async () => {
      prisma.application.findMany.mockResolvedValue([
        makeListApp({ id: 'sr-1', status: 'COMPLETED' }),
      ]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      expect(result.data[0].latestScreening).toEqual({ id: 'sr-1', status: 'COMPLETED' });
    });

    it('returns latestScreening with PENDING status', async () => {
      prisma.application.findMany.mockResolvedValue([
        makeListApp({ id: 'sr-2', status: 'PENDING' }),
      ]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      expect(result.data[0].latestScreening).toEqual({ id: 'sr-2', status: 'PENDING' });
    });

    it('returns latestScreening with RUNNING status', async () => {
      prisma.application.findMany.mockResolvedValue([
        makeListApp({ id: 'sr-3', status: 'RUNNING' }),
      ]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      expect(result.data[0].latestScreening).toEqual({ id: 'sr-3', status: 'RUNNING' });
    });

    it('returns latestScreening with FAILED status', async () => {
      prisma.application.findMany.mockResolvedValue([
        makeListApp({ id: 'sr-4', status: 'FAILED' }),
      ]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      expect(result.data[0].latestScreening).toEqual({ id: 'sr-4', status: 'FAILED' });
    });

    it('filters applications to the requesting company scope', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      const whereArg = prisma.application.findMany.mock.calls[0][0].where;
      expect(whereArg.companyId).toBe('company-1');
    });

    it('includes aiScreeningResults in the findMany query with take:1 and desc order', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      await service.findAll({ page: 1, limit: 20 } as any, 'company-1');
      const includeArg = prisma.application.findMany.mock.calls[0][0].include;
      expect(includeArg.aiScreeningResults).toMatchObject({
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
  });
});
