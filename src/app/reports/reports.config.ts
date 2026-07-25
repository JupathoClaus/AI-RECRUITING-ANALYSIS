export const REPORT_DEFINITIONS = {
  "candidate-evaluation": { filters: { date: true, job: true, department: true, status: true }, paginated: true, exportable: true },
  "interview-summary": { filters: { date: true, job: true, department: true, status: false }, paginated: true, exportable: true },
  pipeline: { filters: { date: true, job: true, department: true, status: false }, paginated: false, exportable: true },
  "time-to-hire": { filters: { date: true, job: true, department: true, status: false }, paginated: true, exportable: true },
  "source-effectiveness": { filters: { date: true, job: true, department: true, status: false }, paginated: false, exportable: true },
  "job-summary": { filters: { date: true, job: true, department: true, status: false }, paginated: true, exportable: true },
  activity: { filters: { date: true, job: false, department: false, status: false }, paginated: true, exportable: true },
  diversity: { filters: { date: false, job: false, department: false, status: false }, paginated: false, exportable: false },
} as const

export type ReportId = keyof typeof REPORT_DEFINITIONS

export interface AppliedFilters {
  dateFrom: string
  dateTo: string
  jobId: string
  departmentId: string
  statuses: string[]
}

export function buildReportParams(reportId: ReportId, filters: AppliedFilters, page: number): Record<string, string | number | string[]> {
  const cfg = REPORT_DEFINITIONS[reportId].filters
  const params: Record<string, string | number | string[]> = { page, limit: 50 }

  if (cfg.date && filters.dateFrom) params.dateFrom = filters.dateFrom
  if (cfg.date && filters.dateTo) params.dateTo = filters.dateTo
  if (cfg.job && filters.jobId) params.jobIds = filters.jobId
  if (cfg.department && filters.departmentId) params.departmentIds = filters.departmentId
  if (cfg.status && filters.statuses.length > 0) params.statuses = filters.statuses

  return params
}
