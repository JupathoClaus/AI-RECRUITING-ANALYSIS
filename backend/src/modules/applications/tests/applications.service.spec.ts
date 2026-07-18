import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from '../services/applications.service';
import { ApplicationNumberService } from '../services/application-number.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { ApplicationWorkflowService } from '../services/application-workflow.service';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus, CandidateSource } from '@prisma/client';

const COMPANY_ID = 'company-1';
const JOB_ID = 'job-1';
const CANDIDATE_ID = 'cand-1';

function makeJob(status = 'PUBLISHED', deadline: Date | null = null) {
  return {
    id: JOB_ID,
    companyId: COMPANY_ID,
    status,
    title: 'Dev',
    jobCode: 'JOB-2026-00001',
    applicationDeadline: deadline,
    deletedAt: null,
    pipeline: { stages: [{ id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 }] },
    screeningQuestions: [],
    screeningAnswers: [],
  };
}

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: any;
  let numberService: any;
  let auditService: any;
  let workflowService: any;
  let companyCandidateService: any;

  beforeEach(async () => {
    prisma = {
      job: { findFirst: jest.fn() },
      candidate: { findUnique: jest.fn() },
      application: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
      companyMembership: { findFirst: jest.fn() },
      applicationAssignment: { create: jest.fn() },
      applicationScreeningAnswer: { createMany: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    numberService = { generate: jest.fn().mockResolvedValue('APP-2026-000001') };
    auditService = { record: jest.fn() };
    workflowService = { transition: jest.fn() };
    companyCandidateService = {
      findOrCreate: jest
        .fn()
        .mockResolvedValue({ id: 'cc-1', companyId: COMPANY_ID, candidateId: CANDIDATE_ID }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApplicationNumberService, useValue: numberService },
        { provide: ApplicationAuditService, useValue: auditService },
        { provide: ApplicationWorkflowService, useValue: workflowService },
        { provide: CompanyCandidateService, useValue: companyCandidateService },
      ],
    }).compile();
    service = module.get<ApplicationsService>(ApplicationsService);
  });

  const createDto = {
    candidateId: CANDIDATE_ID,
    jobId: JOB_ID,
    source: CandidateSource.RECRUITER_CREATED,
  };

  describe('create', () => {
    it('throws NotFoundException if job not found in company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);
      await expect(service.create(createDto, COMPANY_ID, 'u1', 'm1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if job is not PUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue(makeJob('DRAFT'));
      await expect(service.create(createDto, COMPANY_ID, 'u1', 'm1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if application deadline has passed', async () => {
      const past = new Date(Date.now() - 86400000);
      prisma.job.findFirst.mockResolvedValue(makeJob('PUBLISHED', past));
      await expect(service.create(createDto, COMPANY_ID, 'u1', 'm1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException on duplicate active application', async () => {
      prisma.job.findFirst.mockResolvedValue(makeJob());
      prisma.candidate.findUnique.mockResolvedValue({ id: CANDIDATE_ID });
      prisma.application.findFirst.mockResolvedValue({
        id: 'dup-1',
        status: ApplicationStatus.SUBMITTED,
      });
      await expect(service.create(createDto, COMPANY_ID, 'u1', 'm1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates application and creates/reuses CompanyCandidate', async () => {
      prisma.job.findFirst.mockResolvedValue(makeJob());
      prisma.candidate.findUnique.mockResolvedValue({ id: CANDIDATE_ID });
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.create.mockResolvedValue({
        id: 'app-1',
        companyId: COMPANY_ID,
        jobId: JOB_ID,
        applicationNumber: 'APP-2026-000001',
        publicReference: 'ref1',
        status: ApplicationStatus.DRAFT,
        version: 1,
      });
      // findById call inside create
      prisma.application.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'app-1',
        companyId: COMPANY_ID,
        jobId: JOB_ID,
        applicationNumber: 'APP-2026-000001',
        publicReference: 'ref1',
        status: ApplicationStatus.DRAFT,
        version: 1,
        candidate: { id: CANDIDATE_ID, firstName: 'John', lastName: 'Doe' },
        job: {
          id: JOB_ID,
          title: 'Dev',
          jobCode: 'JOB-2026-00001',
          pipeline: null,
          screeningQuestions: [],
        },
        companyCandidate: null,
        currentStage: null,
        stageHistory: [],
        assignments: [],
        notes: [],
        flags: [],
        screeningAnswers: [],
        decisions: [],
        tagAssignments: [],
        deletedAt: null,
      });
      const result = await service.create(createDto, COMPANY_ID, 'u1', 'm1');
      expect(companyCandidateService.findOrCreate).toHaveBeenCalledWith(
        COMPANY_ID,
        CANDIDATE_ID,
        CandidateSource.RECRUITER_CREATED,
        undefined,
        undefined,
        'm1',
        'u1',
        expect.anything(),
      );
      expect(result.applicationNumber).toBe('APP-2026-000001');
    });

    it('generates unique publicReference', async () => {
      prisma.job.findFirst.mockResolvedValue(makeJob());
      prisma.candidate.findUnique.mockResolvedValue({ id: CANDIDATE_ID });
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.create.mockResolvedValue({
        id: 'app-1',
        companyId: COMPANY_ID,
        jobId: JOB_ID,
        applicationNumber: 'APP-2026-000001',
        publicReference: 'ref-uuid',
        status: ApplicationStatus.DRAFT,
        version: 1,
      });
      prisma.application.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'app-1',
        companyId: COMPANY_ID,
        jobId: JOB_ID,
        applicationNumber: 'APP-2026-000001',
        publicReference: 'ref-uuid',
        status: ApplicationStatus.DRAFT,
        version: 1,
        candidate: { id: CANDIDATE_ID, firstName: 'John', lastName: 'Doe' },
        job: {
          id: JOB_ID,
          title: 'Dev',
          jobCode: 'JOB-2026-00001',
          pipeline: null,
          screeningQuestions: [],
        },
        companyCandidate: null,
        currentStage: null,
        stageHistory: [],
        assignments: [],
        notes: [],
        flags: [],
        screeningAnswers: [],
        decisions: [],
        tagAssignments: [],
        deletedAt: null,
      });
      const result = await service.create(createDto, COMPANY_ID, 'u1', 'm1');
      expect(result.publicReference).toBeDefined();
      expect(typeof result.publicReference).toBe('string');
    });
  });

  describe('getSummary', () => {
    it('returns aggregated status counts without loading all rows', async () => {
      prisma.application.groupBy
        .mockResolvedValueOnce([
          { status: 'DRAFT', _count: { id: 5 } },
          { status: 'SUBMITTED', _count: { id: 3 } },
        ])
        .mockResolvedValueOnce([]);
      const result = (await service.getSummary(COMPANY_ID)) as any;
      expect(result.total).toBe(8);
      expect(result.draft).toBe(5);
      expect(result.submitted).toBe(3);
    });
  });
});
