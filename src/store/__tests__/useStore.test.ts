import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Candidate, Job } from "@/types"

const mockMoveApplication = vi.fn()
const mockSubmitApplication = vi.fn()
const mockShortlistApplication = vi.fn()
const mockMarkApplicationHired = vi.fn()
const mockFetchApplicationById = vi.fn()
const mockFetchCandidates = vi.fn()
const mockFetchApplications = vi.fn()

vi.mock("@/lib/api/applications.api", () => ({
  moveApplication: (...args: unknown[]) => mockMoveApplication(...args),
  submitApplication: (...args: unknown[]) => mockSubmitApplication(...args),
  shortlistApplication: (...args: unknown[]) => mockShortlistApplication(...args),
  markApplicationHired: (...args: unknown[]) => mockMarkApplicationHired(...args),
  fetchApplicationById: (...args: unknown[]) => mockFetchApplicationById(...args),
  fetchApplications: (...args: unknown[]) => mockFetchApplications(...args),
  rejectApplication: vi.fn(),
  createApplication: vi.fn(),
}))

vi.mock("@/lib/api/candidates.api", () => ({
  fetchCandidates: (...args: unknown[]) => mockFetchCandidates(...args),
  createCandidate: vi.fn(),
  mapCandidateFromApi: vi.fn((c: unknown) => c),
  buildApplicationInfo: vi.fn(),
}))

vi.mock("@/lib/api/jobs.api", () => ({
  getJobs: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/api/interviews.api", () => ({
  fetchInterviews: vi.fn().mockResolvedValue({ data: [] }),
  cancelInterview: vi.fn(),
  completeInterview: vi.fn(),
  createInterview: vi.fn(),
  startInterview: vi.fn(),
  confirmInterview: vi.fn(),
  rescheduleInterview: vi.fn(),
  recordResult: vi.fn(),
  mapInterviewListItem: vi.fn(),
  mapFrontendToBackendType: vi.fn(),
}))

vi.mock("@/lib/api/analytics.api", () => ({
  getAnalyticsOverview: vi.fn(),
  getAnalyticsFunnel: vi.fn(),
  getAnalyticsDepartments: vi.fn(),
  getAnalyticsSources: vi.fn(),
  getAnalyticsTimeToHire: vi.fn(),
}))

import { useStore } from "@/store/useStore"

const CANDIDATE_ID = "candidate-1"
const APPLICATION_ID = "app-1"
const STAGE_ID = "stage-1"

function makeCandidate(overrides?: Partial<Candidate>): Candidate {
  return {
    id: CANDIDATE_ID,
    name: "Test",
    email: "test@test.com",
    phone: "",
    jobId: "job-1",
    jobTitle: "Engineer",
    status: "active",
    matchScore: 0,
    appliedDate: new Date().toISOString(),
    experience: 5,
    skills: [],
    aiScore: 0,
    rating: 0,
    notes: "",
    applicationSummary: {
      current: {
        id: APPLICATION_ID,
        jobId: "job-1",
        jobTitle: "Engineer",
        status: "APPLIED",
        stageId: STAGE_ID,
        stageName: "Applied",
        createdAt: new Date().toISOString(),
        version: 1,
      },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  // Reset store before each test
  useStore.setState({
    candidates: [],
    jobs: [],
    candidatesLoading: false,
    candidatesError: null,
    interviews: [],
    interviewsLoading: false,
    interviewsError: null,
    analyticsOverview: null,
    analyticsFunnel: [],
    analyticsDepartments: [],
    analyticsSources: [],
    analyticsTimeToHire: [],
    analyticsLoading: false,
    analyticsError: null,
  })
})

describe("advanceCandidateApplication", () => {
  it("calls moveApplication with toStageId for non-DRAFT Screening", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "APPLIED",
      version: 1,
      stageId: STAGE_ID,
    })

    mockMoveApplication.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    expect(mockMoveApplication).toHaveBeenCalledTimes(1)
    expect(mockMoveApplication).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedVersion: 1,
      toStageId: STAGE_ID,
    })
  })

  it("returns early when candidate is missing", async () => {
    const store = useStore.getState()
    await store.advanceCandidateApplication("nonexistent", "Screening")

    expect(mockMoveApplication).not.toHaveBeenCalled()
    expect(mockFetchApplicationById).not.toHaveBeenCalled()
  })

  it("returns early when applicationSummary is missing", async () => {
    const candidate = makeCandidate({ applicationSummary: undefined })
    useStore.setState({ candidates: [candidate] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    expect(mockMoveApplication).not.toHaveBeenCalled()
    expect(mockFetchApplicationById).not.toHaveBeenCalled()
  })

  it("calls shortlistApplication for Interview status", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "SCREENING",
      version: 2,
    })

    mockShortlistApplication.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Interview")

    expect(mockShortlistApplication).toHaveBeenCalledTimes(1)
    expect(mockShortlistApplication).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedVersion: 2,
    })
    expect(mockMoveApplication).not.toHaveBeenCalled()
  })

  it("calls markApplicationHired for Hired status", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "OFFER",
      version: 3,
    })

    mockMarkApplicationHired.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Hired")

    expect(mockMarkApplicationHired).toHaveBeenCalledTimes(1)
    expect(mockMarkApplicationHired).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedVersion: 3,
    })
    expect(mockMoveApplication).not.toHaveBeenCalled()
  })

  it("calls submitApplication for DRAFT Screening", async () => {
    const candidate = makeCandidate({
      applicationSummary: {
        current: {
          id: APPLICATION_ID,
          jobId: "job-1",
          jobTitle: "Engineer",
          status: "DRAFT",
          stageId: STAGE_ID,
          stageName: "Draft",
          createdAt: new Date().toISOString(),
          version: 1,
        },
      },
    })
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "DRAFT",
      version: 1,
    })

    mockSubmitApplication.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    expect(mockSubmitApplication).toHaveBeenCalledTimes(1)
    expect(mockSubmitApplication).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedVersion: 1,
      consentConfirmed: true,
    })
    expect(mockMoveApplication).not.toHaveBeenCalled()
  })

  it("does not call moveApplication twice for Screening (no twin-branch)", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "APPLIED",
      version: 1,
      stageId: STAGE_ID,
    })

    mockMoveApplication.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    // The twin-branch bug would call moveApplication twice
    // The fix should call it exactly once
    expect(mockMoveApplication).toHaveBeenCalledTimes(1)
  })

  it("sets error state on API failure", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "APPLIED",
      version: 1,
      stageId: STAGE_ID,
    })

    mockMoveApplication.mockRejectedValue(new Error("Network error"))

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    const state = useStore.getState()
    expect(state.candidatesError).toBe("Network error")
    expect(state.candidatesLoading).toBe(false)
  })
})
