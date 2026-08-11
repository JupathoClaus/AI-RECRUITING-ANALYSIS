import { describe, it, expect } from 'vitest'
import {
  workflowStateForStatus,
  screeningResultStateUpdate,
  isRetryablePollingError,
  isExpectedNoScreeningError,
  isExtractionPendingError,
  isExtractionFailedError,
  classifyScreeningError,
} from '../screening-helpers'
import { ApiErrorResponse } from '@/lib/api/client'

describe('workflowStateForStatus', () => {
  it('PENDING → SCREENING_PENDING', () => expect(workflowStateForStatus('PENDING')).toBe('SCREENING_PENDING'))
  it('RUNNING → SCREENING_RUNNING', () => expect(workflowStateForStatus('RUNNING')).toBe('SCREENING_RUNNING'))
  it('COMPLETED → SCREENING_COMPLETED', () => expect(workflowStateForStatus('COMPLETED')).toBe('SCREENING_COMPLETED'))
  it('FAILED → SCREENING_FAILED', () => expect(workflowStateForStatus('FAILED')).toBe('SCREENING_FAILED'))
})

describe('screeningResultStateUpdate', () => {
  it('COMPLETED returns completed state', () => {
    const r = screeningResultStateUpdate({ status: 'COMPLETED', id: 's1' } as any)
    expect(r.workflowState).toBe('SCREENING_COMPLETED')
    expect((r as any).screeningResult).toBeDefined()
  })

  it('FAILED returns failed state with safe message', () => {
    const r = screeningResultStateUpdate({ status: 'FAILED', id: 's2', failureMessageSafe: 'Error', failureCode: 'ERR' } as any)
    expect(r.workflowState).toBe('SCREENING_FAILED')
    expect((r as any).error).toBe('Error')
    expect((r as any).errorCode).toBe('ERR')
  })

  it('PENDING returns pending state', () => {
    const r = screeningResultStateUpdate({ status: 'PENDING', id: 's3' } as any)
    expect(r.workflowState).toBe('SCREENING_PENDING')
  })
})

describe('isRetryablePollingError', () => {
  it('429 is retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(429, 'RATE_LIMIT', ''))).toBe(true))
  it('500 is retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(500, 'SERVER', ''))).toBe(true))
  it('503 is retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(503, 'UNAVAILABLE', ''))).toBe(true))
  it('403 is not retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(403, 'FORBIDDEN', ''))).toBe(false))
  it('404 is not retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(404, 'NOT_FOUND', ''))).toBe(false))
  it('400 is not retryable', () => expect(isRetryablePollingError(new ApiErrorResponse(400, 'BAD', ''))).toBe(false))
  it('null (network error) is retryable', () => expect(isRetryablePollingError(null)).toBe(true))
  it('unknown Error is retryable', () => expect(isRetryablePollingError(new Error('network'))).toBe(true))
})

describe('isExpectedNoScreeningError', () => {
  it('404 returns true', () => expect(isExpectedNoScreeningError(new ApiErrorResponse(404, 'NOT_FOUND', ''))).toBe(true))
  it('403 returns false', () => expect(isExpectedNoScreeningError(new ApiErrorResponse(403, 'FORBIDDEN', ''))).toBe(false))
})

describe('isExtractionPendingError', () => {
  it('matches exact code', () => expect(isExtractionPendingError(new ApiErrorResponse(409, 'RESUME_EXTRACTION_PENDING', ''))).toBe(true))
  it('does not match generic conflict', () => expect(isExtractionPendingError(new ApiErrorResponse(409, 'CONFLICT', ''))).toBe(false))
})

describe('isExtractionFailedError', () => {
  it('matches exact code', () => expect(isExtractionFailedError(new ApiErrorResponse(409, 'RESUME_EXTRACTION_FAILED', ''))).toBe(true))
  it('does not match pending', () => expect(isExtractionFailedError(new ApiErrorResponse(409, 'RESUME_EXTRACTION_PENDING', ''))).toBe(false))
})

describe('classifyScreeningError', () => {
  it('AbortError is abort, not retryable', () => {
    const r = classifyScreeningError(new DOMException('Aborted', 'AbortError'))
    expect(r.isAbort).toBe(true)
    expect(r.isRetryable).toBe(false)
  })
  it('429 is retryable', () => expect(classifyScreeningError(new ApiErrorResponse(429, '', '')).isRetryable).toBe(true))
  it('500 is retryable', () => expect(classifyScreeningError(new ApiErrorResponse(500, '', '')).isRetryable).toBe(true))
  it('403 is not retryable', () => expect(classifyScreeningError(new ApiErrorResponse(403, '', '')).isRetryable).toBe(false))
  it('null is retryable', () => expect(classifyScreeningError(null).isRetryable).toBe(true))
})
