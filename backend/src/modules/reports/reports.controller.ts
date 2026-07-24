import { Controller, Get, Query, Res, UseGuards, Header, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../auth/interfaces/auth.interface';
import { ReportsService } from './services/reports.service';
import { CsvExportService } from './exporters/csv-export.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { validateDateRange, createExportFilter, toDateRange } from './services/report-utils';

const EXPORT_MAX = 5000;

type ExportableReport = 'candidate-evaluation' | 'interview-summary' | 'pipeline' | 'time-to-hire' | 'source-effectiveness' | 'job-summary' | 'activity';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly csvExportService: CsvExportService,
  ) {}

  private getActiveCompany(user: AuthenticatedPrincipal): string {
    if (!user.activeCompanyId) throw new ForbiddenException('Active company required');
    return user.activeCompanyId;
  }

  private prepareFilter(filter: ReportFilterDto): ReportFilterDto {
    validateDateRange(filter.dateFrom, filter.dateTo);
    const dateRange = toDateRange(filter.dateFrom, filter.dateTo);
    const copy = new ReportFilterDto();
    copy.dateFrom = filter.dateFrom;
    copy.dateTo = filter.dateTo;
    copy.jobIds = filter.jobIds ? [...filter.jobIds] : undefined;
    copy.departmentIds = filter.departmentIds ? [...filter.departmentIds] : undefined;
    copy.statuses = filter.statuses ? [...filter.statuses] : undefined;
    copy.page = filter.page;
    copy.limit = filter.limit;
    return copy;
  }

  private validateAndExport<T>(
    res: Response, data: T[], headers: { key: keyof T & string; label: string }[],
    filename: string, total: number,
  ): void {
    if (total > EXPORT_MAX) {
      res.setHeader('X-Export-Truncated', 'true');
      res.setHeader('X-Export-Total-Count', String(total));
      res.setHeader('X-Export-Returned-Count', String(EXPORT_MAX));
    }
    const csv = this.csvExportService.toCsv(headers, data.slice(0, EXPORT_MAX));
    res.setHeader('Content-Disposition', `attachment; filename="${this.csvExportService.getFilename(filename)}"`);
    res.send(csv);
  }

  // ── Candidate Evaluation ──

  @Get('candidate-evaluation')
  async candidateEvaluation(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getCandidateEvaluation(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('candidate-evaluation/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async candidateEvaluationExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const { data, meta } = await this.reportsService.getCandidateEvaluation(
      this.getActiveCompany(user), createExportFilter(this.prepareFilter(filter)),
    );
    this.validateAndExport(res, data, [
      { key: 'applicationId', label: 'Application ID' }, { key: 'candidateName', label: 'Candidate Name' },
      { key: 'email', label: 'Email' }, { key: 'jobTitle', label: 'Job Title' },
      { key: 'jobDepartment', label: 'Department' }, { key: 'applicationStatus', label: 'Status' },
      { key: 'source', label: 'Source' }, { key: 'submittedAt', label: 'Submitted At' },
      { key: 'rejectionReason', label: 'Rejection Reason' },
    ], 'candidate-evaluation', meta.total);
  }

  // ── Interview Summary ──

  @Get('interview-summary')
  async interviewSummary(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getInterviewSummary(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('interview-summary/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async interviewSummaryExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const { data, meta } = await this.reportsService.getInterviewSummary(
      this.getActiveCompany(user), createExportFilter(this.prepareFilter(filter)),
    );
    this.validateAndExport(res, data, [
      { key: 'candidateName', label: 'Candidate Name' }, { key: 'jobTitle', label: 'Job Title' },
      { key: 'interviewType', label: 'Interview Type' }, { key: 'status', label: 'Status' },
      { key: 'result', label: 'Result' }, { key: 'scheduledAt', label: 'Scheduled At' },
      { key: 'completedAt', label: 'Completed At' }, { key: 'durationMinutes', label: 'Duration (min)' },
      { key: 'interviewerName', label: 'Interviewer' },
    ], 'interview-summary', meta.total);
  }

  // ── Pipeline ──

  @Get('pipeline')
  async pipeline(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getPipeline(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('pipeline/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async pipelineExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const report = await this.reportsService.getPipeline(this.getActiveCompany(user), this.prepareFilter(filter));
    const data = [
      { metric: 'Total Applications', value: report.totalApplications },
      { metric: 'Active', value: report.activeCount },
      { metric: 'Hired', value: report.hiredCount },
      { metric: 'Rejected', value: report.rejectedCount },
      ...report.stages.map((s) => ({ metric: `Stage: ${s.stage}`, value: s.count })),
    ];
    this.validateAndExport(res, data, [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }], 'pipeline', data.length);
  }

  // ── Time-to-Hire ──

  @Get('time-to-hire')
  async timeToHire(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getTimeToHire(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('time-to-hire/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async timeToHireExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const { data, meta } = await this.reportsService.getTimeToHire(
      this.getActiveCompany(user), createExportFilter(this.prepareFilter(filter)),
    );
    this.validateAndExport(res, data, [
      { key: 'candidateName', label: 'Candidate Name' }, { key: 'jobTitle', label: 'Job Title' },
      { key: 'submittedAt', label: 'Submitted At' }, { key: 'hiredAt', label: 'Hired At' },
      { key: 'daysToHire', label: 'Days to Hire' }, { key: 'department', label: 'Department' },
    ], 'time-to-hire', meta.total);
  }

  // ── Source Effectiveness ──

  @Get('source-effectiveness')
  async sourceEffectiveness(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getSourceEffectiveness(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('source-effectiveness/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async sourceEffectivenessExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const data = await this.reportsService.getSourceEffectiveness(this.getActiveCompany(user), this.prepareFilter(filter));
    this.validateAndExport(res, data, [
      { key: 'source', label: 'Source Channel' }, { key: 'applicationCount', label: 'Applications' },
      { key: 'interviewedCount', label: 'Interviewed' }, { key: 'hiredCount', label: 'Hired' },
      { key: 'rejectedCount', label: 'Rejected' },
    ], 'source-effectiveness', data.length);
  }

  // ── Job Summary ──

  @Get('job-summary')
  async jobSummary(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getJobSummary(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('job-summary/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async jobSummaryExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const { data, meta } = await this.reportsService.getJobSummary(
      this.getActiveCompany(user), createExportFilter(this.prepareFilter(filter)),
    );
    this.validateAndExport(res, data, [
      { key: 'title', label: 'Job Title' }, { key: 'department', label: 'Department' },
      { key: 'status', label: 'Status' }, { key: 'applicationCount', label: 'Applications' },
      { key: 'interviewCount', label: 'Interviews' }, { key: 'activeApplicationCount', label: 'Active' },
      { key: 'hiredCount', label: 'Hired' }, { key: 'rejectedCount', label: 'Rejected' },
    ], 'job-summary', meta.total);
  }

  // ── Activity ──

  @Get('activity')
  async activity(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.reportsService.getActivity(this.getActiveCompany(user), this.prepareFilter(filter));
  }

  @Get('activity/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async activityExport(@Query() filter: ReportFilterDto, @CurrentUser() user: AuthenticatedPrincipal, @Res() res: Response) {
    const { data, meta } = await this.reportsService.getActivity(
      this.getActiveCompany(user), createExportFilter(this.prepareFilter(filter)),
    );
    this.validateAndExport(res, data, [
      { key: 'occurredAt', label: 'Date' }, { key: 'eventType', label: 'Event Type' },
      { key: 'entityType', label: 'Entity Type' }, { key: 'description', label: 'Description' },
    ], 'activity', meta.total);
  }
}
