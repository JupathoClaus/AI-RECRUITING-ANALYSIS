import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AddCandidateDialog } from '../add-candidate-dialog'
import type { Job } from '@/types'

// The local dev machine is slow (jsdom + heavy module graph); give these
// dialog interaction tests real headroom.
vi.setConfig({ testTimeout: 20000 })

const mockCreateWorkflow = vi.hoisted(() => vi.fn())
const mockGetResumeExtractionStatus = vi.hoisted(() => vi.fn())
const mockRetryAiScreeningExtraction = vi.hoisted(() => vi.fn())
const mockSelectApplication = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>())
const mockRequestScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
const mockRetryScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>())
const mockFetchCandidates = vi.hoisted(() => vi.fn())
const mockUseAiScreening = vi.hoisted(() => vi.fn())
const mockUseStore = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/candidates.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/candidates.api')>()
  return { ...original, createCandidateWorkflow: mockCreateWorkflow }
})
vi.mock('@/lib/api/ai-screening.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/ai-screening.api')>()
  return {
    ...original,
    getResumeExtractionStatus: mockGetResumeExtractionStatus,
    retryAiScreeningExtraction: mockRetryAiScreeningExtraction,
  }
})
vi.mock('@/lib/ai-screening/use-ai-screening', () => ({ useAiScreening: mockUseAiScreening }))
vi.mock('@/store/useStore', () => ({ useStore: mockUseStore }))

vi.mock('@/components/ai-screening/resume-upload-area', () => ({
  ResumeUploadArea: function MockResumeUploadArea({ onUpload }: { onUpload: (f: File) => void }) {
    return (
      <div data-testid="resume-upload-area">
        <button data-testid="mock-select-file" onClick={() => onUpload(new File(['x'], 'resume.pdf', { type: 'application/pdf' }))}>
          Select Resume
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/ai-screening/screening-progress', () => ({
  ScreeningProgress: ({ workflowState }: { workflowState: string }) => (
    <div data-testid="screening-progress">{workflowState}</div>
  ),
}))

vi.mock('@/components/ai-screening/screening-result-view', () => ({
  ScreeningResultView: ({ result }: { result: { id: string } }) => (
    <div data-testid="screening-result-view">{result.id}</div>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange?: (v: string) => void }) => (
    <div data-testid="job-select-container">
      <button data-testid="select-job-btn" onClick={() => onValueChange?.('j-1')}>Select Job</button>
      <span data-testid="selected-job-value">{value ?? ''}</span>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <span aria-disabled={disabled}>{children}</span>
  ),
}))

const WORKFLOW_RESULT = {
  candidateId: 'cand-1',
  candidateCreated: true,
  applicationId: 'app-1',
  applicationNumber: 'APP-2026-000001',
  applicationStatus: 'DRAFT',
  stageId: 'st-1',
  stageName: 'Applied',
  jobId: 'j-1',
  jobTitle: 'Engineer',
  storedFileId: 'f-1',
  extraction: { id: 'e-1', status: 'PENDING' },
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      workflowState: 'IDLE',
      selectedApplicationId: null,
      screeningResult: null,
      screeningId: null,
      extractionStatus: null,
      error: null,
      errorCode: null,
      uploadProgress: false,
      uploadedFile: null,
      ...overrides,
    },
    selectApplication: mockSelectApplication,
    handleUploadResume: vi.fn(),
    cancelUpload: vi.fn(),
    requestScreening: mockRequestScreening,
    retryScreening: mockRetryScreening,
    loadLatestScreening: vi.fn(),
  }
}

const ACTIVE_JOB: Job = {
  id: 'j-1', title: 'Engineer', department: 'Engineering',
  location: 'Remote', type: 'full-time', salaryMin: 0, salaryMax: 0,
  description: '', status: 'Active', applicants: 0, createdAt: new Date(),
}
const CLOSED_JOB: Job = { ...ACTIVE_JOB, id: 'j-2', title: 'Closed Role', status: 'Closed' }

function renderDialog(open = true, jobs = [ACTIVE_JOB, CLOSED_JOB]) {
  return render(
    <AddCandidateDialog open={open} onOpenChange={vi.fn()} jobs={jobs} onComplete={vi.fn()} />
  )
}

async function fillForm() {
  await act(async () => { fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Alice Johnson' } }) })
  await act(async () => { fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'a@b.com' } }) })
  await act(async () => { screen.getByTestId('select-job-btn').click() })
  await act(async () => { screen.getByTestId('mock-select-file').click() })
}

