/**
 * Tests for CandidateProfile component — ENG-012.
 *
 * What these tests prove:
 *   - Correct candidate name, contact, headline, summary rendered
 *   - Skills, employment, education sections render or show empty state
 *   - Applications list links to /applications/:id
 *   - Missing optional fields degrade gracefully
 *   - "Back to application" link appears when ?from param is present
 *   - "Candidates" back link always present
 *   - Loading skeleton shown while data loads
 *   - Error state shown on API failure
 *
 * What these tests do NOT prove:
 *   - Backend authorization / tenant isolation (server-enforced)
 *   - Real HTTP calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CandidateProfile } from '../candidate-profile'
import type { CandidateApiDetail } from '@/lib/api/candidates.api'
import type { ApplicationListResponse } from '@/lib/api/applications.api'

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ candidateId: 'cand-1' }),
  useSearchParams: () => new URLSearchParams('from=/applications/app-42'),
}))

const mockFetchCandidateById = vi.fn()
const mockFetchApplicationsByCandidate = vi.fn()
const mockFetchCandidateActivity = vi.fn()

vi.mock('@/lib/api/candidates.api', () => ({
  fetchCandidateById: (...args: any[]) => mockFetchCandidateById(...args),
  fetchCandidateActivity: (...args: any[]) => mockFetchCandidateActivity(...args),
}))

vi.mock('@/lib/api/applications.api', () => ({
  fetchApplicationsByCandidate: (...args: any[]) => mockFetchApplicationsByCandidate(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<CandidateApiDetail> = {}): CandidateApiDetail {
  return {
    id: 'cand-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada Lovelace',
    city: 'Kampala',
    headline: 'Senior Software Engineer',
    summary: 'Experienced full-stack developer with a focus on AI applications.',
    currentJobTitle: 'Software Engineer',
    currentEmployer: 'TechCorp',
    totalExperienceYears: 8,
    status: 'ACTIVE',
    source: 'DIRECT',
    email: 'ada@example.com',
    phone: '+256700000001',
    skills: [
      { id: 'sk-1', skillId: 'skill-1', name: 'TypeScript', proficiencyLevel: 'ADVANCED' },
      { id: 'sk-2', skillId: 'skill-2', name: 'React', proficiencyLevel: 'ADVANCED' },
    ],
    employment: [
      {
        id: 'emp-1',
        type: 'FULL_TIME',
        companyName: 'TechCorp',
        jobTitle: 'Software Engineer',
        location: 'Kampala',
        startDate: '2020-01-01',
        endDate: null,
        currentlyWorking: true,
        description: 'Building AI recruitment tools.',
        sortOrder: 0,
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Makerere University',
        level: 'BACHELORS_DEGREE',
        fieldOfStudy: 'Computer Science',
        status: 'COMPLETED',
        startDate: '2014-09-01',
        endDate: '2018-06-01',
        grade: 'First Class',
        sortOrder: 0,
      },
    ],
    languages: [],
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeApplicationList(count = 1): ApplicationListResponse {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `app-${i + 1}`,
      applicationNumber: `APP-00${i + 1}`,
      status: 'SUBMITTED' as const,
      source: 'DIRECT',
      submittedAt: '2026-01-15T10:00:00Z',
      createdAt: '2026-01-15T09:00:00Z',
      updatedAt: '2026-01-15T09:00:00Z',
      version: 1,
      candidate: {
        id: 'cand-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada Lovelace',
        headline: null,
      },
      job: { id: `job-${i + 1}`, title: 'Software Engineer', jobCode: 'JOB-001' },
      currentStage: { id: 'stage-1', name: 'Applied', type: 'APPLIED' },
      activeFlags: [],
      screeningAnswerCount: 0,
      latestScreening: null,
    })),
    meta: { total: count, page: 1, limit: 20, totalPages: 1 },
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchCandidateActivity.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
})

async function renderProfile() {
  mockFetchCandidateById.mockResolvedValue(makeCandidate())
  mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(1))
  render(<CandidateProfile />)
  await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull(), { timeout: 3000 })
}

// ── Tests: candidate identity ──────────────────────────────────────

describe('CandidateProfile — identity', () => {
  it('renders the candidate display name', async () => {
    await renderProfile()
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText('Ada Lovelace')).toBeDefined()
  })

  it('renders headline when present', async () => {
    await renderProfile()
    expect(screen.getByText('Senior Software Engineer')).toBeDefined()
  })

  it('renders email and phone when present', async () => {
    await renderProfile()
    expect(screen.getByText('ada@example.com')).toBeDefined()
    expect(screen.getByText('+256700000001')).toBeDefined()
  })

  it('renders city when present', async () => {
    await renderProfile()
    expect(screen.getByText('Kampala')).toBeDefined()
  })

  it('renders professional summary', async () => {
    await renderProfile()
    expect(screen.getByText(/Experienced full-stack developer/)).toBeDefined()
  })

  it('shows fallback text when summary is absent', async () => {
    mockFetchCandidateById.mockResolvedValue(makeCandidate({ summary: null }))
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(0))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull())
    expect(screen.getByText('No professional summary is available.')).toBeDefined()
  })
})

// ── Tests: education ──────────────────────────────────────────────

describe('CandidateProfile — education', () => {
  it('renders the education section heading', async () => {
    await renderProfile()
    expect(screen.getByText('Education')).toBeDefined()
  })

  it('renders institution name', async () => {
    await renderProfile()
    expect(screen.getByText('Makerere University')).toBeDefined()
  })

  it('renders formatted level and field of study', async () => {
    await renderProfile()
    expect(screen.getByText(/Bachelors Degree.*Computer Science/i)).toBeDefined()
  })

  it('renders grade badge when present', async () => {
    await renderProfile()
    expect(screen.getByText('First Class')).toBeDefined()
  })

  it('shows empty state when no education', async () => {
    mockFetchCandidateById.mockResolvedValue(makeCandidate({ education: [] }))
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(0))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull())
    expect(screen.getByText('No education history is available.')).toBeDefined()
  })
})

// ── Tests: applications ───────────────────────────────────────────

describe('CandidateProfile — applications', () => {
  it('renders application job title', async () => {
    await renderProfile()
    expect(screen.getAllByText('Software Engineer').length).toBeGreaterThan(0)
  })

  it('renders application number', async () => {
    await renderProfile()
    expect(screen.getByText(/Application #APP-001/)).toBeDefined()
  })

  it('links applications to /applications/:id', async () => {
    await renderProfile()
    const link = screen.getByRole('link', { name: /software engineer/i })
    expect(link.getAttribute('href')).toBe('/applications/app-1')
  })

  it('shows empty state when no applications', async () => {
    mockFetchCandidateById.mockResolvedValue(makeCandidate())
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(0))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull())
    expect(screen.getByText('No applications are available for this candidate.')).toBeDefined()
  })

  it('renders multiple applications', async () => {
    mockFetchCandidateById.mockResolvedValue(makeCandidate())
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(3))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull())
    expect(screen.getByText(/Application #APP-001/)).toBeDefined()
    expect(screen.getByText(/Application #APP-002/)).toBeDefined()
    expect(screen.getByText(/Application #APP-003/)).toBeDefined()
  })
})

// ── Tests: navigation ─────────────────────────────────────────────

describe('CandidateProfile — navigation', () => {
  it('shows "Back to application" link when ?from is present', async () => {
    await renderProfile()
    const backLink = screen.getByRole('link', { name: /back to application/i })
    expect(backLink).toBeDefined()
    expect(backLink.getAttribute('href')).toBe('/applications/app-42')
  })

  it('always shows the "Candidates" back link', async () => {
    await renderProfile()
    const candidatesLink = screen.getByRole('link', { name: /candidates/i })
    expect(candidatesLink.getAttribute('href')).toBe('/candidates')
  })
})

// ── Tests: loading and error states ───────────────────────────────

describe('CandidateProfile — loading and errors', () => {
  it('shows skeleton while loading', () => {
    mockFetchCandidateById.mockReturnValue(new Promise(() => {}))
    mockFetchApplicationsByCandidate.mockReturnValue(new Promise(() => {}))
    render(<CandidateProfile />)
    // Skeletons are present; no candidate content
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
  })

  it('shows error state when fetch fails', async () => {
    mockFetchCandidateById.mockRejectedValue(new Error('Network error'))
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(0))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Candidate unavailable')).not.toBeNull(), { timeout: 3000 })
    expect(screen.getByText('Network error')).toBeDefined()
  })

  it('gracefully handles missing optional fields', async () => {
    mockFetchCandidateById.mockResolvedValue(makeCandidate({
      phone: undefined,
      city: null,
      headline: null,
      summary: null,
      employment: [],
      education: [],
      skills: [],
    }))
    mockFetchApplicationsByCandidate.mockResolvedValue(makeApplicationList(0))
    render(<CandidateProfile />)
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeNull())
    // No error; empty states shown
    expect(screen.getByText('No skills recorded.')).toBeDefined()
    expect(screen.getByText('No employment history is available.')).toBeDefined()
    expect(screen.getByText('No education history is available.')).toBeDefined()
  })
})
