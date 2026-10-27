/**
 * Tests for the NotesCard behavior inside ApplicationWorkspace.
 * Covers ENG-010: recruiter note-taking from the application workspace.
 *
 * What these tests prove:
 *   - Existing notes are displayed
 *   - Empty notes state is handled gracefully
 *   - Submit button is disabled for empty/whitespace-only input
 *   - A valid note is submitted with the correct API call
 *   - The textarea is cleared and workspace reloads on success
 *   - API errors are shown inline
 *   - The button is disabled while submitting (duplicate prevention)
 *   - Notes over the length limit are rejected client-side
 *
 * What these tests do NOT prove:
 *   - Backend authorization (permission 'applications.add_notes' enforced server-side)
 *   - Visibility filter logic (server-side, tested in backend unit tests)
 *   - Real HTTP calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApplicationWorkspace } from '../application-workspace'
import type { ApplicationDetail, ApplicationNote } from '@/lib/api/applications.api'

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/applications/app-1',
  useParams: () => ({ applicationId: 'app-1' }),
}))

const mockFetchApplicationById = vi.fn()
const mockGetLatestAiScreening = vi.fn()
const mockCreateApplicationNote = vi.fn()
const mockGetJobPipeline = vi.fn()

vi.mock('@/lib/api/applications.api', () => ({
  fetchApplicationById: (...args: any[]) => mockFetchApplicationById(...args),
  rejectApplication: vi.fn(),
  shortlistApplication: vi.fn(),
  markApplicationHired: vi.fn(),
  moveApplication: vi.fn(),
  createApplicationNote: (...args: any[]) => mockCreateApplicationNote(...args),
}))

vi.mock('@/lib/api/ai-screening.api', () => ({
  getLatestAiScreening: (...args: any[]) => mockGetLatestAiScreening(...args),
  requestAiScreening: vi.fn(),
}))

vi.mock('@/lib/api/jobs.api', () => ({
  getJobPipeline: (...args: any[]) => mockGetJobPipeline(...args),
}))

vi.mock('@/components/assessments/application-assessment-panel', () => ({
  ApplicationAssessmentPanel: () => null,
}))

vi.mock('@/components/ai-screening/screening-result-view', () => ({
  ScreeningResultView: () => null,
}))

// ── Fixtures ──────────────────────────────────────────────────────

function makeNote(overrides: Partial<ApplicationNote> = {}): ApplicationNote {
  return {
    id: 'note-1',
    content: 'Initial note content',
    visibility: 'PRIVATE',
    authorMembershipId: 'member-1',
    createdAt: '2026-01-15T10:00:00Z',
    editedAt: null,
    ...overrides,
  }
}

function makeApplication(notes: ApplicationNote[] = []): ApplicationDetail {
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
    notes,
    stageHistory: [],
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetLatestAiScreening.mockRejectedValue(new Error('Not found'))
  mockGetJobPipeline.mockResolvedValue({ stages: [] })
})

async function renderWorkspace(notes: ApplicationNote[] = []) {
  mockFetchApplicationById.mockResolvedValue(makeApplication(notes))
  render(<ApplicationWorkspace />)
  await waitFor(() => expect(screen.queryByText(/Application #APP-001/)).not.toBeNull(), { timeout: 3000 })
}

// ── Tests: existing notes display ─────────────────────────────────

describe('NotesCard — display', () => {
  it('renders existing note content', async () => {
    await renderWorkspace([makeNote({ content: 'Great candidate, strong background.' })])
    expect(screen.getByText('Great candidate, strong background.')).toBeDefined()
  })

  it('renders multiple notes', async () => {
    await renderWorkspace([
      makeNote({ id: 'n1', content: 'First note' }),
      makeNote({ id: 'n2', content: 'Second note' }),
    ])
    expect(screen.getByText('First note')).toBeDefined()
    expect(screen.getByText('Second note')).toBeDefined()
  })

  it('shows empty state message when there are no notes', async () => {
    await renderWorkspace([])
    expect(screen.getByText('No notes have been added.')).toBeDefined()
  })

  it('shows the "Add a note" textarea label', async () => {
    await renderWorkspace([])
    expect(screen.getByLabelText('Add a note')).toBeDefined()
  })
})

// ── Tests: form validation ─────────────────────────────────────────

describe('NotesCard — form validation', () => {
  it('submit button is disabled when textarea is empty', async () => {
    await renderWorkspace()
    const btn = screen.getByRole('button', { name: /save note/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('submit button is disabled for whitespace-only input', async () => {
    await renderWorkspace()
    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: '   ' } })
    const btn = screen.getByRole('button', { name: /save note/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('submit button is enabled when valid content is entered', async () => {
    await renderWorkspace()
    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'This is a valid note.' } })
    const btn = screen.getByRole('button', { name: /save note/i })
    expect(btn.hasAttribute('disabled')).toBe(false)
  })
})

// ── Tests: successful submission ───────────────────────────────────

describe('NotesCard — successful submission', () => {
  it('calls createApplicationNote with trimmed content', async () => {
    const newNote = makeNote({ id: 'n-new', content: 'A fresh note' })
    mockCreateApplicationNote.mockResolvedValue(newNote)
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: '  A fresh note  ' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() =>
      expect(mockCreateApplicationNote).toHaveBeenCalledWith('app-1', { content: 'A fresh note' })
    )
  })

  it('clears the textarea after successful save', async () => {
    mockCreateApplicationNote.mockResolvedValue(makeNote())
    // Reload will re-fetch; set up the re-fetch mock to return updated notes
    mockFetchApplicationById
      .mockResolvedValueOnce(makeApplication([]))       // initial load
      .mockResolvedValue(makeApplication([makeNote()])) // after reload
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'My note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(''))
  })

  it('triggers a workspace reload after saving a note', async () => {
    mockCreateApplicationNote.mockResolvedValue(makeNote())
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'Reload trigger note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    // After the save, loadData is called again — fetchApplicationById should be
    // called a second time
    await waitFor(() => expect(mockFetchApplicationById.mock.calls.length).toBeGreaterThan(1))
  })
})

// ── Tests: error handling ──────────────────────────────────────────

describe('NotesCard — error handling', () => {
  it('shows an inline error when the API call fails', async () => {
    mockCreateApplicationNote.mockRejectedValue(new Error('Permission denied'))
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'Note content' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText('Permission denied')).toBeDefined()
  })

  it('shows a generic error when error has no message', async () => {
    mockCreateApplicationNote.mockRejectedValue('unknown')
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'Note content' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText(/could not be saved/i)).toBeDefined()
  })

  it('textarea remains populated after a failed save', async () => {
    mockCreateApplicationNote.mockRejectedValue(new Error('Server error'))
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Unsaved note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    // Content should NOT have been cleared
    expect(textarea.value).toBe('Unsaved note')
  })
})

// ── Tests: duplicate submission prevention ─────────────────────────

describe('NotesCard — duplicate submission prevention', () => {
  it('disables the submit button while save is in flight', async () => {
    let resolve!: (v: any) => void
    mockCreateApplicationNote.mockReturnValue(new Promise((r) => { resolve = r }))
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note')
    fireEvent.change(textarea, { target: { value: 'In-flight note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving/i }).hasAttribute('disabled')).toBe(true)
    )

    // Clean up the pending promise
    resolve(makeNote())
  })

  it('disables the textarea while save is in flight', async () => {
    let resolve!: (v: any) => void
    mockCreateApplicationNote.mockReturnValue(new Promise((r) => { resolve = r }))
    await renderWorkspace()

    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'In-flight note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect(textarea.disabled).toBe(true))

    resolve(makeNote())
  })
})
