import { apiRequest } from "./client"

export interface OverviewResponse {
  totalApplications: number
  avgTimeToHire: number | null
  offerAcceptanceRate: number | null
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

export async function getAnalyticsOverview(dateFrom?: string): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>("/analytics/overview", {
    params: dateFrom ? { dateFrom } : undefined,
  })
}

export async function getAnalyticsFunnel(): Promise<FunnelStage[]> {
  return apiRequest<FunnelStage[]>("/analytics/funnel")
}

export async function getAnalyticsDepartments(): Promise<DeptPerformance[]> {
  return apiRequest<DeptPerformance[]>("/analytics/departments")
}

export async function getAnalyticsSources(): Promise<SourceItem[]> {
  return apiRequest<SourceItem[]>("/analytics/sources")
}

export async function getAnalyticsTimeToHire(): Promise<TimeToHirePoint[]> {
  return apiRequest<TimeToHirePoint[]>("/analytics/time-to-hire")
}
