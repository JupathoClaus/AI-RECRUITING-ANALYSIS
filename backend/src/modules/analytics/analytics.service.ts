import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus } from '@prisma/client';

const funnelStageOrder = ['Applied', 'Screened', 'Interviewed', 'Offered', 'Hired'] as const;

const funnelStages: ApplicationStatus[][] = [
  ['SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'ON_HOLD'],
  ['UNDER_REVIEW', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED'],
  ['INTERVIEW', 'OFFER', 'HIRED'],
  ['OFFER', 'HIRED'],
  ['HIRED'],
] as unknown as ApplicationStatus[][];

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(companyId: string, dateFrom?: string) {
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (dateFrom) where.createdAt = { gte: new Date(dateFrom) };

    const totalApplications = await this.prisma.application.count({ where: where as never });

    const hiredApps = await this.prisma.application.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'HIRED',
        hiredAt: { not: null },
        createdAt: { not: null },
      } as never,
      select: { createdAt: true, hiredAt: true },
    });

    let avgTimeToHire: number | null = null;
    if (hiredApps.length > 0) {
      const totalDays = hiredApps.reduce((sum, app) => {
        if (!app.createdAt || !app.hiredAt) return sum;
        return sum + Math.round((app.hiredAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      avgTimeToHire = Math.round(totalDays / hiredApps.length);
    }

    const hiredCount = await this.prisma.application.count({
      where: { companyId, deletedAt: null, status: 'HIRED' } as never,
    });
    const offeredCount = await this.prisma.application.count({
      where: { companyId, deletedAt: null, status: 'OFFER' } as never,
    });
    const rejectedCount = await this.prisma.application.count({
      where: { companyId, deletedAt: null, status: 'REJECTED' } as never,
    });

    const acceptedOrOffered = hiredCount + offeredCount;
    const totalDecided = acceptedOrOffered + rejectedCount;

    const offerAcceptanceRate = totalDecided > 0 ? Math.round((acceptedOrOffered / totalDecided) * 100) : null;

    return {
      totalApplications,
      avgTimeToHire,
      offerAcceptanceRate,
      aiScreeningAccuracy: null,
    };
  }

  async getFunnel(companyId: string) {
    const counts = await this.prisma.application.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        status: { notIn: ['DRAFT', 'ARCHIVED'] as ApplicationStatus[] },
      },
      _count: { id: true },
    });

    const statusMap = new Map(counts.map((r) => [r.status, r._count.id]));
    const funnel = funnelStages.map((statuses, i) => ({
      stage: funnelStageOrder[i],
      count: statuses.reduce((sum, s) => sum + (statusMap.get(s) || 0), 0),
    }));

    return funnel;
  }

  async getDepartments(companyId: string) {
    const depts = await this.prisma.department.findMany({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    const jobs = await this.prisma.job.findMany({
      where: { companyId, deletedAt: null, departmentId: { not: null } } as never,
      select: { id: true, departmentId: true, numberOfOpenings: true },
    });

    const appsByDept = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: { companyId, deletedAt: null, job: { departmentId: { not: null } } } as never,
      _count: { id: true },
    });

    const jobDeptMap = new Map<string, string>();
    const deptOpenings = new Map<string, number>();
    const deptApps = new Map<string, number>();

    for (const job of jobs) {
      if (job.departmentId) {
        jobDeptMap.set(job.id, job.departmentId);
        deptOpenings.set(job.departmentId, (deptOpenings.get(job.departmentId) || 0) + job.numberOfOpenings);
      }
    }

    for (const app of appsByDept) {
      const deptId = jobDeptMap.get(app.jobId);
      if (deptId) {
        deptApps.set(deptId, (deptApps.get(deptId) || 0) + app._count.id);
      }
    }

    return depts.map((dept) => ({
      dept: dept.name,
      open: deptOpenings.get(dept.id) || 0,
      applications: deptApps.get(dept.id) || 0,
      avgScore: null as number | null,
      timeToHire: null as number | null,
    }));
  }

  async getSources(companyId: string) {
    const [appSources, candSources] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['source'],
        where: { companyId, deletedAt: null, source: { not: null } } as never,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.companyCandidate.groupBy({
        by: ['source'],
        where: { companyId, deletedAt: null, source: { not: null } } as never,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    const merged = new Map<string, number>();
    for (const r of appSources) {
      merged.set(r.source, (merged.get(r.source) || 0) + (r._count as never as { id: number }).id);
    }
    for (const r of candSources) {
      merged.set(r.source, (merged.get(r.source) || 0) + (r._count as never as { id: number }).id);
    }

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

    return Array.from(merged.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([source, value]) => ({
        name: sourceLabels[source] || source,
        value,
      }));
  }

  async getTimeToHireTrend(companyId: string) {
    const sixMonthsAgo = monthsAgo(6);

    const hiredApps = await this.prisma.application.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'HIRED',
        hiredAt: { not: null, gte: sixMonthsAgo },
        createdAt: { not: null },
      } as never,
      select: { createdAt: true, hiredAt: true },
    });

    const monthLabels = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    const monthData = new Map<string, number[]>();
    for (const label of monthLabels) monthData.set(label, []);

    for (const app of hiredApps) {
      if (!app.createdAt || !app.hiredAt) continue;
      const days = Math.round((app.hiredAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const monthIdx = app.hiredAt.getMonth();
      const label = monthLabels[monthIdx >= 1 && monthIdx <= 6 ? monthIdx - 1 : monthIdx - 7 + 12];
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
}
