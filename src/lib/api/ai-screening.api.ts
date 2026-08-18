import { apiRequest, StatusResponse } from './client'

export type AiScreeningStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface ScreeningCriterionScore {
  criterion: string
  score: number
  maximumScore: number
  weight: number
  explanation: string
}

export interface ScreeningEvidence {
  criterion: string
  sourceCategory: string
  sourceText: string
  assessment: string
  score?: number
  weight?: number
  isRequired?: boolean
}

export interface AiScreeningResultDto {
  id: string
  applicationId: string
  status: AiScreeningStatus
  recommendation?: string
  overallScore?: number
  confidence?: string
  matchedQualifications?: string[]
  missingQualifications?: string[]
  evidence?: ScreeningEvidence[]
  criteriaScores?: ScreeningCriterionScore[]
  uncertainties?: string[]
  riskFlags?: string[]
  explanation?: string
  prohibitedReasoningDetected?: boolean
  provider?: string
  model?: string
  promptVersion?: string
  failureCode?: string
  failureMessageSafe?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export interface ScreeningListResponse {
  data: AiScreeningResultDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ScreeningRequestResponse {
  action: 'CREATED' | 'REUSED'
  data: AiScreeningResultDto
}

export interface RequestAiScreeningOptions {
  forceRerun?: boolean
  signal?: AbortSignal
}

export async function requestAiScreening(
  applicationId: string,
  options?: RequestAiScreeningOptions,
): Promise<StatusResponse<ScreeningRequestResponse>> {
  const raw = await apiRequest<{
    data: { statusCode: number; message: string; data: ScreeningRequestResponse }
    status: number
    headers: Headers
  }>(
    `/applications/${applicationId}/ai-screenings`,
    {
      method: 'POST',
      body: { forceRerun: options?.forceRerun ?? false },
      statusInBody: true,
      signal: options?.signal,
    },
  );
  return { data: raw.data.data, status: raw.status, headers: raw.headers }
}

export async function listAiScreenings(
  applicationId: string,
  params?: { page?: number; limit?: number },
): Promise<ScreeningListResponse> {
  return apiRequest<ScreeningListResponse>(
    `/applications/${applicationId}/ai-screenings`,
    { params: params as Record<string, string | number | undefined> },
  )
}

export async function getLatestAiScreening(
  applicationId: string,
  signal?: AbortSignal,
): Promise<AiScreeningResultDto> {
  return apiRequest<AiScreeningResultDto>(
    `/applications/${applicationId}/ai-screenings/latest`,
    { signal },
  )
}

export async function retryAiScreeningExtraction(
  applicationId: string,
  signal?: AbortSignal,
): Promise<{ extraction: { id: string; status: string } }> {
  return apiRequest<{ extraction: { id: string; status: string } }>(
    `/applications/${applicationId}/ai-screenings/retry-extraction`,
    { method: 'POST', signal },
  )
}

export type ExtractionStatusValue = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface ExtractionStatusResponse {
  id: string
  status: ExtractionStatusValue
  failureCode?: string
  failureMessageSafe?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export async function getResumeExtractionStatus(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ExtractionStatusResponse> {
  return apiRequest<ExtractionStatusResponse>(
    `/applications/${applicationId}/resume-extraction`,
    { signal },
  )
}

export async function getAiScreeningById(
  screeningId: string,
  signal?: AbortSignal,
): Promise<AiScreeningResultDto> {
  return apiRequest<AiScreeningResultDto>(
    `/ai-screenings/${screeningId}`,
    { signal },
  )
}

// ─── Bulk Screening ──────────────────────────────────────────────────────────

export type BulkScreeningMode =
  | 'SELECTED'
  | 'ALL_FOR_JOB'
  | 'UNSCREENED_FOR_JOB'
  | 'ALL_UNSCREENED_OPEN_JOBS'

export interface BulkScreeningRequest {
  mode: BulkScreeningMode
  applicationIds?: string[]
  jobId?: string
}

export interface BulkScreeningResponse {
  batchId: string
  status: string
  total: number
  queued: number
  reused: number
  skipped: number
  errors: number
}

export interface BulkBatchProgress {
  batchId: string
  status: string
  mode: string
  total: number
  completed: number
  failed: number
  skipped: number
  pending: number
  recommended: number
  humanReview: number
  notRecommended: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export async function startBulkScreening(
  request: BulkScreeningRequest,
): Promise<BulkScreeningResponse> {
  return apiRequest<BulkScreeningResponse>('/ai-screenings/bulk', {
    method: 'POST',
    body: request,
  })
}

export async function getBulkScreeningProgress(
  batchId: string,
): Promise<BulkBatchProgress> {
  return apiRequest<BulkBatchProgress>(`/ai-screenings/batches/${batchId}`)
}

export async function getRecentBulkScreening(): Promise<BulkBatchProgress | null> {
  return apiRequest<BulkBatchProgress | null>('/ai-screenings/batches/recent')
}
