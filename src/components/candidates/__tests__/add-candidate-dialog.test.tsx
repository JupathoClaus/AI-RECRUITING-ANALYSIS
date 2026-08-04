import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AddCandidateDialog } from '../add-candidate-dialog'
import type { Job } from '@/types'

const mockCreateCandidate = vi.hoisted(() => vi.fn())
const mockCreateApplication = vi.hoisted(() => vi.fn())
const mockSelectApplication = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>())
const mockStoredFile = { id: 'f-1', url: 'http://example.com/x.pdf', filename: 'x.pdf' }
const mockUploadOk = { ok: true, file: mockStoredFile }
const mockHandleUploadResume = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
const mockRequestScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
const mockRetryScreening = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>())
const mockFetchCandidates = vi.hoisted(() => vi.fn())
const mockUseAiScreening = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/candidates.api', () => ({ createCandidate: mockCreateCandidate }))
vi.mock('@/lib/api/applications.api', () => ({ createApplication: mockCreateApplication }))
vi.mock('@/lib/ai-screening/use-ai-screening', () => ({ useAiScreening: mockUseAiScreening }))
vi.mock('@/store/useStore', () => ({ useStore: () => ({ fetchCandidates: mockFetchCandidates }) }))

vi.mock('@/components/ai-screening/resume-upload-area', () => ({
  ResumeUploadArea: function MockResumeUploadArea({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
    return (
      <div data-testid="resume-upload-area">
        <button data-testid="mock-select-file" onClick={() => onUpload(new File(['x'], 'resume.pdf', { type: 'application/pdf' }))}>
          Select Resume
        </button>
        {uploading && <span data-testid="uploading-indicator">Uploading...</span>}
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
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

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
    handleUploadResume: mockHandleUploadResume,
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
  await act(async () => { fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Alice' } }) })
  await act(async () => { fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'a@b.com' } }) })
  await act(async () => { screen.getByTestId('select-job-btn').click() })
  await act(async () => { screen.getByTestId('mock-select-file').click() })
}

async function clickAddCandidate() {
  mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
  mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
  mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)
  await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })
}

describe('AddCandidateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAiScreening.mockReturnValue(hookState())
  })

  describe('render-loop regression', () => {
    it('does not reset repeatedly while mounted closed (prevents max-update loop)', () => {
      renderDialog(false)
      expect(mockSelectApplication).not.toHaveBeenCalled()
      renderDialog(false)
      renderDialog(false)
    })

    it('resets exactly once on the open-to-closed transition', () => {
      const { rerender } = renderDialog(true)
      rerender(<AddCandidateDialog open={false} onOpenChange={vi.fn()} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />)
      expect(mockSelectApplication).toHaveBeenCalledTimes(1)
    })

    it('does not reset on close-to-open transition', () => {
      const { rerender } = renderDialog(false)
      expect(mockSelectApplication).not.toHaveBeenCalled()
      rerender(<AddCandidateDialog open={true} onOpenChange={vi.fn()} jobs={[ACTIVE_JOB]} onComplete={vi.fn()} />)
      expect(mockSelectApplication).not.toHaveBeenCalled()
    })
  })

  describe('form display', () => {
    it('renders dialog with candidate fields', () => {
      renderDialog(true)
      expect(screen.getByText('Add New Candidate')).toBeDefined()
      expect(screen.getByText('Full Name *')).toBeDefined()
      expect(screen.getByText('Email *')).toBeDefined()
    })

    it('requires name, email, job, and resume for submission', async () => {
      renderDialog(true)

      const btn = () => screen.getByText('Add Candidate').closest('button')!
      expect(btn().disabled).toBe(true)

      await act(async () => { fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Alice' } }) })
      expect(btn().disabled).toBe(true)

      await act(async () => { fireEvent.change(screen.getByPlaceholderText('john@example.com'), { target: { value: 'a@b.com' } }) })
      expect(btn().disabled).toBe(true)

      await act(async () => { screen.getByTestId('select-job-btn').click() })
      expect(btn().disabled).toBe(true)

      await act(async () => { screen.getByTestId('mock-select-file').click() })
      expect(btn().disabled).toBe(false)
    })

    it('shows only active jobs', () => {
      renderDialog(true)
      expect(screen.getByText('Engineer', { exact: false })).toBeDefined()
      expect(screen.getByText('Engineering', { exact: false })).toBeDefined()
      expect(screen.queryByText('Closed Role', { exact: false })).toBeNull()
    })
  })

  describe('upload indicator', () => {
    it('does not show uploading state after file selection', async () => {
      renderDialog(true)
      await act(async () => { screen.getByTestId('mock-select-file').click() })
      expect(screen.queryByTestId('uploading-indicator')).toBeNull()
    })

    it('removes uploading state after upload succeeds', async () => {
      renderDialog(true)
      await fillForm()
      await clickAddCandidate()

      await waitFor(() => {
        expect(screen.queryByText('Uploading resume...')).toBeNull()
      })
    })
  })

  describe('API calls', () => {
    it('calls API functions in correct order', async () => {
      renderDialog(true)
      await fillForm()
      await clickAddCandidate()

      await waitFor(() => {
        expect(mockCreateCandidate).toHaveBeenCalled()
        expect(mockCreateApplication).toHaveBeenCalled()
        expect(mockHandleUploadResume).toHaveBeenCalled()
      })
      const c = mockCreateCandidate.mock.invocationCallOrder[0]
      const a = mockCreateApplication.mock.invocationCallOrder[0]
      const u = mockHandleUploadResume.mock.invocationCallOrder[0]
      expect(c).toBeLessThan(a!)
      expect(a).toBeLessThan(u!)
    })
  })

  describe('no auto-screening', () => {
    it('does not call requestScreening after upload', async () => {
      renderDialog(true)
      await fillForm()
      await clickAddCandidate()

      await waitFor(() => {
        expect(mockRequestScreening).not.toHaveBeenCalled()
      })
    })
  })

  describe('screening button visibility', () => {
    it('shows Start AI Screening when RESUME_READY', async () => {
      mockUseAiScreening.mockReturnValue(hookState({ workflowState: 'RESUME_READY' }))
      renderDialog(true)
      await fillForm()
      await clickAddCandidate()

      expect(await screen.findByText('Start AI Screening')).toBeDefined()
    })

    it('hides Start AI Screening while WAITING_FOR_EXTRACTION', async () => {
      mockUseAiScreening.mockReturnValue(hookState({ workflowState: 'WAITING_FOR_EXTRACTION' }))
      renderDialog(true)
      await fillForm()
      await clickAddCandidate()

      await waitFor(() => {
        expect(screen.queryByText('Start AI Screening')).toBeNull()
      })
    })
  })

  describe('failure handling', () => {
    it('stops at candidate creation failure', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockRejectedValue(new Error('fail') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      await waitFor(() => {
        expect(mockCreateCandidate).toHaveBeenCalledTimes(1)
        expect(mockCreateApplication).not.toHaveBeenCalled()
        expect(mockHandleUploadResume).not.toHaveBeenCalled()
      })
    })

    it('stops at application creation failure', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockRejectedValue(new Error('fail') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      await waitFor(() => {
        expect(mockCreateApplication).toHaveBeenCalledTimes(1)
        expect(mockHandleUploadResume).not.toHaveBeenCalled()
      })
    })

    it('shows retry button for application failure', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockRejectedValue(new Error('fail') as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByText('Retry Application Creation')).toBeDefined()
    })

    it('shows replace resume on extraction failure', async () => {
      mockUseAiScreening.mockReturnValue(hookState({
        workflowState: 'EXTRACTION_FAILED',
        error: 'extraction error',
      }))
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
      mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      expect(await screen.findByTestId('resume-upload-area')).toBeDefined()
    })

    it('shows no screening action when extraction has failed', async () => {
      mockUseAiScreening.mockReturnValue(hookState({
        workflowState: 'EXTRACTION_FAILED',
        error: 'extraction error',
      }))
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
      mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      await waitFor(() => {
        expect(screen.queryByText('Start AI Screening')).toBeNull()
        expect(screen.queryByText('Start Screening Anyway')).toBeNull()
      })
    })
  })

  describe('double-click prevention', () => {
    it('creates candidate only once on double click', async () => {
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
      mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)

      const btn = screen.getByText('Add Candidate')
      await act(async () => { fireEvent.click(btn) })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(mockCreateCandidate).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('screening completion', () => {
    it('shows screening result when completed', async () => {
      mockUseAiScreening.mockReturnValue(hookState({ workflowState: 'RESUME_READY' }))
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
      mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      mockUseAiScreening.mockReturnValue(hookState({
        workflowState: 'SCREENING_COMPLETED',
        screeningResult: { id: 'r-1' },
      }))

      await act(async () => { fireEvent.click(screen.getByText('Start AI Screening')) })

      expect(await screen.findByTestId('screening-result-view')).toBeDefined()
      expect(screen.getByText('r-1')).toBeDefined()
    })

    it('shows retry button when screening fails', async () => {
      mockUseAiScreening.mockReturnValue(hookState({ workflowState: 'RESUME_READY' }))
      renderDialog(true)
      await fillForm()
      mockCreateCandidate.mockResolvedValue({ id: 'cand-1' } as never)
      mockCreateApplication.mockResolvedValue({ id: 'app-1' } as never)
      mockHandleUploadResume.mockResolvedValue(mockUploadOk as never)

      await act(async () => { fireEvent.click(screen.getByText('Add Candidate')) })

      mockUseAiScreening.mockReturnValue(hookState({
        workflowState: 'SCREENING_FAILED',
        screeningResult: { id: 'f1' },
        error: 'screening error',
      }))

      await act(async () => { fireEvent.click(screen.getByText('Start AI Screening')) })

      await waitFor(() => {
        expect(screen.getByText('Retry Screening')).toBeDefined()
      })
    })
  })

  describe('state reset', () => {
    it('closing dialog clears form fields for next open', async () => {
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