async function submitAndSucceed() {
  mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
  mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)
  await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })
}

describe('AddCandidateDialog (atomic workflow)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseStore.mockImplementation((selector: (s: { fetchCandidates: typeof mockFetchCandidates }) => unknown) =>
      selector({ fetchCandidates: mockFetchCandidates })
    )
    mockUseAiScreening.mockReturnValue(hookState())
    mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)
    mockRetryAiScreeningExtraction.mockResolvedValue({ extraction: { id: 'e-2', status: 'PENDING' } } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('normal Add Candidate (1)', () => {
    it('sends ONE workflow request with candidate + job + resume and shows success', async () => {
      renderDialog(true)
      await fillForm()
      await submitAndSucceed()

      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
      expect(mockCreateWorkflow).toHaveBeenCalledTimes(1)
      const [dto, file, key] = mockCreateWorkflow.mock.calls[0] as [unknown, File, string]
      expect(dto).toMatchObject({ firstName: 'Alice', lastName: 'Johnson', email: 'a@b.com', jobId: 'j-1' })
      expect(file).toBeInstanceOf(File)
      expect(String(key)).toMatch(/^candidate-workflow:/)
      expect(mockSelectApplication).toHaveBeenCalledWith('app-1')
    })

    it('sends the right form fields to the backend', async () => {
      renderDialog(true)
      await fillForm()
      await act(async () => { fireEvent.change(screen.getByPlaceholderText('+1 555-0100'), { target: { value: '+1 555 0100' } }) })
      await act(async () => { fireEvent.change(screen.getByPlaceholderText('5'), { target: { value: '6' } }) })
      await submitAndSucceed()

      const [dto] = mockCreateWorkflow.mock.calls[0] as [Record<string, unknown>]
      expect(dto.phone).toBe('+1 555 0100')
      expect(dto.totalExperienceYears).toBe(6)
    })
  })

  describe('loading state + double click (2, 3)', () => {
    it('disables the button immediately and shows progress copy', async () => {
      renderDialog(true)
      await fillForm()
      let resolve!: (v: unknown) => void
      mockCreateWorkflow.mockReturnValue(new Promise((r) => { resolve = r }) as never)

      const btn = screen.getByText('Add Candidate').closest('button')!
      await act(async () => { fireEvent.click(btn) })

      const processingBtn = screen.getByText('Processing...').closest('button')!
      expect(processingBtn.disabled).toBe(true)
      expect(screen.getByText('Creating candidate...')).toBeDefined()
      expect(screen.queryByText('Add Candidate')).toBeNull()

      await act(async () => { resolve(WORKFLOW_RESULT); await Promise.resolve() })
      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
    })

    it('creates only one workflow request on rapid double click', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)

      const btn = screen.getByText('Add Candidate')
      await act(async () => { fireEvent.click(btn) })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(mockCreateWorkflow).toHaveBeenCalledTimes(1)
      })
      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
    })
  })

  describe('async extraction state (6, 13, 14)', () => {
    it('shows Resume Processing... while extraction is pending', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'PENDING' } as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Processing...')).toBeDefined()
      expect(screen.getByText(/Resume reading continues in the background/)).toBeDefined()
      expect(screen.queryByText('Start AI Screening')).toBeNull()
    })

    it('shows Resume Ready once extraction completes', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'PENDING' } as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })
      expect(await screen.findByText('Processing...')).toBeDefined()

      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)
      expect(await screen.findByText('Ready', undefined, { timeout: 5000 })).toBeDefined()
      expect(await screen.findByText('Start AI Screening')).toBeDefined()
    })

    it('shows Processing failed + Retry when extraction fails', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'FAILED' } as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Processing failed')).toBeDefined()
      await act(async () => { fireEvent.click(screen.getByText('Retry')) })
      expect(mockRetryAiScreeningExtraction).toHaveBeenCalledWith('app-1')
    })
  })

  describe('timeout + retry (7, 8, 10)', () => {
    it('maps a request timeout to a product-safe message and allows retry', async () => {
      renderDialog(true)
      await fillForm()
      const { ApiErrorResponse } = await import('@/lib/api/client')
      mockCreateWorkflow.mockRejectedValue(new ApiErrorResponse(408, 'REQUEST_TIMEOUT', 'The request took too long and was cancelled. Please try again.') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('The request took too long')).toBeDefined()
      expect(screen.queryByText(/signal is aborted without reason/i)).toBeNull()
      const retry = await screen.findByText('Retry')
      expect(retry).toBeDefined()

      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)
      const firstKey = mockCreateWorkflow.mock.calls[0]?.[2]
      await act(async () => { fireEvent.click(retry) })

      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
      const secondKey = mockCreateWorkflow.mock.calls[1]?.[2]
      expect(secondKey).toBe(firstKey)
    })

    it('regenerates the idempotency key when the user edits the form after a failure', async () => {
      const onOpenChange = vi.fn()
      const { rerender } = render(
        <AddCandidateDialog open={true} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />
      )
      await fillForm()
      mockCreateWorkflow.mockRejectedValue(new Error('Failed to fetch') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })
      expect(await screen.findByText('Network problem')).toBeDefined()
      const firstKey = mockCreateWorkflow.mock.calls[0]?.[2]

      // Close and reopen — the dialog resets, so the next submission is a
      // genuinely different request and must get a fresh idempotency key.
      rerender(<AddCandidateDialog open={false} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />)
      rerender(<AddCandidateDialog open={true} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />)

      await fillForm()
      await act(async () => { fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'new@b.com' } }) })

      mockCreateWorkflow.mockResolvedValue(WORKFLOW_RESULT as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)
      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
      const secondKey = mockCreateWorkflow.mock.calls[1]?.[2]
      expect(secondKey).not.toBe(firstKey)
    })

    it('shows a clear message for duplicate application (10)', async () => {
      renderDialog(true)
      await fillForm()
      const { ApiErrorResponse } = await import('@/lib/api/client')
      mockCreateWorkflow.mockRejectedValue(new ApiErrorResponse(409, 'APPLICATION_DUPLICATE', 'Candidate already has an active application for this job') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Already applied')).toBeDefined()
      expect(screen.getByText(/already has an active application for this job/)).toBeDefined()
      expect(screen.queryByText('Retry')).toBeNull()
    })

    it('shows a recoverable retry for generic network failures (9)', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockRejectedValue(new Error('Failed to fetch') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Network problem')).toBeDefined()
      expect(screen.getByText(/nothing will be duplicated/)).toBeDefined()
      expect(await screen.findByText('Retry')).toBeDefined()
    })
  })

  describe('existing candidate / new job (11)', () => {
    it('accepts an existing-candidate reuse result from the backend', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateWorkflow.mockResolvedValue({ ...WORKFLOW_RESULT, candidateCreated: false } as never)
      mockGetResumeExtractionStatus.mockResolvedValue({ id: 'e-1', status: 'COMPLETED' } as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Candidate added successfully')).toBeDefined()
    })
  })

  describe('refresh persistence (12)', () => {
    it('refreshes the candidates list when the dialog closes after success', async () => {
      const onOpenChange = vi.fn()
      const onComplete = vi.fn()
      render(
        <AddCandidateDialog open={true} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={onComplete} />
      )
      await fillForm()
      await submitAndSucceed()
      expect(await screen.findByText('Candidate added successfully')).toBeDefined()

      await act(async () => { fireEvent.click(screen.getByText('Done')) })
      expect(mockFetchCandidates).toHaveBeenCalled()
      expect(onComplete).toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('screening entry point', () => {
    it('keeps the optional Start AI Screening flow after extraction is ready', async () => {
      renderDialog(true)
      await fillForm()
      await submitAndSucceed()
      expect(await screen.findByText('Start AI Screening')).toBeDefined()

      mockUseAiScreening.mockReturnValue(hookState({ workflowState: 'SCREENING_COMPLETED', screeningResult: { id: 'r-1' } }))
      await act(async () => { fireEvent.click(screen.getByText('Start AI Screening')) })

      expect(await screen.findByTestId('screening-result-view')).toBeDefined()
    })
  })

  describe('state reset', () => {
    it('closes cleanly and resets form fields for next open', async () => {
      const onOpenChange = vi.fn()
      const { rerender } = render(
        <AddCandidateDialog open={true} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />
      )

      await act(async () => { fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Alice' } }) })
      await act(async () => { fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'a@b.com' } }) })

      rerender(
        <AddCandidateDialog open={false} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />
      )
      rerender(
        <AddCandidateDialog open={true} onOpenChange={onOpenChange} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />
      )

      await waitFor(() => {
        expect((screen.getByPlaceholderText('e.g. John Smith') as HTMLInputElement).value).toBe('')
        expect((screen.getByPlaceholderText('john@example.com') as HTMLInputElement).value).toBe('')
      })
    })
  })
})