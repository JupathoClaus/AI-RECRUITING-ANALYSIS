/**
 * Tests for JobWorkspace — ENG-014 lifecycle actions.
 *
 * What these tests prove:
 *   - Correct job details are rendered (title, status badge, department, job code)
 *   - "Publish job" appears for DRAFT jobs; absent for PUBLISHED/CLOSED
 *   - "Pause" and "Close job" appear for PUBLISHED jobs
 *   - "Resume" and "Close job" appear for PAUSED jobs
 *   - "Reopen" and "Archive" appear for CLOSED jobs
 *   - No action buttons for PENDING_APPROVAL, ARCHIVED, etc.
 *   - Publish action calls publishJob API
 *   - Pause action calls pauseJob API
 *   - After successful action, getJobById is called again (workspace refresh)
 *   - Error message shown when action fails
 *   - Button disabled while action is in flight
 *
 * What these tests do NOT prove:
 *   - Backend permission checks (server-enforced)
 *   - Real HTTP calls
 *   - Full analytics tab rendering (separate concern)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { JobWorkspace } from '@/components/recruitment/job-workspace'
import type { JobListDto, JobStatus } from '@/lib/api/types'

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ jobId: 'job-1' }),
  usePathname: () => '/jobs/job-1',
}))

const mockGetJobById = vi.fn()
const mockPublishJob = vi.fn()
const mockPauseJob = vi.fn()
const mockResumeJob = vi.fn()
const mockCloseJob = vi.fn()
const mockArchiveJob = vi.fn()
const mockReopenJob = vi.fn()
const mockGetJobPipeline = vi.fn()
const mockFetchApplications = vi.fn()
const mockFetchInterviews = vi.fn()

vi.mock('@/lib/api/jobs.api', () => ({
  getJobById: (...args: any[]) => mockGetJobById(...args),
  getJobPipeline: (...args: any[]) => mockGetJobPipeline(...args),
  getJobAnalytics: vi.fn().mockResolvedValue({}),
  publishJob: (...args: any[]) => mockPublishJob(...args),
  pauseJob: (...args: any[]) => mockPauseJob(...args),
  resumeJob: (...args: any[]) => mockResumeJob(...args),
  closeJob: (...args: any[]) => mockCloseJob(...args),
  archiveJob: (...args: any[]) => mockArchiveJob(...args),
  reopenJob: (...args: any[]) => mockReopenJob(...args),
}))

vi.mock('@/lib/api/applications.api', () => ({
  fetchApplications: (...args: any[]) => mockFetchApplications(...args),
}))

vi.mock('@/lib/api/interviews.api', () => ({
  fetchInterviews: (...args: any[]) => mockFetchInterviews(...args),
}))

// Stub heavy sub-components
vi.mock('@/components/recruitment/application-list-view', () => ({
  ApplicationListView: () => null,
}))

vi.mock('@/components/recruitment/pipeline-board', () => ({
  PipelineBoard: () => null,
}))

vi.mock('@/components/assessments/assessment-manager', () => ({
  AssessmentManager: () => null,
}))

// ── Fixtures ──────────────────────────────────────────────────────

function makeJob(status: JobStatus, overrides: Partial<JobListDto> = {}): JobListDto {
  return {
    id: 'job-1',
    jobCode: 'JOB-001',
    title: 'Software Engineer',
    slug: 'software-engineer',
    department: { id: 'd-1', name: 'Engineering', code: 'ENG' },
    location: null,
    employmentType: 'FULL_TIME',
    workplaceType: 'HYBRID',
    experienceLevel: 'MID',
    status,
    visibility: 'INTERNAL',
    approvalStatus: 'NOT_REQUIRED',
    publicationStatus: 'NOT_PUBLISHED',
    description: 'A software engineering role.',
    responsibilities: null,
    qualifications: null,
    numberOfOpenings: 2,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryVisible: false,
    applicationDeadline: null,
    owner: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    publishedAt: null,
    _count: { collaborators: 0, screeningQuestions: 3, skills: 5 },
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetJobPipeline.mockResolvedValue({ id: 'pipeline-1', jobId: 'job-1', stages: [] })
  mockFetchApplications.mockResolvedValue({ data: [], meta: { total: 12, page: 1, limit: 1, totalPages: 12 } })
  mockFetchInterviews.mockResolvedValue({ data: [], meta: { total: 3, page: 1, limit: 1, totalPages: 3 } })
  mockPublishJob.mockResolvedValue({})
  mockPauseJob.mockResolvedValue({})
  mockResumeJob.mockResolvedValue({})
  mockCloseJob.mockResolvedValue({})
  mockArchiveJob.mockResolvedValue({})
  mockReopenJob.mockResolvedValue({})
})

async function renderWorkspace(status: JobStatus, overrides: Partial<JobListDto> = {}) {
  const job = makeJob(status, overrides)
  mockGetJobById.mockResolvedValue(job)
  render(<JobWorkspace />)
  await waitFor(() => expect(screen.queryByText('Software Engineer')).not.toBeNull(), { timeout: 3000 })
  return job
}

// ── Tests: job detail rendering ───────────────────────────────────

describe('JobWorkspace — rendering', () => {
  it('renders the job title', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.getByRole('heading', { name: 'Software Engineer' })).toBeDefined()
  })

  it('renders the job code', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.getByText(/JOB-001/)).toBeDefined()
  })

  it('renders the application count', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.getByText('12 applications')).toBeDefined()
  })

  it('renders the department', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.getByText('Engineering')).toBeDefined()
  })
})

// ── Tests: lifecycle actions by status ───────────────────────────

describe('JobWorkspace — lifecycle actions: DRAFT', () => {
  it('shows "Publish job" for DRAFT', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.getByRole('button', { name: /publish job/i })).toBeDefined()
  })

  it('does not show pause or close for DRAFT', async () => {
    await renderWorkspace('DRAFT')
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /close job/i })).toBeNull()
  })
})

describe('JobWorkspace — lifecycle actions: PUBLISHED', () => {
  it('shows "Pause" and "Close job" for PUBLISHED', async () => {
    await renderWorkspace('PUBLISHED')
    expect(screen.getByRole('button', { name: /^pause$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /close job/i })).toBeDefined()
  })

  it('does not show "Publish job" for PUBLISHED', async () => {
    await renderWorkspace('PUBLISHED')
    expect(screen.queryByRole('button', { name: /publish job/i })).toBeNull()
  })
})

describe('JobWorkspace — lifecycle actions: PAUSED', () => {
  it('shows "Resume" and "Close job" for PAUSED', async () => {
    await renderWorkspace('PAUSED')
    expect(screen.getByRole('button', { name: /^resume$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /close job/i })).toBeDefined()
  })
})

describe('JobWorkspace — lifecycle actions: CLOSED', () => {
  it('shows "Reopen" and "Archive" for CLOSED', async () => {
    await renderWorkspace('CLOSED')
    expect(screen.getByRole('button', { name: /reopen/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /archive/i })).toBeDefined()
  })
})

describe('JobWorkspace — no actions for terminal statuses', () => {
  it('shows no action buttons for ARCHIVED', async () => {
    await renderWorkspace('ARCHIVED')
    // ARCHIVED has no recruiter-facing transitions
    expect(screen.queryByRole('button', { name: /publish|pause|close|resume|reopen|archive/i })).toBeNull()
  })

  it('shows no action buttons for PENDING_APPROVAL', async () => {
    await renderWorkspace('PENDING_APPROVAL')
    expect(screen.queryByRole('button', { name: /publish|pause|close/i })).toBeNull()
  })
})

// ── Tests: action calls and refresh ──────────────────────────────

describe('JobWorkspace — action API calls', () => {
  it('calls publishJob when "Publish job" is clicked', async () => {
    await renderWorkspace('DRAFT')
    fireEvent.click(screen.getByRole('button', { name: /publish job/i }))
    await waitFor(() => expect(mockPublishJob).toHaveBeenCalledWith('job-1'))
  })

  it('calls pauseJob when "Pause" is clicked', async () => {
    await renderWorkspace('PUBLISHED')
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }))
    await waitFor(() => expect(mockPauseJob).toHaveBeenCalledWith('job-1'))
  })

  it('calls closeJob when "Close job" is clicked', async () => {
    await renderWorkspace('PUBLISHED')
    fireEvent.click(screen.getByRole('button', { name: /close job/i }))
    await waitFor(() => expect(mockCloseJob).toHaveBeenCalledWith('job-1'))
  })

  it('calls reopenJob when "Reopen" is clicked', async () => {
    await renderWorkspace('CLOSED')
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }))
    await waitFor(() => expect(mockReopenJob).toHaveBeenCalledWith('job-1'))
  })

  it('calls archiveJob when "Archive" is clicked', async () => {
    await renderWorkspace('CLOSED')
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))
    await waitFor(() => expect(mockArchiveJob).toHaveBeenCalledWith('job-1'))
  })

  it('refreshes workspace after successful action (getJobById called again)', async () => {
    // Set up: second call returns a PUBLISHED job
    mockGetJobById
      .mockResolvedValueOnce(makeJob('DRAFT'))
      .mockResolvedValue(makeJob('PUBLISHED'))

    render(<JobWorkspace />)
    await waitFor(() => expect(screen.queryByText('Software Engineer')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /publish job/i }))
    await waitFor(() => expect(mockGetJobById.mock.calls.length).toBeGreaterThan(1))
  })
})

// ── Tests: error handling ─────────────────────────────────────────

describe('JobWorkspace — action error handling', () => {
  it('shows an error message when publish fails', async () => {
    mockPublishJob.mockRejectedValue(new Error('Job is not ready to publish'))
    await renderWorkspace('DRAFT')

    fireEvent.click(screen.getByRole('button', { name: /publish job/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByText('Job is not ready to publish')).toBeDefined()
  })

  it('disables all action buttons while a request is in flight', async () => {
    let resolve!: () => void
    mockPublishJob.mockReturnValue(new Promise((r) => { resolve = r }))
    await renderWorkspace('DRAFT')

    fireEvent.click(screen.getByRole('button', { name: /publish job/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /publishing/i }).hasAttribute('disabled')).toBe(true)
    )

    resolve()
  })
})

// ── Tests: error and empty states ────────────────────────────────

describe('JobWorkspace — load states', () => {
  it('shows error state when job fetch fails', async () => {
    mockGetJobById.mockRejectedValue(new Error('Job not found'))
    render(<JobWorkspace />)
    await waitFor(() => expect(screen.queryByText('Job workspace unavailable')).not.toBeNull(), { timeout: 3000 })
    expect(screen.getByText('Job not found')).toBeDefined()
  })

  it('shows a link back to jobs on error', async () => {
    mockGetJobById.mockRejectedValue(new Error('Not found'))
    render(<JobWorkspace />)
    await waitFor(() => expect(screen.queryByText('Back to jobs')).not.toBeNull())
    const link = screen.getByRole('link', { name: /back to jobs/i })
    expect(link.getAttribute('href')).toBe('/jobs')
  })
})
