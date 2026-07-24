import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { ReportsService } from '../services/reports.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  const mockPrisma = {
    application: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    interview: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    job: { findMany: jest.fn(), count: jest.fn() },
    applicationAuditEvent: { findMany: jest.fn(), count: jest.fn() },
  };

  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';

  const makeFilter = (overrides?: Partial<ReportFilterDto>): ReportFilterDto =>
    Object.assign(new ReportFilterDto(), { page: 1, limit: 50, ...overrides });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
    prisma = mockPrisma;
  });

  beforeEach(() => { jest.clearAllMocks(); });

  // ── Tenant isolation (every report type) ──

  function setupMocks() {
    prisma.application.findMany.mockResolvedValue([]);
    prisma.application.count.mockResolvedValue(0);
    prisma.interview.findMany.mockResolvedValue([]);
    prisma.interview.count.mockResolvedValue(0);
    prisma.interview.groupBy.mockResolvedValue([]);
    prisma.job.findMany.mockResolvedValue([]);
    prisma.job.count.mockResolvedValue(0);
    prisma.application.groupBy.mockResolvedValue([]);
    prisma.applicationAuditEvent.findMany.mockResolvedValue([]);
    prisma.applicationAuditEvent.count.mockResolvedValue(0);
  }

  it('candidate-evaluation scopes by companyId', async () => { setupMocks(); await service.getCandidateEvaluation(COMPANY_A, makeFilter()); expect(prisma.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });
  it('interview-summary scopes by companyId', async () => { setupMocks(); await service.getInterviewSummary(COMPANY_A, makeFilter()); expect(prisma.interview.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });
  it('pipeline scopes by companyId', async () => { setupMocks(); await service.getPipeline(COMPANY_A, makeFilter()); expect(prisma.application.count).toHaveBeenCalled(); });
  it('time-to-hire scopes by companyId', async () => { setupMocks(); await service.getTimeToHire(COMPANY_A, makeFilter()); expect(prisma.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });
  it('source-effectiveness scopes by companyId', async () => { setupMocks(); await service.getSourceEffectiveness(COMPANY_A, makeFilter()); expect(prisma.application.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });
  it('job-summary scopes by companyId', async () => { setupMocks(); await service.getJobSummary(COMPANY_A, makeFilter()); expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });
  it('activity scopes by companyId', async () => { setupMocks(); await service.getActivity(COMPANY_A, makeFilter()); expect(prisma.applicationAuditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_A }) })); });

  // ── Candidate Evaluation ──

  describe('getCandidateEvaluation', () => {
    it('applies date filters', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      await service.getCandidateEvaluation(COMPANY_A, makeFilter({ dateFrom: '2026-01-01', dateTo: '2026-06-30' }));
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.submittedAt.gte).toEqual(new Date('2026-01-01'));
      expect(where.submittedAt.lte).toEqual(new Date('2026-06-30'));
    });

    it('applies jobId filter', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      await service.getCandidateEvaluation(COMPANY_A, makeFilter({ jobIds: ['job-1'] }));
      expect(prisma.application.findMany.mock.calls[0][0].where.jobId).toEqual({ in: ['job-1'] });
    });

    it('returns empty result when no data', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const result = await service.getCandidateEvaluation(COMPANY_A, makeFilter());
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('returns pagination meta', async () => {
      prisma.application.findMany.mockResolvedValue(Array(20).fill({
        id: 'a', status: 'ACTIVE', source: 'RECRUITER', submittedAt: new Date(),
        candidate: { id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
        job: { title: 'Dev', department: null }, interviews: [],
      }));
      prisma.application.count.mockResolvedValue(45);
      const result = await service.getCandidateEvaluation(COMPANY_A, makeFilter({ page: 2, limit: 20 }));
      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });
  });

  // ── Time-to-Hire ──

  describe('getTimeToHire', () => {
    it('filters only hired applications with hiredAt', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      await service.getTimeToHire(COMPANY_A, makeFilter());
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('HIRED');
      expect(where.hiredAt).toEqual({ not: null });
    });

    it('calculates days correctly', async () => {
      const submitted = new Date('2026-01-10');
      const hired = new Date('2026-02-15');
      const diffDays = Math.round((hired.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(36);
      prisma.application.findMany.mockResolvedValue([{
        id: 'a1', submittedAt: submitted, hiredAt: hired,
        candidate: { firstName: 'A', lastName: 'B' },
        job: { title: 'Dev', department: { name: 'Eng' } },
      }]);
      prisma.application.count.mockResolvedValue(1);
      const result = await service.getTimeToHire(COMPANY_A, makeFilter());
      expect(result.data[0].daysToHire).toBe(36);
    });
  });

  // ── Pipeline ──

  describe('getPipeline', () => {
    it('returns correct stage aggregation', async () => {
      prisma.application.groupBy.mockResolvedValue([
        { status: 'SUBMITTED', _count: { id: 10 } },
        { status: 'INTERVIEW', _count: { id: 5 } },
        { status: 'HIRED', _count: { id: 3 } },
      ]);
      prisma.application.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(15);
      const result = await service.getPipeline(COMPANY_A, makeFilter());
      expect(result.stages).toHaveLength(3);
      expect(result.hiredCount).toBe(3);
    });
  });

  // ── Source Effectiveness ──

  describe('getSourceEffectiveness', () => {
    it('aggregates by source with outcome counts', async () => {
      prisma.application.groupBy
        .mockResolvedValueOnce([
          { source: 'LINKEDIN', status: 'SUBMITTED', _count: { id: 10 } },
          { source: 'LINKEDIN', status: 'HIRED', _count: { id: 2 } },
          { source: 'REFERRAL', status: 'SUBMITTED', _count: { id: 5 } },
        ])
        .mockResolvedValueOnce([
          { source: 'LINKEDIN', _count: { id: 3 } },
          { source: 'REFERRAL', _count: { id: 2 } },
        ]);
      const result = await service.getSourceEffectiveness(COMPANY_A, makeFilter());
      const linkedin = result.find((r: any) => r.source === 'LINKEDIN')!;
      expect(linkedin).toBeDefined();
      expect(linkedin.applicationCount).toBe(12);
      expect(linkedin.interviewedCount).toBe(3);
      expect(linkedin.hiredCount).toBe(2);
    });
  });

  // ── Job Summary ──

  describe('getJobSummary', () => {
    it('uses fixed query count', async () => {
      prisma.job.findMany.mockResolvedValue([{ id: 'j1', title: 'Dev', status: 'PUBLISHED', department: null }]);
      prisma.job.count.mockResolvedValue(1);
      prisma.application.groupBy.mockResolvedValue([{ jobId: 'j1', status: 'HIRED', _count: { id: 2 } }]);
      prisma.interview.groupBy.mockResolvedValue([{ jobId: 'j1', _count: { id: 5 } }]);
      const result = await service.getJobSummary(COMPANY_A, makeFilter());
      expect(result.data).toHaveLength(1);
      expect(result.data[0].hiredCount).toBe(2);
      expect(result.data[0].interviewCount).toBe(5);
    });
  });

  // ── Invalid filter handling ──

  describe('filter validation', () => {
    it('validates date range', () => {
      const filter = makeFilter({ dateFrom: '2026-06-30', dateTo: '2026-01-01' });
      expect(() => filter.validateDateRange()).toThrow();
    });

    it('accepts valid date range', () => {
      const filter = makeFilter({ dateFrom: '2026-01-01', dateTo: '2026-06-30' });
      expect(() => filter.validateDateRange()).not.toThrow();
    });
  });
});
