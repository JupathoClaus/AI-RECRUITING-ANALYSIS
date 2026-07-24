import { apiRequest } from "./client"

export interface OverviewResponse {
  totalApplications: number
  avgTimeToHire: number | null
  selectionRate: number | null
  aiScreeningAccuracy: null
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface DeptPerformance {
  dept: string
  open: number
  applications: number
  avgScore: number | null
  timeToHire: number | null
}

export interface SourceItem {
  name: string
  value: number
}

export interface TimeToHirePoint {
  month: string
  days: number
}

function dateParams(dateFrom?: string, dateTo?: string): Record<string, string> | undefined {
  const params: Record<string, string> = {}
  if (dateFrom) params.dateFrom = dateFrom
  if (dateTo) params.dateTo = dateTo
  return Object.keys(params).length > 0 ? params : undefined
}

export async function getAnalyticsOverview(dateFrom?: string, dateTo?: string): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>("/analytics/overview", {
    params: dateParams(dateFrom, dateTo),
  })
}

export async function getAnalyticsFunnel(dateFrom?: string, dateTo?: string): Promise<FunnelStage[]> {
  return apiRequest<FunnelStage[]>("/analytics/funnel", {
    params: dateParams(dateFrom, dateTo),
  })
}

export async function getAnalyticsDepartments(dateFrom?: string, dateTo?: string): Promise<DeptPerformance[]> {
  return apiRequest<DeptPerformance[]>("/analytics/departments", {
    params: dateParams(dateFrom, dateTo),
  })
}

export async function getAnalyticsSources(dateFrom?: string, dateTo?: string): Promise<SourceItem[]> {
  return apiRequest<SourceItem[]>("/analytics/sources", {
    params: dateParams(dateFrom, dateTo),
  })
}

export async function getAnalyticsTimeToHire(dateFrom?: string, dateTo?: string): Promise<TimeToHirePoint[]> {
  return apiRequest<TimeToHirePoint[]>("/analytics/time-to-hire", {
    params: dateParams(dateFrom, dateTo),
  })
}
