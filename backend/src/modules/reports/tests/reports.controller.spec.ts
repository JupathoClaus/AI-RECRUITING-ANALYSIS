import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../services/reports.service';
import { CsvExportService } from '../exporters/csv-export.service';
import { ReportFilterDto } from '../dto/report-filter.dto';
import type { AuthenticatedPrincipal } from '../../auth/interfaces/auth.interface';

describe('ReportsController (unit)', () => {
  let controller: ReportsController;
  let reportsService: any;
  let csvExportService: any;
  let res: any;

  const mockUser: AuthenticatedPrincipal = {
    userId: 'user-1',
    activeCompanyId: 'company-1',
    sessionId: 'sess-1',
    role: 'COMPANY_ADMIN',
    permissions: [],
  };
  const mockUserNoCompany: AuthenticatedPrincipal = {
    userId: 'user-1',
    sessionId: 'sess-1',
    role: 'VIEWER',
    permissions: [],
  };

  beforeAll(() => {
    reportsService = {
      getCandidateEvaluation: jest.fn(),
      getInterviewSummary: jest.fn(),
      getPipeline: jest.fn(),
      getTimeToHire: jest.fn(),
      getSourceEffectiveness: jest.fn(),
      getJobSummary: jest.fn(),
      getActivity: jest.fn(),
    };
    csvExportService = {
      toCsv: jest.fn().mockReturnValue('a,b,c\r\n1,2,3'),
      getFilename: jest.fn().mockReturnValue('report.csv'),
      getContentType: jest.fn().mockReturnValue('text/csv; charset=utf-8'),
    };
    controller = new (ReportsController as any)(reportsService, csvExportService);

    res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Active company enforcement ──

  describe('getActiveCompany', () => {
    it('returns activeCompanyId when present', () => {
      const result = (controller as any).getActiveCompany(mockUser);
      expect(result).toBe('company-1');
    });

    it('throws 403 when missing', () => {
      expect(() => (controller as any).getActiveCompany(mockUserNoCompany)).toThrow(
        ForbiddenException,
      );
    });
  });

  // ── Filter preparation ──

  describe('prepareFilter', () => {
    it('validates date range', () => {
      const filter = new ReportFilterDto();
      filter.dateFrom = '2026-06-30';
      filter.dateTo = '2026-01-01';
      expect(() => (controller as any).prepareFilter(filter)).toThrow(BadRequestException);
    });

    it('passes through valid filters', () => {
      const filter = new ReportFilterDto();
      filter.dateFrom = '2026-01-01';
      filter.dateTo = '2026-06-30';
      filter.jobIds = ['job-1'];
      filter.statuses = ['HIRED'];
      const result = (controller as any).prepareFilter(filter);
      expect(result.dateFrom).toBe('2026-01-01');
      expect(result.jobIds).toEqual(['job-1']);
      expect(result.statuses).toEqual(['HIRED']);
    });
  });

  // ── Data endpoints ──

  describe('candidateEvaluation', () => {
    it('calls service with company ID and filter', async () => {
      reportsService.getCandidateEvaluation.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      const result = await controller.candidateEvaluation(new ReportFilterDto(), mockUser);
      expect(reportsService.getCandidateEvaluation).toHaveBeenCalledWith(
        'company-1',
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });

  describe('interviewSummary', () => {
    it('calls service with company ID and filter', async () => {
      reportsService.getInterviewSummary.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      await controller.interviewSummary(new ReportFilterDto(), mockUser);
      expect(reportsService.getInterviewSummary).toHaveBeenCalledWith(
        'company-1',
        expect.anything(),
      );
    });
  });

  describe('pipeline', () => {
    it('calls service with company ID', async () => {
      reportsService.getPipeline.mockResolvedValue({
        stages: [],
        totalApplications: 0,
        hiredCount: 0,
        rejectedCount: 0,
        activeCount: 0,
      });
      await controller.pipeline(new ReportFilterDto(), mockUser);
      expect(reportsService.getPipeline).toHaveBeenCalledWith('company-1', expect.anything());
    });
  });

  describe('timeToHire', () => {
    it('calls service with company ID', async () => {
      reportsService.getTimeToHire.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      await controller.timeToHire(new ReportFilterDto(), mockUser);
      expect(reportsService.getTimeToHire).toHaveBeenCalledWith('company-1', expect.anything());
    });
  });

  describe('sourceEffectiveness', () => {
    it('calls service with company ID', async () => {
      reportsService.getSourceEffectiveness.mockResolvedValue([]);
      await controller.sourceEffectiveness(new ReportFilterDto(), mockUser);
      expect(reportsService.getSourceEffectiveness).toHaveBeenCalledWith(
        'company-1',
        expect.anything(),
      );
    });
  });

  describe('jobSummary', () => {
    it('calls service with company ID', async () => {
      reportsService.getJobSummary.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      await controller.jobSummary(new ReportFilterDto(), mockUser);
      expect(reportsService.getJobSummary).toHaveBeenCalledWith('company-1', expect.anything());
    });
  });

  describe('activity', () => {
    it('calls service with company ID', async () => {
      reportsService.getActivity.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      await controller.activity(new ReportFilterDto(), mockUser);
      expect(reportsService.getActivity).toHaveBeenCalledWith('company-1', expect.anything());
    });
  });

  // ── Export endpoints ──

  describe('exports', () => {
    it('candidateEvaluationExport sends CSV with correct content type', async () => {
      reportsService.getCandidateEvaluation.mockResolvedValue({
        data: [
          {
            applicationId: 'a1',
            candidateName: 'Alice',
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
      await controller.candidateEvaluationExport(new ReportFilterDto(), mockUser, res);
      expect(csvExportService.toCsv).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('.csv'),
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('export sets truncation headers when total exceeds 5000', async () => {
      const bigData = Array.from({ length: 5000 }, (_, i) => ({
        applicationId: `a${i}`,
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
      }));
      reportsService.getCandidateEvaluation.mockResolvedValue({
        data: bigData,
        meta: { total: 5234, page: 1, limit: 5000, totalPages: 2 },
      });
      await controller.candidateEvaluationExport(new ReportFilterDto(), mockUser, res);
      expect(res.setHeader).toHaveBeenCalledWith('X-Export-Truncated', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('X-Export-Total-Count', '5234');
      expect(res.setHeader).toHaveBeenCalledWith('X-Export-Returned-Count', '5000');
    });

    it('non-truncated export omits truncation headers', async () => {
      reportsService.getCandidateEvaluation.mockResolvedValue({
        data: [
          {
            applicationId: 'a1',
            candidateName: 'Alice',
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
      await controller.candidateEvaluationExport(new ReportFilterDto(), mockUser, res);
      const truncatedCall = res.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'X-Export-Truncated',
      );
      expect(truncatedCall).toBeUndefined();
    });

    it('pipelineExport includes summary and stages', async () => {
      reportsService.getPipeline.mockResolvedValue({
        stages: [
          { stage: 'SUBMITTED', count: 10 },
          { stage: 'HIRED', count: 3 },
        ],
        totalApplications: 13,
        hiredCount: 3,
        rejectedCount: 2,
        activeCount: 8,
      });
      await controller.pipelineExport(new ReportFilterDto(), mockUser, res);
      expect(csvExportService.toCsv).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });
  });
});
