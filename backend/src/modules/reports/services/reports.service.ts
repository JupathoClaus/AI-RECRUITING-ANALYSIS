import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationStatus,
  CandidateSource,
  Prisma,
  InterviewStatus,
  InterviewResult,
} from '@prisma/client';
import { ReportFilterDto } from '../dto/report-filter.dto';

// ── Typed report results ──

export interface CandidateEvaluationRow {
  candidateId: string;
  candidateName: string;
  email: string;
  jobTitle: string;
  jobDepartment: string | null;
  applicationStatus: string;
  source: string;
  submittedAt: string | null;
  interviewStatus: string | null;
  interviewResult: string | null;
  rejectionReason: string | null;
  applicantionId: string;
}

export interface InterviewSummaryRow {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  interviewType: string;
  status: string;
  result: string | null;
  scheduledAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  interviewerName: string | null;
}

export interface PipelineStageMetric {
  stage: string;
  count: number;
}

export interface PipelineReport {
  stages: PipelineStageMetric[];
  totalApplications: number;
  hiredCount: number;
  rejectedCount: number;
  activeCount: number;
}

export interface TimeToHireRow {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  submittedAt: string;
  hiredAt: string | null;
  daysToHire: number | null;
  department: string | null;
}

export interface SourceEffectivenessRow {
  source: string;
  applicationCount: number;
  interviewedCount: number;
  hiredCount: number;
  rejectedCount: number;
}

export interface JobSummaryRow {
  jobId: string;
  title: string;
  department: string | null;
  status: string;
  applicationCount: number;
  interviewCount: number;
  hiredCount: number;
  rejectedCount: number;
  activeApplicationCount: number;
}

export interface ActivityRow {
  occurredAt: string;
  eventType: string;
  entityType: string;
  description: string;
  actorType: string | null;
  actorName: string | null;
}

