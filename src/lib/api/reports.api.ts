import { apiRequest } from "./client"

export interface CandidateEvaluationRow {
  applicantionId: string
  candidateId: string
  candidateName: string
  email: string
  jobTitle: string
  jobDepartment: string | null
  applicationStatus: string
  source: string
  submittedAt: string | null
  interviewStatus: string | null
  interviewResult: string | null
  rejectionReason: string | null
}

export interface InterviewSummaryRow {
  interviewId: string
  candidateName: string
  jobTitle: string
  interviewType: string
  status: string
  result: string | null
  scheduledAt: string
  completedAt: string | null
  durationMinutes: number | null
  interviewerName: string | null
}

export interface PipelineStageMetric {
  stage: string
  count: number
}

export interface PipelineReport {
  stages: PipelineStageMetric[]
  totalApplications: number
  hiredCount: number
  rejectedCount: number
  activeCount: number
}

export interface TimeToHireRow {
  applicationId: string
  candidateName: string
  jobTitle: string
  submittedAt: string
  hiredAt: string | null
  daysToHire: number | null
  department: string | null
}

export interface SourceEffectivenessRow {
  source: string
  applicationCount: number
  interviewedCount: number
  hiredCount: number
  rejectedCount: number
}

export interface JobSummaryRow {
  jobId: string
  title: string
  department: string | null
  status: string
  applicationCount: number
  interviewCount: number
  hiredCount: number
  rejectedCount: number
  activeApplicationCount: number
}

export interface ActivityRow {
  occurredAt: string
  eventType: string
  entityType: string
  description: string
  actorType: string | null
  actorName: string | null
}

export interface ReportPaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ReportParams {
  dateFrom?: string
  dateTo?: string
  jobIds?: string | string[]
  departmentIds?: string | string[]
  statuses?: string | string[]
  page?: number
  limit?: number
  [key: string]: string | number | string[] | undefined
}

export async function getCandidateEvaluation(params?: ReportParams) {
  return apiRequest<{ data: CandidateEvaluationRow[]; meta: ReportPaginationMeta }>("/reports/candidate-evaluation", { params })
}

export async function getInterviewSummary(params?: ReportParams) {
  return apiRequest<{ data: InterviewSummaryRow[]; meta: ReportPaginationMeta }>("/reports/interview-summary", { params })
}

export async function getPipeline(params?: ReportParams) {
  return apiRequest<PipelineReport>("/reports/pipeline", { params })
}

export async function getTimeToHire(params?: ReportParams) {
  return apiRequest<{ data: TimeToHireRow[]; meta: ReportPaginationMeta }>("/reports/time-to-hire", { params })
}

export async function getSourceEffectiveness(params?: ReportParams) {
  return apiRequest<SourceEffectivenessRow[]>("/reports/source-effectiveness", { params })
}

export async function getJobSummary(params?: ReportParams) {
  return apiRequest<JobSummaryRow[]>("/reports/job-summary", { params })
}

export async function getActivity(params?: ReportParams) {
  return apiRequest<{ data: ActivityRow[]; meta: ReportPaginationMeta }>("/reports/activity", { params })
}

function toArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  if (value) return [value]
  return []
}

export function getExportUrl(reportName: string, params?: ReportParams): string {
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/reports/${reportName}/export`
  if (!params) return baseUrl
  const searchParams = new URLSearchParams()
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params.dateTo) searchParams.set('dateTo', params.dateTo)
  for (const id of toArray(params.jobIds)) searchParams.append('jobIds', id)
  for (const id of toArray(params.departmentIds)) searchParams.append('departmentIds', id)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
}
