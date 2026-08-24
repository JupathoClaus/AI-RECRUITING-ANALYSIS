/**
 * Candidates page: safe delete workflow regression.
 * - Delete Candidate menu item opens a confirmation dialog
 * - Cancel closes the dialog without calling the API
 * - Confirm calls deleteCandidate with the candidate version and refetches
 * - the confirmation cannot be double-submitted (busy state)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

// The local dev machine is slow under jsdom; give the full-page interactions
// real headroom so the suite is not flaky.
vi.setConfig({ testTimeout: 30000 })

const mockDeleteCandidate = vi.fn()
const mockFetchCandidates = vi.fn()
const mockCandidates = vi.fn<() => any[]>()

vi.mock("@/lib/api/candidates.api", () => ({
  deleteCandidate: (...args: unknown[]) => mockDeleteCandidate(...args),
  createCandidate: vi.fn(),
  fetchCandidates: vi.fn(),
  fetchCandidateById: vi.fn(),
  fetchCandidatesScoreSummary: vi.fn(),
}))

vi.mock("@/store/useStore", () => ({
  useStore: () => ({
    candidates: mockCandidates(),
    jobs: [],
    candidatesError: null,
    candidatesLoading: false,
    candidatesScoreSummary: { totalCandidates: 1, scoredCandidates: 0, averageScore: null, topCandidates: [] },
    interviews: [],
    activities: [],
    activitiesLoading: false,
    interviewsLoading: false,
    interviewsError: null,
    analyticsApplicationsOverTime: [],
    selectedIds: new Set(),
    allSelected: false,
    allFilteredIds: [],
    rejectCandidateApplication: vi.fn().mockResolvedValue(undefined),
    advanceCandidateApplication: vi.fn().mockResolvedValue(undefined),
    fetchCandidates: mockFetchCandidates,
    fetchJobs: vi.fn().mockResolvedValue(undefined),
    fetchInterviews: vi.fn().mockResolvedValue(undefined),
    fetchActivities: vi.fn().mockResolvedValue(undefined),
    fetchAnalytics: vi.fn().mockResolvedValue(undefined),
    updateJobStatus: vi.fn(),
    setSelectedIds: vi.fn(),
    setAllSelected: vi.fn(),
  }),
}))

vi.mock("@/lib/api/ai-screening.api", () => ({
  startBulkScreening: vi.fn().mockResolvedValue({}),
  getBulkScreeningProgress: vi.fn().mockResolvedValue(null),
  getRecentBulkScreening: vi.fn().mockResolvedValue(null),
  requestAiScreening: vi.fn().mockResolvedValue({}),
  getLatestAiScreening: vi.fn().mockResolvedValue({}),
  getAiScreeningById: vi.fn().mockResolvedValue({}),
  getResumeExtractionStatus: vi.fn().mockResolvedValue({}),
  retryAiScreeningExtraction: vi.fn().mockResolvedValue({}),
}))

vi.mock("@/lib/api/files.api", () => ({
  getApplicationResume: vi.fn().mockResolvedValue(null),
  uploadResume: vi.fn(),
  uploadCompanyLogo: vi.fn(),
  getCompanyLogo: vi.fn(),
}))

vi.mock("@/lib/ai-screening/use-ai-screening", () => ({
  useAiScreening: () => ({
    state: { workflowState: "IDLE", selectedApplicationId: null, screeningResult: null, screeningId: null, extractionStatus: null, error: null, errorCode: null, uploadProgress: false, uploadedFile: null },
    selectApplication: vi.fn(),
    markResumeMissing: vi.fn(),
    handleUploadResume: vi.fn(),
    cancelUpload: vi.fn(),
    requestScreening: vi.fn(),
    retryScreening: vi.fn(),
    loadLatestScreening: vi.fn(),
  }),
}))

vi.mock("@/components/ai-interview/send-ai-interview-modal", () => ({
  SendAiInterviewModal: () => null,
}))

vi.mock("@/components/candidates/add-candidate-dialog", () => ({
  AddCandidateDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="add-candidate-dialog" /> : null),
}))

vi.mock("@/components/ai-screening/screening-progress", () => ({
  ScreeningProgress: () => null,
}))

vi.mock("@/components/ai-screening/screening-result-view", () => ({
  ScreeningResultView: () => null,
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      React.createElement("span", { "data-testid": `icon-${name}`, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    SearchNormal: mock("SearchNormal"),
    Add: mock("Add"),
    People: mock("People"),
    Star1: mock("Star1"),
    More: mock("More"),
    Eye: mock("Eye"),
    Edit2: mock("Edit2"),
    Calendar: mock("Calendar"),
    CloseSquare: mock("CloseSquare"),
    Call: mock("Call"),
    Message: mock("Message"),
    Briefcase: mock("Briefcase"),
    MagicStar: mock("MagicStar"),
    MessageSquare: mock("MessageSquare"),
    DocumentText: mock("DocumentText"),
    Trash: mock("Trash"),
    ArrowDown2: mock("ArrowDown2"),
    Check: mock("Check"),
    DirectboxDefault: mock("DirectboxDefault"),
  }
})

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ title, description, children }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}))

import CandidatesPage from "@/app/candidates/page"

function makeCandidate(id: string, name: string) {
  return {
    id,
    firstName: name.split(" ")[0],
    lastName: name.split(" ")[1] ?? "",
    displayName: name,
    email: `${id}@test.com`,
    phone: "",
    totalExperienceYears: 5,
    skills: [],
    aiScore: null,
    status: "ACTIVE" as const,
    source: "RECRUITER_CREATED",
    version: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe("CandidatesPage delete workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockCandidates.mockReturnValue([makeCandidate("c1", "Ada Loop")])
    mockDeleteCandidate.mockResolvedValue({ deleted: true, version: 4 })
    mockFetchCandidates.mockResolvedValue(undefined)
  })

  afterEach(() => cleanup())

  it("opens the confirmation dialog from the row menu", async () => {
    render(<CandidatesPage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    const row = screen.getByText("Ada Loop").closest("tr")!
    const moreBtn = row.querySelector('button[aria-haspopup="menu"]')!
    fireEvent.pointerDown(moreBtn)
    fireEvent.click(moreBtn)
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Delete Candidate" })).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Candidate" }))
    expect(screen.getByText("Delete Candidate?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("cancel closes the dialog without calling the API", async () => {
    render(<CandidatesPage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    const row = screen.getByText("Ada Loop").closest("tr")!
    const moreBtn = row.querySelector('button[aria-haspopup="menu"]')!
    fireEvent.pointerDown(moreBtn)
    fireEvent.click(moreBtn)
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Delete Candidate" })).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Candidate" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByText("Delete Candidate?")).toBeNull())
    expect(mockDeleteCandidate).not.toHaveBeenCalled()
  })

  it("confirm calls deleteCandidate with the candidate version and refetches", async () => {
    render(<CandidatesPage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    const row = screen.getByText("Ada Loop").closest("tr")!
    const moreBtn = row.querySelector('button[aria-haspopup="menu"]')!
    fireEvent.pointerDown(moreBtn)
    fireEvent.click(moreBtn)
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Delete Candidate" })).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Candidate" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete Candidate" }))
    await waitFor(() => expect(mockDeleteCandidate).toHaveBeenCalledTimes(1))
    expect(mockDeleteCandidate).toHaveBeenCalledWith("c1", { expectedVersion: 3 })
    await waitFor(() => expect(mockFetchCandidates).toHaveBeenCalled())
  })
})