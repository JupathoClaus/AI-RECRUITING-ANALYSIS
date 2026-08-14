import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AiScreeningResultDto } from '@/lib/api/ai-screening.api'
import type { StoredFileResponse } from '@/lib/api/files.api'

const MockApiError = vi.hoisted(
  () =>
    class MockApiError extends Error {
      statusCode: number
      errorCode: string
      errors: string[]
      constructor(statusCode: number, errorCode: string, message: string, errors: string[] = []) {
        super(message)
        this.name = 'ApiErrorResponse'
        this.statusCode = statusCode
        this.errorCode = errorCode
        this.errors = errors
      }
    },
)

const mockUploadResume = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<StoredFileResponse>>())
const mockRequestAiScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
const mockGetLatestAiScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<AiScreeningResultDto>>())
const mockGetAiScreeningById = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<AiScreeningResultDto>>())
const mockGetResumeExtractionStatus = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())

vi.mock('@/lib/api/client', () => ({
  ApiErrorResponse: MockApiError,
}))

vi.mock('@/lib/api/ai-screening.api', () => ({
  requestAiScreening: mockRequestAiScreening,
  getLatestAiScreening: mockGetLatestAiScreening,
  getAiScreeningById: mockGetAiScreeningById,
  getResumeExtractionStatus: mockGetResumeExtractionStatus,
}))

vi.mock('@/lib/api/files.api', () => ({
  uploadResume: mockUploadResume,
}))

import { useAiScreening } from '../use-ai-screening'

const APPLICATION_ID = 'app-1'
const SCREENING_ID = 'screen-1'

function storedFile(overrides?: Partial<StoredFileResponse>): StoredFileResponse {
  return {
    id: 'file-1',
    companyId: 'comp-1',
    applicationId: APPLICATION_ID,
    storageKey: 'key',
    originalName: 'resume.pdf',
    storedName: 'stored.pdf',
    extension: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    checksumSha256: 'abc123',
    category: 'RESUME',
    status: 'READY',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  }
}

function screeningResult(overrides?: Partial<AiScreeningResultDto>): AiScreeningResultDto {
  return {
    id: SCREENING_ID,
    applicationId: APPLICATION_ID,
    status: 'COMPLETED',
    recommendation: 'SHORTLIST',
    overallScore: 85,
    confidence: 'HIGH',
    matchedQualifications: ['React'],
    missingQualifications: [],
    evidence: [],
    criteriaScores: [],
    uncertainties: [],
    riskFlags: [],
    explanation: 'Good match',
    createdAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T01:00:00Z',
    ...overrides,
  }
}

function mockRequestResponse(statusCode: number, result: AiScreeningResultDto) {
  return {
    status: statusCode,
    data: { action: result.status === 'COMPLETED' ? 'REUSED' : 'CREATED', data: result },
  }
}

