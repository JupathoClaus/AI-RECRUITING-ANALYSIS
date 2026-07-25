import { apiRequest, BlobResponse } from "./client"

export interface CandidateEvaluationRow {
  applicationId: string
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

export interface PipelineStageMetric { stage: string; count: number }
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
  applicationsInterviewed: number
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

export interface ReportExportResult {
  filename: string
  truncated: boolean
  totalCount: number | null
  returnedCount: number | null
}

export async function getCandidateEvaluation(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<{ data: CandidateEvaluationRow[]; meta: ReportPaginationMeta }>("/reports/candidate-evaluation", { params, signal })
}

export async function getInterviewSummary(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<{ data: InterviewSummaryRow[]; meta: ReportPaginationMeta }>("/reports/interview-summary", { params, signal })
}

export async function getPipeline(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<PipelineReport>("/reports/pipeline", { params, signal })
}

export async function getTimeToHire(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<{ data: TimeToHireRow[]; meta: ReportPaginationMeta }>("/reports/time-to-hire", { params, signal })
}

export async function getSourceEffectiveness(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<SourceEffectivenessRow[]>("/reports/source-effectiveness", { params, signal })
}

export async function getJobSummary(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<{ data: JobSummaryRow[]; meta: ReportPaginationMeta }>("/reports/job-summary", { params, signal })
}

export async function getActivity(params?: ReportParams, signal?: AbortSignal) {
  return apiRequest<{ data: ActivityRow[]; meta: ReportPaginationMeta }>("/reports/activity", { params, signal })
}

/** Download a report CSV through the shared authenticated API client. */
export async function downloadReportCsv(reportName: string, params?: ReportParams, signal?: AbortSignal): Promise<ReportExportResult> {
  const searchParams = new URLSearchParams()
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params?.jobIds) {
    const ids = Array.isArray(params.jobIds) ? params.jobIds : [params.jobIds]
    ids.forEach((id) => searchParams.append('jobIds', id))
  }
  if (params?.departmentIds) {
    const ids = Array.isArray(params.departmentIds) ? params.departmentIds : [params.departmentIds]
    ids.forEach((id) => searchParams.append('departmentIds', id))
  }
  if (params?.statuses) {
    const sts = Array.isArray(params.statuses) ? params.statuses : [params.statuses]
    sts.forEach((s) => searchParams.append('statuses', s))
  }
  const qs = searchParams.toString()
  const path = `/reports/${reportName}/export${qs ? `?${qs}` : ''}`

  const result = await apiRequest<BlobResponse>(path, { responseType: 'blob', signal })

  const disposition = result.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  const filename = match ? match[1] : `${reportName}.csv`

  const truncated = result.headers.get('X-Export-Truncated') === 'true'
  const totalCount = parseInt(result.headers.get('X-Export-Total-Count') || '', 10) || null
  const returnedCount = parseInt(result.headers.get('X-Export-Returned-Count') || '', 10) || null

  const objectUrl = URL.createObjectURL(result.blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)

  return { filename, truncated, totalCount, returnedCount }
}
