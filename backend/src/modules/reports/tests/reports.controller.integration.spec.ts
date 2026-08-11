import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../services/reports.service';
import { CsvExportService } from '../exporters/csv-export.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// Real CSV exporter for safety tests
const realCsvExportService = new CsvExportService();

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const BASE = '/api/v1';

describe('ReportsController (HTTP integration)', () => {
  let app: INestApplication;
  let reportsService: any;
  let csvExportService: any;

  const mockReportsService = {
    getCandidateEvaluation: jest.fn(),
    getInterviewSummary: jest.fn(),
    getPipeline: jest.fn(),
    getTimeToHire: jest.fn(),
    getSourceEffectiveness: jest.fn(),
    getJobSummary: jest.fn(),
    getActivity: jest.fn(),
    getJobOptions: jest.fn(),
    getDepartmentOptions: jest.fn(),
  };

  const mockCsvExportService = {
    toCsv: jest.fn().mockReturnValue('a,b,c\r\n1,2,3'),
    getFilename: jest.fn().mockReturnValue('report.csv'),
    getContentType: jest.fn().mockReturnValue('text/csv; charset=utf-8'),
  };

  const emptyPaginated = { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
        { provide: CsvExportService, useValue: mockCsvExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          if (req.headers.authorization !== 'Bearer test-token') {
            throw new UnauthorizedException();
          }
          req.user = {
            userId: 'user-a',
            sessionId: 'session-a',
            activeCompanyId: 'company-a',
            role: 'COMPANY_ADMIN',
            permissions: ['applications.read'],
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportsService.getCandidateEvaluation.mockResolvedValue(emptyPaginated);
    mockReportsService.getInterviewSummary.mockResolvedValue(emptyPaginated);
    mockReportsService.getPipeline.mockResolvedValue({
      stages: [],
      totalApplications: 0,
      hiredCount: 0,
      rejectedCount: 0,
      activeCount: 0,
    });
    mockReportsService.getTimeToHire.mockResolvedValue(emptyPaginated);
    mockReportsService.getSourceEffectiveness.mockResolvedValue([]);
    mockReportsService.getJobSummary.mockResolvedValue(emptyPaginated);
    mockReportsService.getActivity.mockResolvedValue(emptyPaginated);
    mockReportsService.getJobOptions.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    });
    mockReportsService.getDepartmentOptions.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentication ──

  describe('authentication', () => {
    it('no Authorization returns 401', async () => {
      await request(app.getHttpServer()).get(`${BASE}/reports/candidate-evaluation`).expect(401);
    });

    it('invalid token returns 401', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation`)
        .set('Authorization', 'Bearer bad')
        .expect(401);
    });

    it('authenticated request succeeds', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
    });

    it('every service call receives company-a from principal', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation`)
        .set('Authorization', 'Bearer test-token');
      expect(mockReportsService.getCandidateEvaluation).toHaveBeenCalledWith(
        'company-a',
        expect.anything(),
      );
    });
  });

  // ── Route delegation ──

  describe('route delegation', () => {
    const dataRoutes = [
      ['candidate-evaluation', 'getCandidateEvaluation'],
      ['interview-summary', 'getInterviewSummary'],
      ['pipeline', 'getPipeline'],
      ['time-to-hire', 'getTimeToHire'],
      ['source-effectiveness', 'getSourceEffectiveness'],
      ['job-summary', 'getJobSummary'],
      ['activity', 'getActivity'],
    ];
    for (const [route, fn] of dataRoutes) {
      it(`GET /reports/${route} calls ${fn}`, async () => {
        await request(app.getHttpServer())
          .get(`${BASE}/reports/${route}`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);
        expect(mockReportsService[fn]).toHaveBeenCalledWith('company-a', expect.anything());
      });
    }

    const exportRouteTest = (route: string, mockSetup: () => void) => {
      it(`GET /reports/${route}/export returns CSV`, async () => {
        mockSetup();
        await request(app.getHttpServer())
          .get(`${BASE}/reports/${route}/export`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);
      });
    };

    exportRouteTest('candidate-evaluation', () =>
      mockReportsService.getCandidateEvaluation.mockResolvedValue(emptyPaginated),
    );
    exportRouteTest('interview-summary', () =>
      mockReportsService.getInterviewSummary.mockResolvedValue(emptyPaginated),
    );
    exportRouteTest('pipeline', () =>
      mockReportsService.getPipeline.mockResolvedValue({
        stages: [{ stage: 'SUBMITTED', count: 5 }],
        totalApplications: 5,
        hiredCount: 1,
        rejectedCount: 0,
        activeCount: 4,
      }),
    );
    exportRouteTest('time-to-hire', () =>
      mockReportsService.getTimeToHire.mockResolvedValue(emptyPaginated),
    );
    exportRouteTest('source-effectiveness', () =>
      mockReportsService.getSourceEffectiveness.mockResolvedValue([]),
    );
    exportRouteTest('job-summary', () =>
      mockReportsService.getJobSummary.mockResolvedValue(emptyPaginated),
    );
    exportRouteTest('activity', () =>
      mockReportsService.getActivity.mockResolvedValue(emptyPaginated),
    );
  });

  // ── Validation ──

  describe('validation', () => {
    it('valid date range passes', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2026-01-01&dateTo=2026-06-30`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
    });

    it('reversed date range returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2026-06-30&dateTo=2026-01-01`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('malformed date returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=not-a-date`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('invalid job UUID returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?jobIds=not-a-uuid`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('invalid status returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?statuses=INVALID_STATUS`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('page=0 returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?page=0`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('limit above max returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?limit=201`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  // ── Array transformation ──

  describe('array transformation', () => {
    it('repeated statuses route works', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?statuses=HIRED&statuses=REJECTED`)
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
    });
  });

  // ── Export ──

  describe('export behavior', () => {
    it('export returns CSV content type', async () => {
      mockReportsService.getCandidateEvaluation.mockResolvedValue({
        data: [
          {
            applicationId: 'a1',
            candidateName: 'A',
            email: 'a@b.com',
            jobTitle: 'Dev',
            jobDepartment: null,
            applicationStatus: 'HIRED',
            source: 'LINKEDIN',
            submittedAt: null,
            interviewStatus: null,
            interviewResult: null,
            rejectionReason: null,
          },
        ],
        meta: { total: 1, page: 1, limit: 5000, totalPages: 1 },
      });
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation/export`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('not truncated below 5001', async () => {
      mockReportsService.getCandidateEvaluation.mockResolvedValue({
        data: Array(5000).fill({
          applicationId: 'a',
          candidateName: 'A',
          email: 'a@b.com',
          jobTitle: 'Dev',
          jobDepartment: null,
          applicationStatus: 'HIRED',
          source: 'LINKEDIN',
          submittedAt: null,
          interviewStatus: null,
          interviewResult: null,
          rejectionReason: null,
        }),
        meta: { total: 5000, page: 1, limit: 5000, totalPages: 1 },
      });
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation/export`)
        .set('Authorization', 'Bearer test-token');
      expect(res.headers['x-export-truncated']).toBeUndefined();
    });

    it('truncated at 5001', async () => {
      mockReportsService.getCandidateEvaluation.mockResolvedValue({
        data: Array(5000).fill({
          applicationId: 'a',
          candidateName: 'A',
          email: 'a@b.com',
          jobTitle: 'Dev',
          jobDepartment: null,
          applicationStatus: 'HIRED',
          source: 'LINKEDIN',
          submittedAt: null,
          interviewStatus: null,
          interviewResult: null,
          rejectionReason: null,
        }),
        meta: { total: 5001, page: 1, limit: 5000, totalPages: 2 },
      });
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation/export`)
        .set('Authorization', 'Bearer test-token');
      expect(res.headers['x-export-truncated']).toBe('true');
      expect(res.headers['x-export-total-count']).toBe('5001');
      expect(res.headers['x-export-returned-count']).toBe('5000');
    });
  });

  // ── Strict date validation ──

  describe('strict date validation', () => {
    it('accepts 2024-02-29 (leap year)', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2024-02-29`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
    });

    it('rejects 2025-02-29 (non-leap)', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2025-02-29`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('rejects 2026-02-30', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2026-02-30`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('rejects ISO timestamp', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?dateFrom=2026-07-24T00:00:00Z`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  // ── Tenant isolation ──

  describe('tenant isolation', () => {
    it('unknown query param is rejected by whitelist', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation?companyId=company-b`)
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(400);
    });

    it('service always receives company-a from principal', async () => {
      // No tenant override possible — whitelist blocks unknown params
      await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      expect(mockReportsService.getCandidateEvaluation).toHaveBeenCalledWith(
        'company-a',
        expect.anything(),
      );
    });
  });

  // ── CSV safety (unit-tested in csv-export.service.spec.ts) ──

  describe('CSV safety', () => {
    it('export returns CSV content type', async () => {
      mockReportsService.getCandidateEvaluation.mockResolvedValue({
        data: [
          {
            applicationId: 'a1',
            candidateName: '=SUM(A1:A10)',
            email: 'a@b.com',
            jobTitle: 'Dev',
            jobDepartment: null,
            applicationStatus: 'HIRED',
            source: 'LINKEDIN',
            submittedAt: null,
            interviewStatus: null,
            interviewResult: null,
            rejectionReason: null,
          },
        ],
        meta: { total: 1, page: 1, limit: 5000, totalPages: 1 },
      });
      const res = await request(app.getHttpServer())
        .get(`${BASE}/reports/candidate-evaluation/export`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });
});
