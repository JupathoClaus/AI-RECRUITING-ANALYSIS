import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { ReportsService } from '../services/reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  const mockPrisma = {
    application: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    interview: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    job: {
      findMany: jest.fn(),
    },
    applicationAuditEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const COMPANY_ID = 'company-1';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = mockPrisma;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCandidateEvaluation', () => {
    it('scopes by companyId', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50 } as any;
      await service.getCandidateEvaluation(COMPANY_ID, filter);
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, deletedAt: null }),
        }),
      );
    });

    it('applies date filters', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50, dateFrom: '2026-01-01', dateTo: '2026-06-30' } as any;
      await service.getCandidateEvaluation(COMPANY_ID, filter);
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.submittedAt).toBeDefined();
      expect(where.submittedAt.gte).toEqual(new Date('2026-01-01'));
      expect(where.submittedAt.lte).toEqual(new Date('2026-06-30'));
    });

    it('applies jobId filter', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50, jobIds: ['job-1', 'job-2'] } as any;
      await service.getCandidateEvaluation(COMPANY_ID, filter);
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.jobId).toEqual({ in: ['job-1', 'job-2'] });
    });

    it('applies status filter', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50, statuses: ['HIRED', 'REJECTED'] } as any;
      await service.getCandidateEvaluation(COMPANY_ID, filter);
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['HIRED', 'REJECTED'] });
    });

    it('returns empty result when no data', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50 } as any;
      const result = await service.getCandidateEvaluation(COMPANY_ID, filter);
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('returns pagination meta', async () => {
      prisma.application.findMany.mockResolvedValue(Array(20).fill({
        id: 'a',
        status: 'ACTIVE',
        source: 'RECRUITER',
        submittedAt: new Date(),
        candidate: { id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
        job: { title: 'Dev', department: null },
        interviews: [],
      }));
      prisma.application.count.mockResolvedValue(45);
      const filter = { page: 2, limit: 20 } as any;
      const result = await service.getCandidateEvaluation(COMPANY_ID, filter);
      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });
  });

  describe('getTimeToHire', () => {
    it('filters only hired applications with hiredAt set', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50 } as any;
      await service.getTimeToHire(COMPANY_ID, filter);
      const where = prisma.application.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('HIRED');
      expect(where.hiredAt).toEqual({ not: null });
    });
  });

  describe('getSourceEffectiveness', () => {
    it('groups by source', async () => {
      prisma.application.groupBy.mockResolvedValue([{ source: 'LINKEDIN', _count: { id: 5 } }]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50 } as any;
      const result = await service.getSourceEffectiveness(COMPANY_ID, filter);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('LINKEDIN');
      expect(result[0].applicationCount).toBe(5);
    });
  });

  describe('tenant isolation', () => {
    it('company A cannot access company B data via candidate-evaluation', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50 } as any;
      await service.getCandidateEvaluation('company-a', filter);
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-a' }),
        }),
      );
    });

    it('unknown job IDs return empty', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
      const filter = { page: 1, limit: 50, jobIds: ['nonexistent'] } as any;
      const result = await service.getCandidateEvaluation(COMPANY_ID, filter);
      expect(result.data).toHaveLength(0);
    });
  });
});
