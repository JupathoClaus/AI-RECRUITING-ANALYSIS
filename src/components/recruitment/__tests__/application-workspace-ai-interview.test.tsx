/**
 * Tests for AiInterviewPanel in ApplicationWorkspace — ENG-013.
 *
 * What these tests prove:
 *   - "Schedule AI interview" button appears when no interviews exist
 *   - Active interview status badge and date are shown
 *   - "Send invitation" / "Resend invitation" button shown for CREATED/SENT status
 *   - Completed interview state with "Schedule new interview" option
 *   - "View all interviews" link shown when interviews exist
 *   - SendAiInterviewModal opens when button is clicked
 *   - After modal closes, loadData is triggered (workspace refresh)
 *   - interviews are fetched alongside application data
 *
 * What these tests do NOT prove:
 *   - Real API calls or backend authorization (server-enforced)
 *   - The SendAiInterviewModal's internal flow (tested separately in send-ai-interview-modal)
 *   - Tavus provider behavior (mocked)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApplicationWorkspace } from '../application-workspace'
import type { AiInterviewDetail } from '@/lib/api/ai-interviews.api'
import type { ApplicationDetail } from '@/lib/api/applications.api'

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ applicationId: 'app-1' }),
  useSearchParams: () => new URLSearchParams(),
}))

const mockFetchApplicationById = vi.fn()
const mockGetLatestAiScreening = vi.fn()
const mockGetAiInterviewsByApplication = vi.fn()
const mockGetJobPipeline = vi.fn()

vi.mock('@/lib/api/applications.api', () => ({
  fetchApplicationById: (...args: any[]) => mockFetchApplicationById(...args),
  rejectApplication: vi.fn(),
  shortlistApplication: vi.fn(),
  markApplicationHired: vi.fn(),
  moveApplication: vi.fn(),
  createApplicationNote: vi.fn(),
}))

vi.mock('@/lib/api/ai-screening.api', () => ({
  getLatestAiScreening: (...args: any[]) => mockGetLatestAiScreening(...args),
  requestAiScreening: vi.fn(),
}))

vi.mock('@/lib/api/ai-interviews.api', () => ({
  getAiInterviewsByApplication: (...args: any[]) => mockGetAiInterviewsByApplication(...args),
  createAiInterview: vi.fn(),
  sendAiInterviewInvitation: vi.fn(),
  cancelAiInterview: vi.fn(),
  regenerateAiInterviewCode: vi.fn(),
}))

vi.mock('@/lib/api/jobs.api', () => ({
  getJobPipeline: (...args: any[]) => mockGetJobPipeline(...args),
}))

// Stub panels not relevant to this test
vi.mock('@/components/assessments/application-assessment-panel', () => ({
  ApplicationAssessmentPanel: () => null,
}))

vi.mock('@/components/ai-screening/screening-result-view', () => ({
  ScreeningResultView: () => null,
}))

// ── Fixtures ──────────────────────────────────────────────────────

function makeApplication(): ApplicationDetail {
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
    job: { id: 'j-1', title: 'Software Engineer', jobCode: 'JOB-001' },
    currentStage: { id: 's-1', name: 'Applied', type: 'APPLIED' },
    companyCandidate: null,
    notes: [],
    stageHistory: [],
  }
}

function makeInterview(overrides: Partial<AiInterviewDetail> = {}): AiInterviewDetail {
  return {
    id: 'int-1',
    applicationId: 'app-1',
    provider: 'MOCK',
    status: 'CREATED',
    codeDisplayHint: 'AB12',
    invitationSentAt: null,
    invitationEmail: null,
    accessedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    consentAcceptedAt: null,
    accommodationRequested: false,
    accommodationNotes: null,
    tavusConversationId: null,
    tavusConversationUrl: null,
    tavusStatus: null,
    transcriptStatus: 'NOT_REQUESTED',
    transcriptUrl: null,
    transcript: null,
    recordingStatus: null,
    recordingUrl: null,
    recordingMetadata: null,
    language: 'en',
    estimatedDurationMinutes: 15,
    expiresAt: null,
    notes: null,
    createdAt: '2026-01-15T11:00:00Z',
    updatedAt: '2026-01-15T11:00:00Z',
    application: {
      candidate: { id: 'c-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.com' },
      job: { id: 'j-1', title: 'Software Engineer' },
    },
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetLatestAiScreening.mockRejectedValue(new Error('Not found'))
  mockGetJobPipeline.mockResolvedValue({ stages: [] })
})

async function renderWorkspace(interviews: AiInterviewDetail[] = []) {
  mockFetchApplicationById.mockResolvedValue(makeApplication())
  mockGetAiInterviewsByApplication.mockResolvedValue(interviews)
  render(<ApplicationWorkspace />)
  await waitFor(() => expect(screen.queryByText(/Application #APP-001/)).not.toBeNull(), { timeout: 3000 })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('AiInterviewPanel — no interviews', () => {
  it('shows the AI Interview card heading', async () => {
    await renderWorkspace([])
    expect(screen.getByText('AI Interview')).toBeDefined()
  })

  it('shows "Schedule AI interview" button when no interviews exist', async () => {
    await renderWorkspace([])
    expect(screen.getByRole('button', { name: /schedule ai interview/i })).toBeDefined()
  })

  it('shows "No AI interview has been scheduled yet." when empty', async () => {
    await renderWorkspace([])
    expect(screen.getByText('No AI interview has been scheduled yet.')).toBeDefined()
  })

  it('calls getAiInterviewsByApplication during workspace load', async () => {
    await renderWorkspace([])
    expect(mockGetAiInterviewsByApplication).toHaveBeenCalledWith('app-1')
  })
})

describe('AiInterviewPanel — CREATED status', () => {
  it('shows the CREATED status badge', async () => {
    await renderWorkspace([makeInterview({ status: 'CREATED' })])
    expect(screen.getByText('Created')).toBeDefined()
  })

  it('shows "Send invitation" button for CREATED interview', async () => {
    await renderWorkspace([makeInterview({ status: 'CREATED' })])
    expect(screen.getByRole('button', { name: /send invitation/i })).toBeDefined()
  })

  it('shows "View all interviews" link when interviews exist', async () => {
    await renderWorkspace([makeInterview({ status: 'CREATED' })])
    const link = screen.getByRole('link', { name: /view all interviews/i })
    expect(link.getAttribute('href')).toContain('/ai-interviews')
  })
})

describe('AiInterviewPanel — SENT status', () => {
  it('shows the SENT status badge', async () => {
    await renderWorkspace([makeInterview({ status: 'SENT', invitationSentAt: '2026-01-15T12:00:00Z' })])
    expect(screen.getByText('Invitation sent')).toBeDefined()
  })

  it('shows "Resend invitation" button for SENT interview', async () => {
    await renderWorkspace([makeInterview({ status: 'SENT' })])
    expect(screen.getByRole('button', { name: /resend invitation/i })).toBeDefined()
  })
})

describe('AiInterviewPanel — IN_PROGRESS status', () => {
  it('shows "In progress" badge without send button', async () => {
    await renderWorkspace([makeInterview({ status: 'IN_PROGRESS' })])
    expect(screen.getByText('In progress')).toBeDefined()
    expect(screen.queryByRole('button', { name: /send invitation/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /schedule ai interview/i })).toBeNull()
  })
})

describe('AiInterviewPanel — COMPLETED status', () => {
  it('shows "Completed" badge', async () => {
    await renderWorkspace([makeInterview({ status: 'COMPLETED', completedAt: '2026-01-15T13:00:00Z' })])
    expect(screen.getByText('Completed')).toBeDefined()
  })

  it('shows "Schedule new interview" button after completion', async () => {
    await renderWorkspace([makeInterview({ status: 'COMPLETED' })])
    expect(screen.getByRole('button', { name: /schedule new interview/i })).toBeDefined()
  })
})

describe('AiInterviewPanel — modal trigger', () => {
  it('opens SendAiInterviewModal when schedule button is clicked', async () => {
    await renderWorkspace([])
    fireEvent.click(screen.getByRole('button', { name: /schedule ai interview/i }))
    // The modal dialog should be visible
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull(), { timeout: 2000 })
  })

  it('triggers workspace reload when modal closes', async () => {
    await renderWorkspace([])
    fireEvent.click(screen.getByRole('button', { name: /schedule ai interview/i }))
    // Wait for dialog to appear
    await waitFor(() => screen.getByRole('dialog'))
    // Close the dialog
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    // After close, loadData should be called again
    await waitFor(() => expect(mockFetchApplicationById.mock.calls.length).toBeGreaterThan(1), { timeout: 2000 })
  })
})
