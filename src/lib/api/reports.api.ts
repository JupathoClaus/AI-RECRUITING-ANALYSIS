import { apiRequest } from "./client"

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
  return apiRequest<{ data: JobSummaryRow[]; meta: ReportPaginationMeta }>("/reports/job-summary", { params })
}

export async function getActivity(params?: ReportParams) {
  return apiRequest<{ data: ActivityRow[]; meta: ReportPaginationMeta }>("/reports/activity", { params })
}

function buildExportQuery(params?: ReportParams): string {
  const sp = new URLSearchParams()
  if (params?.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params?.dateTo) sp.set('dateTo', params.dateTo)
  if (params?.jobIds) {
    const ids = Array.isArray(params.jobIds) ? params.jobIds : [params.jobIds]
    ids.forEach((id) => sp.append('jobIds', id))
  }
  if (params?.departmentIds) {
    const ids = Array.isArray(params.departmentIds) ? params.departmentIds : [params.departmentIds]
    ids.forEach((id) => sp.append('departmentIds', id))
  }
  if (params?.statuses) {
    const sts = Array.isArray(params.statuses) ? params.statuses : [params.statuses]
    sts.forEach((s) => sp.append('statuses', s))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

/** Download a report CSV through authenticated fetch matching apiRequest pattern. */
export async function downloadReportCsv(reportName: string, params?: ReportParams): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const url = `${baseUrl}/api/v1/reports/${reportName}/export${buildExportQuery(params)}`
  const { getAccessToken } = await import('./client')
  const token = getAccessToken()
  const headers: Record<string, string> = { Accept: 'text/csv' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { credentials: 'include', headers })
  if (!res.ok) {
    await res.text().catch(() => {})
    throw new Error(`Export failed (${res.status})`)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  const filename = match ? match[1] : `${reportName}.csv`

  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}
