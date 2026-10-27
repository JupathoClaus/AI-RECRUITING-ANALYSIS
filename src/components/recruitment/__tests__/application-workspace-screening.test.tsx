/**
 * Tests for the RequestScreeningButton behavior inside ApplicationWorkspace.
 * These cover the ENG-009 implementation: requesting AI screening from the
 * application workspace recruiter actions panel.
 *
 * What these tests prove:
 *   - The correct button label is shown for each screening state
 *   - Submitting calls requestAiScreening with the right arguments
 *   - Success and error messages are displayed
 *   - The button is disabled while a request is in flight
 *   - PENDING/RUNNING states show an informational status instead of a button
 *   - COMPLETED state shows a "Re-run" button (forceRerun=true)
 *   - Known error codes map to human-readable messages
 *
 * What these tests do NOT prove:
 *   - Real HTTP calls or backend eligibility enforcement
 *   - Pipeline stages loading (mocked to empty)
 *   - Assessment panel behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApplicationWorkspace } from '../application-workspace'
import type { AiScreeningResultDto } from '@/lib/api/ai-screening.api'
import type { ApplicationDetail } from '@/lib/api/applications.api'

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/applications/app-1',
  useParams: () => ({ applicationId: 'app-1' }),
}))

// Mocked modules — implementations set per test
const mockFetchApplicationById = vi.fn()
const mockGetLatestAiScreening = vi.fn()
const mockRequestAiScreening = vi.fn()
const mockGetJobPipeline = vi.fn()

vi.mock('@/lib/api/applications.api', () => ({
  fetchApplicationById: (...args: any[]) => mockFetchApplicationById(...args),
  rejectApplication: vi.fn(),
  shortlistApplication: vi.fn(),
  markApplicationHired: vi.fn(),
  moveApplication: vi.fn(),
}))

vi.mock('@/lib/api/ai-screening.api', () => ({
  getLatestAiScreening: (...args: any[]) => mockGetLatestAiScreening(...args),
  requestAiScreening: (...args: any[]) => mockRequestAiScreening(...args),
}))

vi.mock('@/lib/api/jobs.api', () => ({
  getJobPipeline: (...args: any[]) => mockGetJobPipeline(...args),
}))

// Stub out panels that are not the subject of these tests
vi.mock('@/components/assessments/application-assessment-panel', () => ({
  ApplicationAssessmentPanel: () => null,
}))

vi.mock('@/components/ai-screening/screening-result-view', () => ({
  ScreeningResultView: () => <div data-testid="screening-result-view" />,
}))

// ── Fixtures ──────────────────────────────────────────────────────

function makeApplication(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    id: 'app-1',
    applicationNumber: 'APP-001',
    status: 'SUBMITTED',
    source: 'DIRECT',
    submittedAt: '2026-01-15T10:00:00Z',
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-01-15T09:00:00Z',
    version: 1,
    candidate: {
      id: 'c-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
      headline: null,
      currentJobTitle: null,
      totalExperienceYears: null,
      skills: [],
    },
    job: { id: 'j-1', title: 'Engineer', jobCode: 'JOB-001' },
    currentStage: { id: 's-1', name: 'Applied', type: 'APPLIED' },
    companyCandidate: null,
    notes: [],
    stageHistory: [],
    ...overrides,
  }
}

function makeScreening(overrides: Partial<AiScreeningResultDto> = {}): AiScreeningResultDto {
  return {
    id: 'sr-1',
    applicationId: 'app-1',
    status: 'COMPLETED',
    createdAt: '2026-01-15T10:30:00Z',
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetJobPipeline.mockResolvedValue({ stages: [] })
})

async function renderWorkspace(screeningOverride: AiScreeningResultDto | null) {
  mockFetchApplicationById.mockResolvedValue(makeApplication())
  // The workspace does getLatestAiScreening(...).catch(() => null)
  // When screening is null, simulate "no screening" (404 → caught as null)
  if (screeningOverride === null) {
    mockGetLatestAiScreening.mockRejectedValue(new Error('Not found'))
  } else {
    mockGetLatestAiScreening.mockResolvedValue(screeningOverride)
  }
  render(<ApplicationWorkspace />)
  // Wait for the async data load: the header renders
  // "Engineer · Application #APP-001" as a combined text node
  await waitFor(() => expect(screen.queryByText(/Application #APP-001/)).not.toBeNull(), { timeout: 3000 })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('RequestScreeningButton — no existing screening', () => {
  it('shows "Request AI screening" when no screening exists', async () => {
    await renderWorkspace(null)
    expect(screen.getByRole('button', { name: /request ai screening/i })).toBeDefined()
  })

  it('calls requestAiScreening with forceRerun=false for a fresh request', async () => {
    mockRequestAiScreening.mockResolvedValue({
      data: { action: 'CREATED', data: makeScreening({ status: 'PENDING' }) },
      status: 202,
      headers: new Headers(),
    })
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(mockRequestAiScreening).toHaveBeenCalledWith('app-1', { forceRerun: false }))
  })

  it('shows success message when screening is queued (action=CREATED)', async () => {
    mockRequestAiScreening.mockResolvedValue({
      data: { action: 'CREATED', data: makeScreening({ status: 'PENDING' }) },
      status: 202,
      headers: new Headers(),
    })
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByText(/screening queued/i)).toBeDefined())
  })

  it('shows informational message when an existing result is reused (action=REUSED)', async () => {
    mockRequestAiScreening.mockResolvedValue({
      data: { action: 'REUSED', data: makeScreening({ status: 'COMPLETED' }) },
      status: 200,
      headers: new Headers(),
    })
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByText(/existing screening result is already available/i)).toBeDefined())
  })
})

describe('RequestScreeningButton — existing FAILED screening', () => {
  it('shows "Request AI screening" for FAILED status (auto-retry)', async () => {
    await renderWorkspace(makeScreening({ status: 'FAILED' }))
    expect(screen.getByRole('button', { name: /request ai screening/i })).toBeDefined()
  })

  it('calls requestAiScreening with forceRerun=false for FAILED (backend auto-creates fresh)', async () => {
    mockRequestAiScreening.mockResolvedValue({
      data: { action: 'CREATED', data: makeScreening({ status: 'PENDING' }) },
      status: 202,
      headers: new Headers(),
    })
    await renderWorkspace(makeScreening({ status: 'FAILED' }))

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(mockRequestAiScreening).toHaveBeenCalledWith('app-1', { forceRerun: false }))
  })
})

describe('RequestScreeningButton — COMPLETED screening', () => {
  it('shows "Re-run AI screening" for COMPLETED status', async () => {
    await renderWorkspace(makeScreening({ status: 'COMPLETED' }))
    expect(screen.getByRole('button', { name: /re-run ai screening/i })).toBeDefined()
  })

  it('calls requestAiScreening with forceRerun=true for COMPLETED', async () => {
    mockRequestAiScreening.mockResolvedValue({
      data: { action: 'CREATED', data: makeScreening({ status: 'PENDING' }) },
      status: 202,
      headers: new Headers(),
    })
    await renderWorkspace(makeScreening({ status: 'COMPLETED' }))

    fireEvent.click(screen.getByRole('button', { name: /re-run ai screening/i }))
    await waitFor(() => expect(mockRequestAiScreening).toHaveBeenCalledWith('app-1', { forceRerun: true }))
  })
})

describe('RequestScreeningButton — active states', () => {
  it('shows informational status (no button) when screening is PENDING', async () => {
    await renderWorkspace(makeScreening({ status: 'PENDING' }))
    expect(screen.queryByRole('button', { name: /request ai screening/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /re-run/i })).toBeNull()
    expect(screen.getByText(/screening queued/i)).toBeDefined()
  })

  it('shows informational status (no button) when screening is RUNNING', async () => {
    await renderWorkspace(makeScreening({ status: 'RUNNING' }))
    expect(screen.queryByRole('button', { name: /request ai screening/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /re-run/i })).toBeNull()
    // The status div should show "Screening running — results will appear when complete."
    expect(screen.getByText(/screening running/i)).toBeDefined()
  })
})

describe('RequestScreeningButton — error handling', () => {
  it('shows a generic error message on unexpected failure', async () => {
    mockRequestAiScreening.mockRejectedValue(new Error('Network error'))
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText('Network error')).toBeDefined()
  })

  it('shows user-friendly message for INSUFFICIENT_JOB_CRITERIA', async () => {
    mockRequestAiScreening.mockRejectedValue(
      new Error(JSON.stringify({ code: 'INSUFFICIENT_JOB_CRITERIA', message: 'Add job requirements' })),
    )
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText(/structured requirements/i)).toBeDefined()
  })

  it('shows user-friendly message for RESUME_EXTRACTION_PENDING', async () => {
    mockRequestAiScreening.mockRejectedValue(
      new Error(JSON.stringify({ code: 'RESUME_EXTRACTION_PENDING', message: 'Resume is processing' })),
    )
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText(/still being processed/i)).toBeDefined()
  })

  it('shows user-friendly message when no resume is attached', async () => {
    mockRequestAiScreening.mockRejectedValue(new Error('No resume file found for this application.'))
    await renderWorkspace(null)

    fireEvent.click(screen.getByRole('button', { name: /request ai screening/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText(/no resume is attached/i)).toBeDefined()
  })

  it('button is disabled while request is in flight (prevents duplicate submissions)', async () => {
    let resolve!: (v: any) => void
    mockRequestAiScreening.mockReturnValue(new Promise((r) => { resolve = r }))
    await renderWorkspace(null)

    const btn = screen.getByRole('button', { name: /request ai screening/i })
    fireEvent.click(btn)

    // Button shows "Requesting…" and is disabled
    await waitFor(() => expect(screen.getByRole('button', { name: /requesting/i })).toBeDefined())
    expect(screen.getByRole('button', { name: /requesting/i }).hasAttribute('disabled')).toBe(true)

    // Clean up
    resolve({ data: { action: 'CREATED', data: makeScreening({ status: 'PENDING' }) }, status: 202, headers: new Headers() })
  })
})
