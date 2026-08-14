import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus, Prisma } from '@prisma/client';

const funnelStageOrder = ['Applied', 'Screened', 'Interviewed', 'Offered', 'Hired'] as const;

const funnelStages: ApplicationStatus[][] = [
  [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SCREENING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.ASSESSMENT,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.HIRED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.DISQUALIFIED,
    ApplicationStatus.ON_HOLD,
  ],
  [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SCREENING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.ASSESSMENT,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.HIRED,
  ],
  [ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER, ApplicationStatus.HIRED],
  [ApplicationStatus.OFFER, ApplicationStatus.HIRED],
  [ApplicationStatus.HIRED],
];

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function previousSixMonthLabels(): string[] {
  const now = new Date();
  const current = now.getMonth();
  const labels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    labels.push(MONTH_NAMES[(current - i + 12) % 12]);
  }
  return labels;
}

function getGroupCount(row: { _count: { id: number } | true }): number {
  return typeof row._count === 'object' ? row._count.id : 0;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private baseWhere(
    companyId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.ApplicationWhereInput {
    const where: Prisma.ApplicationWhereInput = { companyId, deletedAt: null };
    if (dateFrom || dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(dateTo);
      where.createdAt = createdAt;
    }
    return where;
  }

  async getOverview(companyId: string, dateFrom?: string, dateTo?: string) {
    const where = this.baseWhere(companyId, dateFrom, dateTo);
    const totalApplications = await this.prisma.application.count({ where });

    const { hiredApps, validHiredCount } = await this.fetchHiredAppsWithValidCount(where);

    let avgTimeToHire: number | null = null;
    if (validHiredCount > 0) {
      const totalDays = hiredApps.reduce((sum, app) => {
        if (!app.createdAt || !app.hiredAt) return sum;
        const diff = app.hiredAt.getTime() - app.createdAt.getTime();
        if (diff <= 0) return sum;
        return sum + Math.round(diff / (1000 * 60 * 60 * 24));
      }, 0);
      avgTimeToHire = Math.round(totalDays / validHiredCount);
    }

    const hiredCount = await this.prisma.application.count({
      where: { ...where, status: ApplicationStatus.HIRED },
    });
    const offeredCount = await this.prisma.application.count({
      where: { ...where, status: ApplicationStatus.OFFER },
    });
    const rejectedCount = await this.prisma.application.count({
      where: { ...where, status: ApplicationStatus.REJECTED },
    });

    const totalDecided = hiredCount + offeredCount + rejectedCount;
    const selectionRate =
      totalDecided > 0 ? Math.round(((hiredCount + offeredCount) / totalDecided) * 100) : null;

    return {
      totalApplications,
      avgTimeToHire,
      selectionRate,
      aiScreeningAccuracy: null,
    };
  }

  async getFunnel(companyId: string, dateFrom?: string, dateTo?: string) {
    const where: Prisma.ApplicationWhereInput = {
      ...this.baseWhere(companyId, dateFrom, dateTo),
      status: { notIn: [ApplicationStatus.DRAFT, ApplicationStatus.ARCHIVED] },
    };

    const counts = await this.prisma.application.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    const statusMap = new Map(counts.map((r) => [r.status, getGroupCount(r)]));
    const funnel = funnelStages.map((statuses, i) => ({
      stage: funnelStageOrder[i],
      count: statuses.reduce((sum, s) => sum + (statusMap.get(s) || 0), 0),
    }));

    return funnel;
  }

  async getDepartments(companyId: string, dateFrom?: string, dateTo?: string) {
    const depts = await this.prisma.department.findMany({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    const jobs = await this.prisma.job.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, departmentId: true, numberOfOpenings: true },
    });

    const appWhere = this.baseWhere(companyId, dateFrom, dateTo);
    const appsByDept = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: appWhere,
      _count: { id: true },
    });

    const jobDeptMap = new Map<string, string>();
    const deptOpenings = new Map<string, number>();
    const deptApps = new Map<string, number>();

    for (const job of jobs) {
      if (job.departmentId) {
        jobDeptMap.set(job.id, job.departmentId);
        deptOpenings.set(
          job.departmentId,
          (deptOpenings.get(job.departmentId) || 0) + job.numberOfOpenings,
        );
      }
    }

    for (const app of appsByDept) {
      const deptId = jobDeptMap.get(app.jobId);
      if (deptId) {
        deptApps.set(deptId, (deptApps.get(deptId) || 0) + getGroupCount(app));
      }
    }

    return depts.map((dept) => ({
      dept: dept.name,
      open: deptOpenings.get(dept.id) || 0,
      applications: deptApps.get(dept.id) || 0,
      avgScore: null,
      timeToHire: null,
    }));
  }

  async getSources(companyId: string, dateFrom?: string, dateTo?: string) {
    const where = this.baseWhere(companyId, dateFrom, dateTo);

    const appSources = await this.prisma.application.groupBy({
      by: ['source'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const sourceLabels: Record<string, string> = {
      CAREERS_PAGE: 'Careers Page',
      RECRUITER_CREATED: 'Recruiter',
      REFERRAL: 'Referral',
      LINKEDIN: 'LinkedIn',
      FACEBOOK: 'Facebook',
      JOB_BOARD: 'Job Board',
      AGENCY: 'Agency',
      IMPORT: 'Import',
      EVENT: 'Event',
      INTERNAL: 'Internal',
      OTHER: 'Other',
    };

    return appSources.map((r) => ({
      name: sourceLabels[r.source] || r.source,
      value: getGroupCount(r),
    }));
  }

  async getTimeToHireTrend(companyId: string, dateFrom?: string, dateTo?: string) {
    const where = this.baseWhere(companyId, dateFrom, dateTo);
    const monthLabels = previousSixMonthLabels();

    const now = new Date();
    const firstLabelMonth = (now.getMonth() - 5 + 12) % 12;
    const startYear = now.getFullYear() - (firstLabelMonth > now.getMonth() ? 1 : 0);
    const rangeStart = new Date(startYear, firstLabelMonth, 1);

    const { hiredApps } = await this.fetchHiredAppsWithValidCount({
      ...where,
      hiredAt: { gte: rangeStart },
    });

    const monthToLabel = new Map<number, string>();
    for (let i = 0; i < monthLabels.length; i++) {
      monthToLabel.set((firstLabelMonth + i) % 12, monthLabels[i]);
    }

    const monthData = new Map<string, number[]>();
    for (const label of monthLabels) monthData.set(label, []);

    for (const app of hiredApps) {
      if (!app.createdAt || !app.hiredAt) continue;
      const diff = app.hiredAt.getTime() - app.createdAt.getTime();
      if (diff <= 0) continue;
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      const label = monthToLabel.get(app.hiredAt.getMonth());
      if (label && monthData.has(label)) {
        monthData.get(label)!.push(days);
      }
    }

    return monthLabels.map((month) => {
      const values = monthData.get(month) || [];
      return {
        month,
        days: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      };
    });
  }

  /**
   * Returns daily application counts for the last N days (default 14).
   * Each point: { date: "YYYY-MM-DD", count: number }
   */
  async getApplicationsOverTime(
    companyId: string,
    days = 14,
  ): Promise<{ date: string; count: number }[]> {
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(now.getDate() - (days - 1));
    rangeStart.setHours(0, 0, 0, 0);

    // Aggregate by day using groupBy on the date portion of createdAt.
    // Prisma doesn't support date truncation natively so we fetch the raw
    // createdAt values and bucket them in JS — safe for ≤14-day windows.
    const apps = await this.prisma.application.findMany({
      where: {
        companyId,
        deletedAt: null,
        createdAt: { gte: rangeStart },
        status: { notIn: [ApplicationStatus.ARCHIVED] },
      },
      select: { createdAt: true },
    });

    const dayCounts = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      dayCounts.set(d.toISOString().slice(0, 10), 0);
    }

    for (const app of apps) {
      const key = app.createdAt.toISOString().slice(0, 10);
      if (dayCounts.has(key)) {
        dayCounts.set(key, dayCounts.get(key)! + 1);
      }
    }

    return [...dayCounts.entries()].map(([date, count]) => ({ date, count }));
  }

  /**
   * Returns the most recent application audit events for a company, suitable
   * for the dashboard activity feed.
   */
  async getRecentActivity(
    companyId: string,
    limit = 20,
  ): Promise<
    {
      id: string;
      eventType: string;
      description: string;
      candidateId: string | null;
      candidateName: string | null;
      occurredAt: Date;
    }[]
  > {
    const events = await this.prisma.applicationAuditEvent.findMany({
      where: {
        companyId,
        // Only surface meaningful events for recruiters
        eventType: {
          in: [
            'APPLICATION_CREATED',
            'APPLICATION_SUBMITTED',
            'APPLICATION_STAGE_CHANGED',
            'APPLICATION_SHORTLISTED',
            'APPLICATION_REJECTED',
            'APPLICATION_HIRED',
            'APPLICATION_RESUME_UPLOADED',
            'COMPANY_CANDIDATE_CREATED',
          ] as any,
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        description: true,
        candidateId: true,
        occurredAt: true,
      },
    });

    // Resolve candidate display names for events that have a candidateId.
    const candidateIds = [...new Set(events.map((e) => e.candidateId).filter(Boolean) as string[])];
    const candidateNames = new Map<string, string>();
    if (candidateIds.length > 0) {
      const candidates = await this.prisma.candidate.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const c of candidates) {
        candidateNames.set(c.id, `${c.firstName} ${c.lastName}`.trim());
      }
    }

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      description: e.description,
      candidateId: e.candidateId,
      candidateName: e.candidateId ? (candidateNames.get(e.candidateId) ?? null) : null,
      occurredAt: e.occurredAt,
    }));
  }

  private async fetchHiredAppsWithValidCount(
    where: Prisma.ApplicationWhereInput,
  ): Promise<{ hiredApps: { createdAt: Date; hiredAt: Date | null }[]; validHiredCount: number }> {
    const hiredApps = await this.prisma.application.findMany({
      where: { ...where, status: ApplicationStatus.HIRED },
      select: { createdAt: true, hiredAt: true },
    });

    let validHiredCount = 0;
    for (const app of hiredApps) {
      if (app.createdAt && app.hiredAt && app.hiredAt.getTime() - app.createdAt.getTime() > 0) {
        validHiredCount++;
      }
    }

    return { hiredApps, validHiredCount };
  }
}
