import { Controller, Get, Query, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../auth/interfaces/auth.interface';
import { ReportsService } from './services/reports.service';
import { CsvExportService } from './exporters/csv-export.service';
import { ReportFilterDto } from './dto/report-filter.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly csvExportService: CsvExportService,
  ) {}

  @Get('candidate-evaluation')
  async candidateEvaluation(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getCandidateEvaluation(user.activeCompanyId!, filter);
  }

  @Get('candidate-evaluation/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async candidateEvaluationExport(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getCandidateEvaluation(user.activeCompanyId!, { ...filter, limit: 5000 });
    const headers = [
      { key: 'applicantionId' as const, label: 'Application ID' },
      { key: 'candidateName' as const, label: 'Candidate Name' },
      { key: 'email' as const, label: 'Email' },
      { key: 'jobTitle' as const, label: 'Job Title' },
      { key: 'jobDepartment' as const, label: 'Department' },
      { key: 'applicationStatus' as const, label: 'Status' },
      { key: 'source' as const, label: 'Source' },
      { key: 'submittedAt' as const, label: 'Submitted At' },
      { key: 'rejectionReason' as const, label: 'Rejection Reason' },
    ];
    const csv = this.csvExportService.toCsv(headers, result.data);
    res.setHeader('Content-Disposition', `attachment; filename="${this.csvExportService.getFilename('candidate-evaluation')}"`);
    res.send(csv);
  }

  @Get('interview-summary')
  async interviewSummary(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getInterviewSummary(user.activeCompanyId!, filter);
  }

  @Get('interview-summary/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async interviewSummaryExport(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getInterviewSummary(user.activeCompanyId!, { ...filter, limit: 5000 });
    const headers = [
      { key: 'candidateName' as const, label: 'Candidate Name' },
      { key: 'jobTitle' as const, label: 'Job Title' },
      { key: 'interviewType' as const, label: 'Interview Type' },
      { key: 'status' as const, label: 'Status' },
      { key: 'result' as const, label: 'Result' },
      { key: 'scheduledAt' as const, label: 'Scheduled At' },
      { key: 'completedAt' as const, label: 'Completed At' },
      { key: 'durationMinutes' as const, label: 'Duration (min)' },
      { key: 'interviewerName' as const, label: 'Interviewer' },
    ];
    const csv = this.csvExportService.toCsv(headers, result.data);
    res.setHeader('Content-Disposition', `attachment; filename="${this.csvExportService.getFilename('interview-summary')}"`);
    res.send(csv);
  }

  @Get('pipeline')
  async pipeline(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getPipeline(user.activeCompanyId!, filter);
  }

  @Get('time-to-hire')
  async timeToHire(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getTimeToHire(user.activeCompanyId!, filter);
  }

  @Get('source-effectiveness')
  async sourceEffectiveness(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getSourceEffectiveness(user.activeCompanyId!, filter);
  }

  @Get('job-summary')
  async jobSummary(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getJobSummary(user.activeCompanyId!, filter);
  }

  @Get('activity')
  async activity(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.reportsService.getActivity(user.activeCompanyId!, filter);
  }
}
