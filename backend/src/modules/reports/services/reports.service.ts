import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { ReportFilterDto } from '../dto/report-filter.dto';
import { toDateRange, isRejected, isActive } from './report-utils';

export interface CandidateEvaluationRow {
  applicationId: string;
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

export interface PipelineStageMetric { stage: string; count: number; }
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
  applicationsInterviewed: number;
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
}

export interface ReportPaginationMeta { total: number; page: number; limit: number; totalPages: number; }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildAppWhere(companyId: string, filter: ReportFilterDto): Prisma.ApplicationWhereInput {
    const where: Prisma.ApplicationWhereInput = { companyId, deletedAt: null };
    const dateRange = toDateRange(filter.dateFrom, filter.dateTo);
    if (dateRange) { where.submittedAt = dateRange; }
    if (filter.jobIds?.length) where.jobId = { in: filter.jobIds };
    if (filter.statuses?.length) where.status = { in: filter.statuses };
    if (filter.departmentIds?.length) where.job = { departmentId: { in: filter.departmentIds } };
    return where;
  }

  // ── Candidate Evaluation ──

  async getCandidateEvaluation(companyId: string, filter: ReportFilterDto):
    Promise<{ data: CandidateEvaluationRow[]; meta: ReportPaginationMeta }> {
    const where = this.buildAppWhere(companyId, filter);
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: {
          id: true, status: true, source: true, submittedAt: true, rejectionReasonCode: true,
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          job: { select: { title: true, department: { select: { name: true } } } },
          interviews: { select: { status: true, result: true }, take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: items.map((app) => ({
        applicationId: app.id,
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
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Interview Summary ──

  async getInterviewSummary(companyId: string, filter: ReportFilterDto):
    Promise<{ data: InterviewSummaryRow[]; meta: ReportPaginationMeta }> {
    const where: Prisma.InterviewWhereInput = { companyId };
    const dateRange = toDateRange(filter.dateFrom, filter.dateTo);
    if (dateRange) where.scheduledAt = dateRange;
    if (filter.jobIds?.length) where.jobId = { in: filter.jobIds };
    if (filter.departmentIds?.length) where.job = { departmentId: { in: filter.departmentIds } };

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.interview.findMany({
        where,
        select: {
          id: true, type: true, status: true, result: true, scheduledAt: true, completedAt: true, durationMinutes: true,
          application: { select: { job: { select: { title: true } }, candidate: { select: { id: true, firstName: true, lastName: true } } } },
          participants: { select: { membership: { select: { user: { select: { firstName: true, lastName: true } } } } }, take: 1 },
        },
        orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.interview.count({ where }),
    ]);

    return {
      data: items.map((iv) => ({
        interviewId: iv.id,
        candidateName: iv.application?.candidate ? `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim() : 'Unknown',
        jobTitle: iv.application?.job?.title || '',
        interviewType: iv.type,
        status: iv.status,
        result: iv.result,
        scheduledAt: iv.scheduledAt.toISOString(),
        completedAt: iv.completedAt?.toISOString() || null,
        durationMinutes: iv.durationMinutes || null,
        interviewerName: iv.participants[0]?.membership?.user
          ? `${iv.participants[0].membership.user.firstName} ${iv.participants[0].membership.user.lastName}`.trim() : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Pipeline ──

  async getPipeline(companyId: string, filter: ReportFilterDto): Promise<PipelineReport> {
    const where = this.buildAppWhere(companyId, filter);
    const activeWhere: Prisma.ApplicationWhereInput = {
      ...where, status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED] },
    };

    const [grouped, hiredCount, rejectedCount, activeCount] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['status'],
        where: activeWhere,
        _count: { id: true },
      }),
      this.prisma.application.count({ where: { ...where, status: ApplicationStatus.HIRED } }),
      this.prisma.application.count({ where: { ...where, status: { in: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.DISQUALIFIED] } } }),
      this.prisma.application.count({ where: { ...where, status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED, ApplicationStatus.HIRED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.DISQUALIFIED] } } }),
    ]);

    return {
      stages: grouped.map((g) => ({ stage: g.status, count: g._count?.id ?? 0 })),
      totalApplications: grouped.reduce((acc, g) => acc + (g._count?.id ?? 0), 0),
      hiredCount, rejectedCount, activeCount,
    };
  }

  // ── Time-to-Hire ──

  async getTimeToHire(companyId: string, filter: ReportFilterDto):
    Promise<{ data: TimeToHireRow[]; meta: ReportPaginationMeta }> {
    const baseWhere = this.buildAppWhere(companyId, filter);
    // Time-to-Hire filters by hiredAt date, not submittedAt
    const hiredDateRange = toDateRange(filter.dateFrom, filter.dateTo);
    const where: Prisma.ApplicationWhereInput = {
      companyId, deletedAt: null, status: ApplicationStatus.HIRED, hiredAt: { not: null },
      ...(hiredDateRange ? { hiredAt: hiredDateRange } : {}),
    };
    if (filter.jobIds?.length) where.jobId = { in: filter.jobIds };
    if (filter.departmentIds?.length) where.job = { departmentId: { in: filter.departmentIds } };

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: {
          id: true, submittedAt: true, hiredAt: true,
          candidate: { select: { firstName: true, lastName: true } },
          job: { select: { title: true, department: { select: { name: true } } } },
        },
        orderBy: [{ hiredAt: 'desc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: items.map((app) => {
        const submittedMs = app.submittedAt?.getTime();
        const hiredMs = app.hiredAt?.getTime();
        let durationHours: number | null = null;
        let daysToHire: number | null = null;
        if (submittedMs && hiredMs && hiredMs >= submittedMs) {
          durationHours = Math.round((hiredMs - submittedMs) / (1000 * 60 * 60) * 100) / 100;
          daysToHire = Math.round(durationHours / 24 * 100) / 100;
        }
        return {
          applicationId: app.id,
          candidateName: app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : 'Unknown',
          jobTitle: app.job?.title || '',
          submittedAt: app.submittedAt?.toISOString() || '',
          hiredAt: app.hiredAt?.toISOString() || null,
          daysToHire,
          department: app.job?.department?.name || null,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Source Effectiveness (2 groupBy queries, merged via Map) ──

  async getSourceEffectiveness(companyId: string, filter: ReportFilterDto): Promise<SourceEffectivenessRow[]> {
    const where = this.buildAppWhere(companyId, filter);

    const [appBySource, interviewedBySource] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['source', 'status'],
        where,
        _count: { id: true },
      }),
      this.prisma.application.groupBy({
        by: ['source'],
        where: { ...where, interviews: { some: {} } },
        _count: { id: true },
      }),
    ]);

    const sourceMap = new Map<string, { apps: number; interviewed: number; hired: number; rejected: number }>();
    for (const row of appBySource) {
      const entry = sourceMap.get(row.source) || { apps: 0, interviewed: 0, hired: 0, rejected: 0 };
      entry.apps += row._count.id;
      if (row.status === ApplicationStatus.HIRED) entry.hired += row._count.id;
      if (isRejected(row.status)) entry.rejected += row._count.id;
      sourceMap.set(row.source, entry);
    }
    for (const row of interviewedBySource) {
      const entry = sourceMap.get(row.source);
      if (entry) entry.interviewed += row._count.id;
    }

    return Array.from(sourceMap.entries()).map(([source, vals]) => ({
      source,
      applicationCount: vals.apps,
      applicationsInterviewed: vals.interviewed,
      hiredCount: vals.hired,
      rejectedCount: vals.rejected,
    }));
  }

  // ── Job Summary (properly scoped to current page — 3 queries max) ──

  async getJobSummary(companyId: string, filter: ReportFilterDto):
    Promise<{ data: JobSummaryRow[]; meta: ReportPaginationMeta }> {
    const jobsWhere: Prisma.JobWhereInput = { companyId, deletedAt: null };
    if (filter.jobIds?.length) jobsWhere.id = { in: filter.jobIds };
    if (filter.departmentIds?.length) jobsWhere.departmentId = { in: filter.departmentIds };

    const total = await this.prisma.job.count({ where: jobsWhere });

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const jobs = await this.prisma.job.findMany({
      where: jobsWhere,
      select: { id: true, title: true, status: true, department: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip, take: limit,
    });

    if (jobs.length === 0) {
      return { data: [], meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    const pageJobIds = jobs.map((j) => j.id);

    // Build application where, but override jobIds to only current page
    const appWhere = this.buildAppWhere(companyId, filter);
    appWhere.jobId = { in: pageJobIds };

    // Interview aggregation — same page scope
    const interviewWhere: Prisma.InterviewWhereInput = { companyId, jobId: { in: pageJobIds } };
    const ivDateRange = toDateRange(filter.dateFrom, filter.dateTo);
    if (ivDateRange) interviewWhere.scheduledAt = ivDateRange;
    if (filter.departmentIds?.length) interviewWhere.job = { departmentId: { in: filter.departmentIds } };

    const [appByJobAndStatus, interviewByJob] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['jobId', 'status'],
        where: appWhere,
        _count: { id: true },
      }),
      this.prisma.interview.groupBy({
        by: ['jobId'],
        where: interviewWhere,
        _count: { id: true },
      }),
    ]);

    const appMap = new Map<string, { total: number; hired: number; rejected: number; active: number }>();
    for (const row of appByJobAndStatus) {
      const entry = appMap.get(row.jobId) || { total: 0, hired: 0, rejected: 0, active: 0 };
      entry.total += row._count.id;
      if (row.status === ApplicationStatus.HIRED) entry.hired += row._count.id;
      if (isRejected(row.status)) entry.rejected += row._count.id;
      if (isActive(row.status)) entry.active += row._count.id;
      appMap.set(row.jobId, entry);
    }

    const interviewCounts = new Map<string, number>();
    for (const row of interviewByJob) {
      interviewCounts.set(row.jobId, (interviewCounts.get(row.jobId) || 0) + (row._count?.id ?? 0));
    }

    return {
      data: jobs.map((job) => {
        const a = appMap.get(job.id) || { total: 0, hired: 0, rejected: 0, active: 0 };
        return {
          jobId: job.id,
          title: job.title,
          department: job.department?.name || null,
          status: job.status,
          applicationCount: a.total,
          interviewCount: interviewCounts.get(job.id) || 0,
          hiredCount: a.hired,
          rejectedCount: a.rejected,
          activeApplicationCount: a.active,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Activity ──

  async getActivity(companyId: string, filter: ReportFilterDto):
    Promise<{ data: ActivityRow[]; meta: ReportPaginationMeta }> {
    const where: Prisma.ApplicationAuditEventWhereInput = { companyId };
    const dateRange = toDateRange(filter.dateFrom, filter.dateTo);
    if (dateRange) where.occurredAt = dateRange;

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.applicationAuditEvent.findMany({
        where,
        select: { eventType: true, entityType: true, description: true, actorType: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.applicationAuditEvent.count({ where }),
    ]);

    return {
      data: items.map((ev) => ({
        occurredAt: ev.occurredAt.toISOString(),
        eventType: ev.eventType,
        entityType: ev.entityType,
        description: ev.description,
        actorType: ev.actorType || null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Filter Options ──

  async getJobOptions(companyId: string, search?: string, page = 1, limit = 50) {
    const where: Prisma.JobWhereInput = { companyId, deletedAt: null };
    if (search?.trim()) where.title = { contains: search.trim(), mode: 'insensitive' };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where, select: { id: true, title: true },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);
    return {
      data: items.map((j) => ({ id: j.id, label: j.title })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: skip + items.length < total },
    };
  }

  async getDepartmentOptions(companyId: string, search?: string, page = 1, limit = 50) {
    const where: Prisma.DepartmentWhereInput = { companyId, deletedAt: null, status: 'ACTIVE' };
    if (search?.trim()) where.name = { contains: search.trim(), mode: 'insensitive' };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.department.findMany({
        where, select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip, take: limit,
      }),
      this.prisma.department.count({ where }),
    ]);
    return {
      data: items.map((d) => ({ id: d.id, label: d.name })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: skip + items.length < total },
    };
  }
}
