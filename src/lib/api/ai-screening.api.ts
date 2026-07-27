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

export async function getAiScreeningById(
  screeningId: string,
  signal?: AbortSignal,
): Promise<AiScreeningResultDto> {
  return apiRequest<AiScreeningResultDto>(
    `/ai-screenings/${screeningId}`,
    { signal },
  )
}
