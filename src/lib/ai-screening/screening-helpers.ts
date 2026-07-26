import { ApiErrorResponse } from '../api/client'
import type { AiScreeningResultDto, AiScreeningStatus } from '../api/ai-screening.api'
import type { ScreeningWorkflowState } from './screening-state'

export function workflowStateForStatus(status: AiScreeningStatus): ScreeningWorkflowState {
  switch (status) {
    case 'PENDING': return 'SCREENING_PENDING'
    case 'RUNNING': return 'SCREENING_RUNNING'
    case 'COMPLETED': return 'SCREENING_COMPLETED'
    case 'FAILED': return 'SCREENING_FAILED'
  }
}

export function screeningResultStateUpdate(result: AiScreeningResultDto) {
  if (result.status === 'COMPLETED') {
    return { workflowState: 'SCREENING_COMPLETED' as const, screeningResult: result }
  }
  if (result.status === 'FAILED') {
    return {
      workflowState: 'SCREENING_FAILED' as const,
      screeningResult: result,
      error: result.failureMessageSafe || 'Screening failed',
      errorCode: result.failureCode || 'SCREENING_FAILED',
    }
  }
  return {
    workflowState: workflowStateForStatus(result.status) as ScreeningWorkflowState,
    screeningResult: result,
  }
}

export function isRetryablePollingError(err: ApiErrorResponse | Error | null): boolean {
  if (!err) return true
  if (err instanceof ApiErrorResponse) {
    const code = err.statusCode
    return code === 429 || code === 408 || code >= 500
  }
  return true
}

export function isExpectedNoScreeningError(err: ApiErrorResponse): boolean {
  return err.statusCode === 404
}

export function isExtractionPendingError(err: ApiErrorResponse): boolean {
  return err.errorCode === 'RESUME_EXTRACTION_PENDING'
}

export function isExtractionFailedError(err: ApiErrorResponse): boolean {
  return err.errorCode === 'RESUME_EXTRACTION_FAILED'
}

export function classifyScreeningError(err: ApiErrorResponse | Error | null): {
  isRetryable: boolean
  isAbort: boolean
} {
  if (!err) return { isRetryable: true, isAbort: false }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return { isRetryable: false, isAbort: true }
  }

  if (err instanceof ApiErrorResponse) {
    const code = err.statusCode
    const retryable = code === 429 || code === 408 || code >= 500
    return { isRetryable: retryable, isAbort: false }
  }

  return { isRetryable: true, isAbort: false }
}

export const MAX_SELECTION_PAGE_SIZE = 50
export const POLLING_INTERVAL_MS = 2000
export const MAX_POLLING_DURATION_MS = 120_000
export const EXTRACTION_RETRY_INTERVAL_MS = 2000
export const MAX_EXTRACTION_WAIT_MS = 120_000