describe('useAiScreening', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts in IDLE with empty state', () => {
      const { result } = renderHook(() => useAiScreening())
      expect(result.current.state.workflowState).toBe('IDLE')
      expect(result.current.state.selectedApplicationId).toBeNull()
      expect(result.current.state.screeningResult).toBeNull()
      expect(result.current.state.screeningId).toBeNull()
      expect(result.current.state.extractionStatus).toBeNull()
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.errorCode).toBeNull()
      expect(result.current.state.uploadProgress).toBe(false)
      expect(result.current.state.uploadedFile).toBeNull()
    })
  })

  describe('render-loop regression', () => {
    it('returns a stable object identity across renders with unchanged state', () => {
      const { result, rerender } = renderHook(() => useAiScreening())
      const first = result.current
      rerender()
      const second = result.current
      expect(second).toBe(first)
      expect(second.selectApplication).toBe(first.selectApplication)
      expect(second.loadLatestScreening).toBe(first.loadLatestScreening)
    })

    it('does not change object identity when selectApplication is idempotent', () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      const afterFirstCall = result.current
      expect(afterFirstCall.state.workflowState).toBe('APPLICATION_SELECTED')
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      const afterSecondCall = result.current
      expect(afterSecondCall.state).toBe(afterFirstCall.state)
      expect(afterSecondCall).toBe(afterFirstCall)
    })

    it('does not enter an update loop on repeated identical setWorkflow invocations', () => {
      let renders = 0
      const { result } = renderHook(() => {
        renders++
        return useAiScreening()
      })
      act(() => {
        result.current.selectApplication('same-app')
      })
      const stable = result.current
      const baseline = renders
      for (let i = 0; i < 20; i++) {
        act(() => {
          result.current.selectApplication('same-app')
        })
        expect(result.current).toBe(stable)
      }
      expect(renders).toBeLessThanOrEqual(baseline + 1)
      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
      expect(result.current.state.selectedApplicationId).toBe('same-app')
    })
  })

  describe('selectApplication', () => {
    it('sets application and clears previous state', () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
      expect(result.current.state.selectedApplicationId).toBe(APPLICATION_ID)
      expect(result.current.state.screeningResult).toBeNull()
      expect(result.current.state.screeningId).toBeNull()
    })

    it('marks the selected application as missing a resume', () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      act(() => { result.current.markResumeMissing(APPLICATION_ID) })

      expect(result.current.state.workflowState).toBe('RESUME_MISSING')
    })

    it('ignores a missing-resume response from a stale application', () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      act(() => { result.current.markResumeMissing('different-application') })

      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
    })
  })

  describe('handleUploadResume', () => {
    it('transitions through UPLOADING_RESUME to RESUME_READY on success', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      const file = new File(['test'], 'resume.pdf', { type: 'application/pdf' })
      mockUploadResume.mockResolvedValue(storedFile())

      await act(async () => { await result.current.handleUploadResume(file) })

      expect(mockUploadResume).toHaveBeenCalledWith(APPLICATION_ID, file, expect.any(AbortSignal))
      expect(result.current.state.workflowState).toBe('RESUME_READY')
      expect(result.current.state.uploadProgress).toBe(false)
      expect(result.current.state.uploadedFile).not.toBeNull()
      expect(result.current.state.uploadedFile?.id).toBe('file-1')
    })

    it('handles upload error', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockUploadResume.mockRejectedValue(new MockApiError(500, 'UPLOAD_FAILED', 'Server error'))

      const res = await act(async () => result.current.handleUploadResume(new File([], 'x.pdf')))

      expect(res.ok).toBe(false)
      expect(res.error).toBe('Server error')
      expect(res.errorCode).toBe('UPLOAD_FAILED')
      expect(result.current.state.workflowState).toBe('ERROR')
      expect(result.current.state.error).toBe('Server error')
      expect(result.current.state.errorCode).toBe('UPLOAD_FAILED')
    })

    it('ignores stale response when application changes during upload', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      let resolveUpload!: (v: StoredFileResponse) => void
      mockUploadResume.mockReturnValue(new Promise(r => { resolveUpload = r }))

      let promise!: Promise<ReturnType<typeof result.current.handleUploadResume>>
      act(() => { promise = result.current.handleUploadResume(new File([], 'x.pdf')) as Promise<ReturnType<typeof result.current.handleUploadResume>> })

      act(() => { result.current.selectApplication('app-2') })
      act(() => { resolveUpload(storedFile()) })
      const res = await act(async () => await promise)

      expect(res.ok).toBe(false)
      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
      expect(result.current.state.selectedApplicationId).toBe('app-2')
      expect(result.current.state.uploadedFile).toBeNull()
    })

    it('returns to RESUME_MISSING on abort', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockUploadResume.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      const res = await act(async () => result.current.handleUploadResume(new File([], 'x.pdf')))

      expect(res.ok).toBe(false)
      expect(res.errorCode).toBe('CANCELLED')
      expect(result.current.state.workflowState).toBe('RESUME_MISSING')
    })

    it('does nothing when no application is selected', async () => {
      const { result } = renderHook(() => useAiScreening())
      mockUploadResume.mockResolvedValue(storedFile())

      const res = await act(async () => result.current.handleUploadResume(new File([], 'x.pdf')))

      expect(res.ok).toBe(false)
      expect(mockUploadResume).not.toHaveBeenCalled()
    })
  })

  describe('cancelUpload', () => {
    it('cancels upload and resets to RESUME_MISSING', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      let abortSignal!: AbortSignal
      mockUploadResume.mockImplementation((_appId: string, _file: File, signal?: AbortSignal) => {
        abortSignal = signal!
        return new Promise(() => {})
      })

      act(() => { result.current.handleUploadResume(new File([], 'x.pdf')) })
      expect(result.current.state.workflowState).toBe('UPLOADING_RESUME')

      act(() => { result.current.cancelUpload() })
      expect(abortSignal.aborted).toBe(true)
      expect(result.current.state.workflowState).toBe('RESUME_MISSING')
      expect(result.current.state.uploadProgress).toBe(false)
    })
  })

  describe('requestScreening', () => {
    it('transitions to SCREENING_COMPLETED when status is already COMPLETED', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(200, screeningResult({ status: 'COMPLETED' })),
      )

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
      expect(result.current.state.screeningId).toBe(SCREENING_ID)
    })

    it('transitions to SCREENING_FAILED when status is FAILED', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(200, screeningResult({
          status: 'FAILED',
          failureMessageSafe: 'Model error',
          failureCode: 'MODEL_ERR',
        })),
      )

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('SCREENING_FAILED')
      expect(result.current.state.error).toBe('Model error')
      expect(result.current.state.errorCode).toBe('MODEL_ERR')
    })

    it('starts polling when status is PENDING', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('SCREENING_PENDING')
      expect(result.current.state.screeningId).toBe(SCREENING_ID)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(mockGetAiScreeningById).toHaveBeenCalledWith(SCREENING_ID, expect.any(AbortSignal))
    })

    it('handles extraction pending error by waiting for extraction', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening
        .mockRejectedValueOnce(new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Extraction pending'))

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')
      expect(result.current.state.extractionStatus).toBe('PENDING')
    })

    it('handles extraction failed error', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValue(
        new MockApiError(409, 'RESUME_EXTRACTION_FAILED', 'Extraction failed'),
      )

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('EXTRACTION_FAILED')
      expect(result.current.state.errorCode).toBe('RESUME_EXTRACTION_FAILED')
    })

    it('handles generic error', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockRejectedValue(new MockApiError(400, 'BAD_REQUEST', 'Bad request'))

      await act(async () => { await result.current.requestScreening() })

      expect(result.current.state.workflowState).toBe('ERROR')
      expect(result.current.state.error).toBe('Bad request')
    })

    it('ignores stale response after application change', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      let resolveReq!: (v: unknown) => void
      mockRequestAiScreening.mockReturnValue(new Promise(r => { resolveReq = r }))

      let promise!: Promise<void>
      act(() => { promise = result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('REQUESTING_SCREENING')

      act(() => { result.current.selectApplication('app-2') })
      act(() => {
        resolveReq(mockRequestResponse(200, screeningResult({ status: 'COMPLETED' })))
      })
      await act(async () => { await promise })

      expect(result.current.state.selectedApplicationId).toBe('app-2')
      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
    })
  })

  describe('pollScreening', () => {
    it('updates to COMPLETED when poll returns COMPLETED', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('updates to FAILED when poll returns FAILED', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({
        status: 'FAILED',
        failureMessageSafe: 'Error',
        failureCode: 'ERR',
      }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('SCREENING_FAILED')
      expect(result.current.state.error).toBe('Error')
    })

    it('re-polls when still PENDING', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById
        .mockResolvedValueOnce(screeningResult({ status: 'PENDING' }))
        .mockResolvedValueOnce(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(1)
      expect(result.current.state.workflowState).toBe('SCREENING_PENDING')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('handles retryable polling errors (429)', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById
        .mockRejectedValueOnce(new MockApiError(429, 'RATE_LIMIT', 'Rate limited'))
        .mockResolvedValueOnce(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('stops polling on non-retryable error (403)', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockRejectedValue(new MockApiError(403, 'FORBIDDEN', 'Forbidden'))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('ERROR')
      expect(result.current.state.errorCode).toBe('FORBIDDEN')
    })

    it('re-polls after a transient AbortError instead of stopping', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById
        .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
        .mockResolvedValueOnce(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(1)
      expect(result.current.state.workflowState).toBe('SCREENING_PENDING')

      // The poll continues after the abort and reaches completion.
      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('ignores stale poll result if application changed', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )

      let resolvePoll!: (v: AiScreeningResultDto) => void
      mockGetAiScreeningById.mockReturnValue(new Promise(r => { resolvePoll = r }))

      await act(async () => { await result.current.requestScreening() })
      act(() => { vi.advanceTimersByTime(2000) })

      act(() => { result.current.selectApplication('app-2') })
      act(() => { resolvePoll(screeningResult({ status: 'COMPLETED' })) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.selectedApplicationId).toBe('app-2')
      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
    })
  })

  describe('timeout', () => {
    it('transitions to TIMED_OUT when MAX_POLLING_DURATION_MS elapses', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'PENDING' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(120000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('TIMED_OUT')
      expect(result.current.state.error).toContain('longer than expected')
    })
  })

  describe('waitForExtraction — CQRS polling (GET not POST)', () => {
    function extractionStatus(overrides?: Record<string, unknown>) {
      return {
        id: 'ext-1',
        status: 'PENDING',
        createdAt: '2025-01-01T00:00:00Z',
        ...overrides,
      }
    }

    it('polls GET getResumeExtractionStatus, not POST requestAiScreening, while waiting', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Extraction pending'),
      )
      mockGetResumeExtractionStatus
        .mockResolvedValue(extractionStatus({ status: 'PENDING' }))

      await act(async () => { await result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')
    })

    it('calls POST requestAiScreening exactly once when extraction completes', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening
        .mockRejectedValueOnce(new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'))
        .mockResolvedValueOnce(mockRequestResponse(200, screeningResult({ status: 'COMPLETED' })))
      mockGetResumeExtractionStatus
        .mockResolvedValue(extractionStatus({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('transitions to SCREENING_COMPLETED when extraction complete and screening reused', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening
        .mockRejectedValueOnce(new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'))
        .mockResolvedValueOnce(mockRequestResponse(200, screeningResult({ status: 'COMPLETED', overallScore: 92 })))
      mockGetResumeExtractionStatus
        .mockResolvedValue(extractionStatus({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
      expect(result.current.state.screeningResult?.overallScore).toBe(92)
    })

    it('keeps polling after a transient abort (does not hang at Reading resume)', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'),
      )
      mockGetResumeExtractionStatus
        .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
        .mockResolvedValueOnce(extractionStatus({ status: 'PENDING' }))
        .mockResolvedValueOnce(extractionStatus({ status: 'COMPLETED' }))
      mockRequestAiScreening.mockResolvedValueOnce(
        mockRequestResponse(200, screeningResult({ status: 'COMPLETED', overallScore: 80 })),
      )

      await act(async () => { await result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      // First poll aborts → the loop must continue instead of stopping.
      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      // Second poll still PENDING → re-poll.
      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(2)

      // Third poll COMPLETED → screening proceeds to completion.
      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(3)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
      expect(result.current.state.screeningResult?.overallScore).toBe(80)
    })

    it('shows EXTRACTION_FAILED without calling POST again', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'),
      )
      mockGetResumeExtractionStatus.mockResolvedValue(
        extractionStatus({ status: 'FAILED', failureCode: 'EXTRACTION_FAILED', failureMessageSafe: 'Could not parse PDF' }),
      )

      await act(async () => { await result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('EXTRACTION_FAILED')
      expect(result.current.state.error).toContain('Could not parse PDF')
      expect(result.current.state.errorCode).toBe('EXTRACTION_FAILED')
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)
    })

    it('shows PROCESSING status while worker is active', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'),
      )
      mockGetResumeExtractionStatus.mockResolvedValue(
        extractionStatus({ status: 'PROCESSING' }),
      )

      await act(async () => { await result.current.requestScreening() })
      expect(result.current.state.workflowState).toBe('WAITING_FOR_EXTRACTION')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(result.current.state.extractionStatus).toBe('PROCESSING')
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)
    })

    it('no repeated POST calls during multiple polling rounds', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening
        .mockRejectedValueOnce(new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'))
        .mockResolvedValueOnce(mockRequestResponse(200, screeningResult({ status: 'COMPLETED' })))
      mockGetResumeExtractionStatus
        .mockResolvedValueOnce(extractionStatus({ status: 'PENDING' }))
        .mockResolvedValueOnce(extractionStatus({ status: 'PENDING' }))
        .mockResolvedValueOnce(extractionStatus({ status: 'COMPLETED' }))

      await act(async () => { await result.current.requestScreening() })
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(2)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(3)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('timeout still works during extraction wait', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'),
      )
      mockGetResumeExtractionStatus.mockResolvedValue(extractionStatus({ status: 'PENDING' }))

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(120000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('TIMED_OUT')
      expect(result.current.state.error).toContain('timed out')
    })

    it('extraction PROCESSING then FAILED transitions to EXTRACTION_FAILED without POST', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })

      mockRequestAiScreening.mockRejectedValueOnce(
        new MockApiError(409, 'RESUME_EXTRACTION_PENDING', 'Pending'),
      )
      mockGetResumeExtractionStatus
        .mockResolvedValueOnce(extractionStatus({ status: 'PROCESSING' }))
        .mockResolvedValueOnce(extractionStatus({ status: 'FAILED', failureCode: 'EXTRACTION_FAILED' }))

      await act(async () => { await result.current.requestScreening() })
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(1)
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })
      expect(mockGetResumeExtractionStatus).toHaveBeenCalledTimes(2)
      expect(result.current.state.workflowState).toBe('EXTRACTION_FAILED')
      expect(mockRequestAiScreening).toHaveBeenCalledTimes(1)
    })
  })

  describe('loadLatestScreening', () => {
    it('sets COMPLETED when latest is completed', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockGetLatestAiScreening.mockResolvedValue(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.loadLatestScreening(APPLICATION_ID) })

      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
      expect(result.current.state.screeningId).toBe(SCREENING_ID)
    })

    it('starts polling when latest is PENDING', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockGetLatestAiScreening.mockResolvedValue(screeningResult({ status: 'PENDING' }))
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'COMPLETED' }))

      await act(async () => { await result.current.loadLatestScreening(APPLICATION_ID) })

      expect(result.current.state.workflowState).toBe('SCREENING_PENDING')

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })

    it('ignores 404 (no screening yet)', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockGetLatestAiScreening.mockRejectedValue(new MockApiError(404, 'NOT_FOUND', 'Not found'))

      await act(async () => { await result.current.loadLatestScreening(APPLICATION_ID) })

      expect(result.current.state.workflowState).toBe('APPLICATION_SELECTED')
    })

    it('handles other errors', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockGetLatestAiScreening.mockRejectedValue(new MockApiError(403, 'FORBIDDEN', 'Forbidden'))

      await act(async () => { await result.current.loadLatestScreening(APPLICATION_ID) })

      expect(result.current.state.workflowState).toBe('ERROR')
      expect(result.current.state.errorCode).toBe('FORBIDDEN')
    })
  })

  describe('retryScreening', () => {
    it('delegates to requestScreening', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(200, screeningResult({ status: 'COMPLETED' })),
      )

      await act(async () => { await result.current.retryScreening() })

      expect(mockRequestAiScreening).toHaveBeenCalled()
      expect(result.current.state.workflowState).toBe('SCREENING_COMPLETED')
    })
  })

  describe('unmount cleanup', () => {
    it('cancels timers and aborts controllers on unmount', () => {
      const { result, unmount } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'PENDING' }))

      act(() => { result.current.requestScreening() })

      unmount()

      act(() => { vi.advanceTimersByTime(2000) })

      expect(mockGetAiScreeningById).not.toHaveBeenCalled()
    })
  })

  describe('only-one-poll-at-a-time', () => {
    it('does not create duplicate polling requests', async () => {
      const { result } = renderHook(() => useAiScreening())
      act(() => { result.current.selectApplication(APPLICATION_ID) })
      mockRequestAiScreening.mockResolvedValue(
        mockRequestResponse(202, screeningResult({ status: 'PENDING' })),
      )
      mockGetAiScreeningById.mockResolvedValue(screeningResult({ status: 'PENDING' }))

      await act(async () => { await result.current.requestScreening() })

      await act(async () => { await result.current.requestScreening() })

      act(() => { vi.advanceTimersByTime(2000) })
      await act(async () => { await Promise.resolve() })

      expect(mockGetAiScreeningById).toHaveBeenCalledTimes(1)
    })
  })
})


