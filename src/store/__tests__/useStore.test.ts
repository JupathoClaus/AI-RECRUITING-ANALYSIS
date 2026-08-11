import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Candidate, Job } from "@/types"

const mockMoveApplication = vi.fn()
const mockSubmitApplication = vi.fn()
const mockShortlistApplication = vi.fn()
const mockMarkApplicationHired = vi.fn()
const mockFetchApplicationById = vi.fn()
const mockFetchCandidates = vi.fn()
const mockFetchApplications = vi.fn()
const mockGetJobPipeline = vi.fn()
const mockFetchCandidatesScoreSummary = vi.fn()

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
  fetchCandidatesScoreSummary: (...args: unknown[]) => mockFetchCandidatesScoreSummary(...args),
  createCandidate: vi.fn(),
  mapCandidateFromApi: vi.fn((c: unknown) => c),
  buildApplicationInfo: vi.fn(),
}))

vi.mock("@/lib/api/jobs.api", () => ({
  getJobs: vi.fn().mockResolvedValue([]),
  getJobPipeline: (...args: unknown[]) => mockGetJobPipeline(...args),
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
const SCREENING_STAGE_ID = "stage-screening"
const PIPELINE_STAGES = [
  { id: SCREENING_STAGE_ID, name: "Screening", type: "SCREENING", sortOrder: 1 },
  { id: "stage-interview", name: "Interview", type: "INTERVIEW", sortOrder: 2 },
]

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
    aiScore: null,
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
  mockFetchCandidatesScoreSummary.mockResolvedValue(null)

  // Reset store before each test
  useStore.setState({
    candidates: [],
    candidatesScoreSummary: null,
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
  it("calls moveApplication with correct Screening stageId for non-DRAFT", async () => {
    const candidate = makeCandidate()
    useStore.setState({ candidates: [candidate] })

    mockFetchApplicationById.mockResolvedValue({
      id: APPLICATION_ID,
      status: "APPLIED",
      version: 1,
      stageId: STAGE_ID,
    })

    mockGetJobPipeline.mockResolvedValue({
      id: "pipeline-1",
      jobId: "job-1",
      stages: PIPELINE_STAGES,
    })

    mockMoveApplication.mockResolvedValue(undefined)
    mockFetchCandidates.mockResolvedValue({ data: [] })
    mockFetchApplications.mockResolvedValue({ data: [] })

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    expect(mockGetJobPipeline).toHaveBeenCalledWith("job-1")
    expect(mockMoveApplication).toHaveBeenCalledTimes(1)
    expect(mockMoveApplication).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedVersion: 1,
      toStageId: SCREENING_STAGE_ID,
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

    mockGetJobPipeline.mockResolvedValue({
      id: "pipeline-1",
      jobId: "job-1",
      stages: PIPELINE_STAGES,
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

    mockGetJobPipeline.mockResolvedValue({
      id: "pipeline-1",
      jobId: "job-1",
      stages: PIPELINE_STAGES,
    })

    mockMoveApplication.mockRejectedValue(new Error("Network error"))

    const store = useStore.getState()
    await store.advanceCandidateApplication(CANDIDATE_ID, "Screening")

    const state = useStore.getState()
    expect(state.candidatesError).toBe("Network error")
    expect(state.candidatesLoading).toBe(false)
  })

  describe("fetchCandidates", () => {
    it("loads the whole-company score summary alongside the candidate list", async () => {
      const summary = {
        totalCandidates: 120,
        scoredCandidates: 84,
        averageScore: 71,
        topCandidates: [
          {
            candidateId: "candidate-top",
            displayName: "Top Candidate",
            currentJobTitle: "Engineer",
            jobTitle: "Senior Engineer",
            status: "SCREENING",
            overallScore: 99,
          },
        ],
      }
      mockFetchCandidatesScoreSummary.mockResolvedValue(summary)
      mockFetchCandidates.mockResolvedValue({
        data: [{ id: "candidate-1" }],
        meta: { total: 120, page: 1, limit: 50 },
      })
      mockFetchApplications.mockResolvedValue({ data: [] })

      const store = useStore.getState()
      await store.fetchCandidates()

      expect(mockFetchCandidatesScoreSummary).toHaveBeenCalledTimes(1)
      const state = useStore.getState()
      expect(state.candidatesScoreSummary).toEqual(summary)
      expect(state.candidatesLoading).toBe(false)
    })

    it("keeps the summary null without failing when the aggregate endpoint errors", async () => {
      mockFetchCandidatesScoreSummary.mockRejectedValue(new Error("aggregate down"))
      mockFetchCandidates.mockResolvedValue({
        data: [{ id: "candidate-1" }],
        meta: { total: 1, page: 1, limit: 50 },
      })
      mockFetchApplications.mockResolvedValue({ data: [] })

      const store = useStore.getState()
      await store.fetchCandidates()

      const state = useStore.getState()
      expect(state.candidatesScoreSummary).toBeNull()
      expect(state.candidatesError).toBeNull()
      expect(state.candidatesLoading).toBe(false)
    })

    it("satisfies the >50-candidate requirement: the dashboard average comes from the aggregate, not the 50-row list", async () => {
      mockFetchCandidatesScoreSummary.mockResolvedValue({
        totalCandidates: 120,
        scoredCandidates: 100,
        averageScore: 61,
        topCandidates: [],
      })
      mockFetchCandidates.mockResolvedValue({
        data: Array.from({ length: 50 }, (_, i) => ({ id: `candidate-${i}` })),
        meta: { total: 120, page: 1, limit: 50 },
      })
      mockFetchApplications.mockResolvedValue({ data: [] })

      const store = useStore.getState()
      await store.fetchCandidates()

      const state = useStore.getState()
      expect(state.candidates).toHaveLength(50)
      expect(state.candidatesScoreSummary?.totalCandidates).toBe(120)
      expect(state.candidatesScoreSummary?.averageScore).toBe(61)
    })
  })
})
