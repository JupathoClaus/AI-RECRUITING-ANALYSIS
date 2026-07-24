import { BadRequestException } from '@nestjs/common';
import { ReportFilterDto } from '../dto/report-filter.dto';

export interface DateRange {
  gte?: Date;
  lt?: Date;
}

/**
 * Validates dateFrom <= dateTo using strict half-open semantics.
 * Throws BadRequestException on invalid range.
 */
export function validateDateRange(dateFrom: string | undefined, dateTo: string | undefined): void {
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new BadRequestException('dateFrom must not be after dateTo');
  }
}

/**
 * Converts dateFrom/dateTo strings to a half-open DateRange.
 *
 * Semantics:
 *   gte = start of dateFrom day (00:00:00.000 UTC)
 *   lt  = start of dateTo+1 day (00:00:00.000 UTC)
 *
 * A user selecting 2026-07-24 → 2026-07-24 gets records from
 * 2026-07-24T00:00:00Z inclusive to 2026-07-25T00:00:00Z exclusive.
 */
export function toDateRange(dateFrom: string | undefined, dateTo: string | undefined): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const range: DateRange = {};
  if (dateFrom) range.gte = new Date(dateFrom);
  if (dateTo) range.lt = new Date(new Date(dateTo).getTime() + 86400000);
  return range;
}

/**
 * Returns a deep copy of filter values for export (page=1, limit=5000).
 * Arrays are cloned to prevent reference sharing.
 */
export function createExportFilter(filter: Readonly<ReportFilterDto>): ReportFilterDto {
  const copy = new ReportFilterDto();
  copy.dateFrom = filter.dateFrom;
  copy.dateTo = filter.dateTo;
  copy.jobIds = filter.jobIds ? [...filter.jobIds] : undefined;
  copy.departmentIds = filter.departmentIds ? [...filter.departmentIds] : undefined;
  copy.statuses = filter.statuses ? [...filter.statuses] : undefined;
  copy.page = 1;
  copy.limit = 5000;
  return copy;
}

/** Rejected outcomes used consistently across Pipeline, Source Effectiveness, Job Summary. */
export const REJECTED_OUTCOMES = new Set(['REJECTED', 'WITHDRAWN', 'DISQUALIFIED']);
export const TERMINAL_STATUSES = new Set(['HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED']);

export function isRejected(status: string): boolean {
  return REJECTED_OUTCOMES.has(status);
}

export function isActive(status: string): boolean {
  return !['DRAFT', 'ARCHIVED', 'HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED'].includes(status);
}