export interface ReportPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildDateWhere(companyId: string, filter: ReportFilterDto): Prisma.ApplicationWhereInput {
    const where: Prisma.ApplicationWhereInput = { companyId, deletedAt: null };
    if (filter.dateFrom || filter.dateTo) {
      where.submittedAt = {};
      if (filter.dateFrom) (where.submittedAt as Prisma.DateTimeFilter).gte = new Date(filter.dateFrom);
      if (filter.dateTo) (where.submittedAt as Prisma.DateTimeFilter).lte = new Date(filter.dateTo);
    }
    if (filter.jobIds?.length) where.jobId = { in: filter.jobIds };
    if (filter.statuses?.length) where.status = { in: filter.statuses };
    if (filter.departmentIds?.length) {
      where.job = { departmentId: { in: filter.departmentIds } };
    }
    return where;
  }

  // ── Candidate Evaluation Report ──

  async getCandidateEvaluation(
    companyId: string,
    filter: ReportFilterDto,
  ): Promise<{ data: CandidateEvaluationRow[]; meta: ReportPaginationMeta }> {
    const where = this.buildDateWhere(companyId, filter);
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: {
          id: true,
          status: true,
          source: true,
          submittedAt: true,
          rejectionReasonCode: true,
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          job: { select: { title: true, department: { select: { name: true } } } },
          interviews: {
            select: { status: true, result: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);

    const data: CandidateEvaluationRow[] = items.map((app) => ({
      applicantionId: app.id,
      candidateId: app.candidate?.id || '',
      candidateName: app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : 'Unknown',
      email: app.candidate?.email || '',
      jobTitle: app.job?.title || '',
      jobDepartment: app.job?.department?.name || null,
      applicationStatus: app.status,
      source: app.source,
      submittedAt: app.submittedAt?.toISOString() || null,
      interviewStatus: app.interviews[0]?.status || null,
      interviewResult: app.interviews[0]?.result || null,
      rejectionReason: app.rejectionReasonCode || null,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Interview Summary Report ──

  async getInterviewSummary(
    companyId: string,
    filter: ReportFilterDto,
  ): Promise<{ data: InterviewSummaryRow[]; meta: ReportPaginationMeta }> {
    const where: Prisma.InterviewWhereInput = { companyId };
    if (filter.dateFrom || filter.dateTo) {
      where.scheduledAt = {};
      if (filter.dateFrom) (where.scheduledAt as Prisma.DateTimeFilter).gte = new Date(filter.dateFrom);
      if (filter.dateTo) (where.scheduledAt as Prisma.DateTimeFilter).lte = new Date(filter.dateTo);
    }
    if (filter.jobIds?.length) where.jobId = { in: filter.jobIds };
    if (filter.departmentIds?.length) {
      where.job = { departmentId: { in: filter.departmentIds } };
    }

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.interview.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          result: true,
          scheduledAt: true,
          completedAt: true,
          durationMinutes: true,
          application: {
            select: {
              job: { select: { title: true } },
              candidate: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          participants: {
            select: { membership: { select: { user: { select: { firstName: true, lastName: true } } } } },
            take: 1,
          },
        },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.interview.count({ where }),
    ]);

    const data: InterviewSummaryRow[] = items.map((iv) => ({
      interviewId: iv.id,
      candidateName: iv.application?.candidate
        ? `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim()
        : 'Unknown',
      jobTitle: iv.application?.job?.title || '',
      interviewType: iv.type,
      status: iv.status,
      result: iv.result,
      scheduledAt: iv.scheduledAt.toISOString(),
      completedAt: iv.completedAt?.toISOString() || null,
      durationMinutes: iv.durationMinutes || null,
      interviewerName: iv.participants[0]?.membership?.user
        ? `${iv.participants[0].membership.user.firstName} ${iv.participants[0].membership.user.lastName}`.trim()
        : null,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Pipeline Report ──

  async getPipeline(companyId: string, filter: ReportFilterDto): Promise<PipelineReport> {
    const where = this.buildDateWhere(companyId, filter);

    const [grouped, hiredCount, rejectedCount, activeCount] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['status'],
        where: { ...where, status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED] } },
        _count: { id: true },
      }),
      this.prisma.application.count({ where: { ...where, status: ApplicationStatus.HIRED } }),
      this.prisma.application.count({
        where: { ...where, status: { in: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.DISQUALIFIED] } },
      }),
      this.prisma.application.count({
        where: { ...where, status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED, ApplicationStatus.HIRED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.DISQUALIFIED] } },
      }),
    ]);

    const stages: PipelineStageMetric[] = grouped.map((g) => ({
      stage: g.status,
      count: g._count.id,
    }));

    const totalApplications = grouped.reduce((acc, g) => acc + g._count.id, 0);

    return { stages, totalApplications, hiredCount, rejectedCount, activeCount };
  }

  // ── Time-to-Hire Report ──

  async getTimeToHire(companyId: string, filter: ReportFilterDto): Promise<{ data: TimeToHireRow[]; meta: ReportPaginationMeta }> {
    const baseWhere = this.buildDateWhere(companyId, filter);
    const where: Prisma.ApplicationWhereInput = { ...baseWhere, status: ApplicationStatus.HIRED, hiredAt: { not: null } };

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: {
          id: true,
          submittedAt: true,
          hiredAt: true,
          candidate: { select: { firstName: true, lastName: true } },
          job: { select: { title: true, department: { select: { name: true } } } },
        },
        orderBy: { hiredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);

    const data: TimeToHireRow[] = items.map((app) => {
      const submitted = app.submittedAt?.getTime();
      const hired = app.hiredAt?.getTime();
      return {
        applicationId: app.id,
        candidateName: app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : 'Unknown',
        jobTitle: app.job?.title || '',
        submittedAt: app.submittedAt?.toISOString() || '',
        hiredAt: app.hiredAt?.toISOString() || null,
        daysToHire: submitted && hired ? Math.round((hired - submitted) / (1000 * 60 * 60 * 24)) : null,
        department: app.job?.department?.name || null,
      };
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Source Effectiveness Report ──

  async getSourceEffectiveness(companyId: string, filter: ReportFilterDto): Promise<SourceEffectivenessRow[]> {
    const where = this.buildDateWhere(companyId, filter);

    const groups = await this.prisma.application.groupBy({
      by: ['source'],
      where,
      _count: { id: true },
    });

    const rows: SourceEffectivenessRow[] = [];
    for (const g of groups) {
      const sourceWhere = { ...where, source: g.source };
      const [interviewed, hired, rejected] = await Promise.all([
        this.prisma.application.count({ where: { ...sourceWhere, interviews: { some: {} } } }),
        this.prisma.application.count({ where: { ...sourceWhere, status: ApplicationStatus.HIRED } }),
        this.prisma.application.count({ where: { ...sourceWhere, status: { in: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN] } } }),
      ]);
      rows.push({
        source: g.source,
        applicationCount: g._count.id,
        interviewedCount: interviewed,
        hiredCount: hired,
        rejectedCount: rejected,
      });
    }

    return rows;
  }

  // ── Job Summary Report ──

  async getJobSummary(companyId: string, filter: ReportFilterDto): Promise<JobSummaryRow[]> {
    const jobsWhere: Prisma.JobWhereInput = { companyId, deletedAt: null };
    if (filter.departmentIds?.length) jobsWhere.departmentId = { in: filter.departmentIds };

    const jobs = await this.prisma.job.findMany({
      where: jobsWhere,
      select: {
        id: true,
        title: true,
        status: true,
        department: { select: { name: true } },
        _count: {
          select: {
            applications: true,
            interviews: true,
          },
        },
      },
    });

    const appWhere = this.buildDateWhere(companyId, filter);
    const rows: JobSummaryRow[] = [];
    for (const job of jobs) {
      const jobAppWhere = { ...appWhere, jobId: job.id };
      const [hiredCount, rejectedCount, activeCount] = await Promise.all([
        this.prisma.application.count({ where: { ...jobAppWhere, status: ApplicationStatus.HIRED } }),
        this.prisma.application.count({ where: { ...jobAppWhere, status: { in: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN] } } }),
        this.prisma.application.count({ where: { ...jobAppWhere, status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED, ApplicationStatus.HIRED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.DISQUALIFIED] } } }),
      ]);
      rows.push({
        jobId: job.id,
        title: job.title,
        department: job.department?.name || null,
        status: job.status,
        applicationCount: job._count.applications,
        interviewCount: job._count.interviews,
        hiredCount,
        rejectedCount,
        activeApplicationCount: activeCount,
      });
    }

    return rows;
  }

  // ── Activity Report ──

  async getActivity(companyId: string, filter: ReportFilterDto): Promise<{ data: ActivityRow[]; meta: ReportPaginationMeta }> {
    const where: Prisma.ApplicationAuditEventWhereInput = { companyId };
    if (filter.dateFrom || filter.dateTo) {
      where.occurredAt = {};
      if (filter.dateFrom) (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(filter.dateFrom);
      if (filter.dateTo) (where.occurredAt as Prisma.DateTimeFilter).lte = new Date(filter.dateTo);
    }

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.applicationAuditEvent.findMany({
        where,
        select: {
          eventType: true,
          entityType: true,
          description: true,
          actorType: true,
          actorUserId: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.applicationAuditEvent.count({ where }),
    ]);

    const data: ActivityRow[] = items.map((ev) => ({
      occurredAt: ev.occurredAt.toISOString(),
      eventType: ev.eventType,
      entityType: ev.entityType,
      description: ev.description,
      actorType: ev.actorType || null,
      actorName: null,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
