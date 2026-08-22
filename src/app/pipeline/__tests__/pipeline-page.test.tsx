/**
 * Pipeline page: the board must render (never a blank canvas). Covers:
 * - All Positions aggregates stage columns across jobs by stage name
 * - candidates map to the correct stage column + counts
 * - active pipeline counter
 * - position filter isolates a job's candidates
 * - search filters candidates
 * - no-candidate state still renders columns
 * - real score 0 renders as 0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react"

const mockGetJobPipeline = vi.fn()
const mockMoveApplication = vi.fn()
const mockRejectApplication = vi.fn()
const mockFetchCandidates = vi.fn()
const mockFetchJobs = vi.fn()

vi.mock("@/lib/api/jobs.api", () => ({
  getJobPipeline: (...args: unknown[]) => mockGetJobPipeline(...args),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
  reorderPipelineStages: vi.fn(),
}))

vi.mock("@/lib/api/applications.api", () => ({
  moveApplication: (...args: unknown[]) => mockMoveApplication(...args),
  rejectApplication: (...args: unknown[]) => mockRejectApplication(...args),
}))

vi.mock("@/store/useStore", () => ({
  useStore: () => ({
    candidates: mockCandidates,
    jobs: mockJobs,
    candidatesError: null,
    fetchCandidates: mockFetchCandidates,
    fetchJobs: mockFetchJobs,
  }),
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
    People: mock("People"),
    Briefcase: mock("Briefcase"),
    MagicStar: mock("MagicStar"),
    Star1: mock("Star1"),
    Message: mock("Message"),
    Call: mock("Call"),
    Document: mock("Document"),
    ArrowLeft: mock("ArrowLeft"),
    ArrowRight: mock("ArrowRight"),
    CloseSquare: mock("CloseSquare"),
    Calendar: mock("Calendar"),
    MessageSquare: mock("MessageSquare"),
    Add: mock("Add"),
    Trash: mock("Trash"),
    Edit2: mock("Edit2"),
    TickCircle: mock("TickCircle"),
    ArrowDown2: mock("ArrowDown2"),
    Check: mock("Check"),
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

import PipelinePage from "@/app/pipeline/page"

const JOB_A = "job-a"
const JOB_B = "job-b"

const STAGES = [
  { id: "stage-a1", name: "Applied", type: "APPLIED", description: null, sortOrder: 0, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
  { id: "stage-a2", name: "Screening", type: "SCREENING", description: null, sortOrder: 1, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
  { id: "stage-a3", name: "Interview", type: "RECRUITER_INTERVIEW", description: null, sortOrder: 2, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
  { id: "stage-a4", name: "Offer", type: "OFFER", description: null, sortOrder: 3, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
  { id: "stage-a5", name: "Hired", type: "HIRED", description: null, sortOrder: 4, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
  { id: "stage-a6", name: "Rejected", type: "REJECTED", description: null, sortOrder: 5, required: true, autoAdvanceEnabled: false, requiresRecruiterApproval: false, slaHours: null, interviewType: null, assessmentTemplateId: null, configuration: null, isActive: true, createdAt: "", updatedAt: "" },
]

const STAGES_B = STAGES.map((s, i) => ({ ...s, id: `stage-b${i + 1}` }))

let mockCandidates: any[] = []
let mockJobs: any[] = []

function makeCandidate(id: string, name: string, stageId: string, stageName: string, jobId: string, jobTitle: string, aiScore: number | null, status: string) {
  return {
    id,
    firstName: name.split(" ")[0],
    lastName: name.split(" ")[1] ?? "",
    displayName: name,
    email: `${id}@test.com`,
    phone: "",
    avatar: null,
    totalExperienceYears: 5,
    skills: [],
    aiScore,
    notes: null,
    companyProfile: { rating: 0 },
    currentJobTitle: "",
    applicationSummary: {
      total: 1,
      active: 1,
      current: {
        id: `app-${id}`,
        candidateId: id,
        jobId,
        jobTitle,
        status,
        displayStatus: status === "HIRED" ? "Hired" : status === "REJECTED" ? "Rejected" : "Applied",
        version: 1,
        stageId,
        stageName,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  }
}

function setup(overrides: { candidates?: any[]; jobs?: any[]; jobPipelines?: Record<string, typeof STAGES> } = {}) {
  mockCandidates = overrides.candidates ?? []
  mockJobs = overrides.jobs ?? [
    { id: JOB_A, title: "Backend Engineer" },
    { id: JOB_B, title: "Data Analyst" },
  ]
  const pipelines = overrides.jobPipelines ?? { [JOB_A]: STAGES, [JOB_B]: STAGES_B }
  mockGetJobPipeline.mockImplementation((jobId: string) =>
    Promise.resolve({ id: `pipeline-${jobId}`, jobId, stages: pipelines[jobId] ?? [] }),
  )
  mockMoveApplication.mockResolvedValue({ success: true })
  mockRejectApplication.mockResolvedValue({ success: true })
}

describe("PipelinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    setup()
  })

  afterEach(() => cleanup())

  it("renders aggregated stage columns in All Positions (not blank)", async () => {
    setup({
      candidates: [makeCandidate("c1", "Ada Loop", "stage-a1", "Applied", JOB_A, "Backend Engineer", 78, "DRAFT")],
    })
    render(<PipelinePage />)
    for (const name of ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]) {
      await waitFor(() => expect(screen.getByText(name)).toBeTruthy(), { timeout: 3000 })
    }
    expect(screen.queryByText("No pipeline stages")).toBeNull()
  })

  it("places candidates in the correct stage column with correct counts", async () => {
    setup({
      candidates: [
        makeCandidate("c1", "Ada Loop", "stage-a1", "Applied", JOB_A, "Backend Engineer", 78, "DRAFT"),
        makeCandidate("c2", "Ben Code", "stage-b2", "Screening", JOB_B, "Data Analyst", null, "SCREENING"),
      ],
    })
    render(<PipelinePage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy(), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText("Ben Code")).toBeTruthy(), { timeout: 3000 })
    const headerRow = screen.getByText("Applied").closest("div")?.parentElement
    const appliedCol = headerRow?.parentElement
    expect(appliedCol?.textContent).toContain("Ada Loop")
    expect(appliedCol?.textContent).not.toContain("Ben Code")
    const screeningRow = screen.getByText("Screening").closest("div")?.parentElement
    const screeningCol = screeningRow?.parentElement
    expect(screeningCol?.textContent).toContain("Ben Code")
    expect(screeningCol?.textContent).not.toContain("Ada Loop")
    const appliedBadge = headerRow?.querySelector("span.rounded-full")
    expect(appliedBadge?.textContent).toBe("1")
  })

  it("shows the active pipeline count in the header", async () => {
    setup({
      candidates: [
        makeCandidate("c1", "Ada Loop", "stage-a1", "Applied", JOB_A, "Backend Engineer", 78, "DRAFT"),
        makeCandidate("c2", "Hired Ann", "stage-a5", "Hired", JOB_A, "Backend Engineer", 90, "HIRED"),
        makeCandidate("c3", "No App Cal", "stage-a1", "Applied", JOB_A, "Backend Engineer", 50, "DRAFT"),
      ],
    })
    render(<PipelinePage />)
    await waitFor(() => expect(screen.getByText(/candidates · /)).toBeTruthy(), { timeout: 3000 })
    expect(screen.getByText("3 candidates · 2 in active pipeline")).toBeTruthy()
  })

  it("position filter shows only the selected job's candidates", async () => {
    setup({
      candidates: [
        makeCandidate("c1", "Ada Loop", "stage-a1", "Applied", JOB_A, "Backend Engineer", 78, "DRAFT"),
        makeCandidate("c2", "Ben Code", "stage-b2", "Screening", JOB_B, "Data Analyst", null, "SCREENING"),
      ],
    })
    render(<PipelinePage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.click(await screen.findByRole("option", { name: "Backend Engineer" }))
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText("Ben Code")).toBeNull()
    expect(mockGetJobPipeline).toHaveBeenCalledWith(JOB_A)
  })

  it("search hides nonmatching candidates and restores on clear", async () => {
    setup({
      candidates: [
        makeCandidate("c1", "Ada Loop", "stage-a1", "Applied", JOB_A, "Backend Engineer", 78, "DRAFT"),
        makeCandidate("c2", "Ben Code", "stage-a1", "Applied", JOB_A, "Backend Engineer", 50, "DRAFT"),
      ],
    })
    render(<PipelinePage />)
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy(), { timeout: 3000 })
    fireEvent.change(screen.getByPlaceholderText("Search candidates by name, email, or position..."), {
      target: { value: "Ben" },
    })
    await waitFor(() => expect(screen.queryByText("Ada Loop")).toBeNull(), { timeout: 3000 })
    expect(screen.getByText("Ben Code")).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText("Search candidates by name, email, or position..."), {
      target: { value: "" },
    })
    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy(), { timeout: 3000 })
  })

  it("renders stage columns even when no candidates exist", async () => {
    setup({ candidates: [] })
    render(<PipelinePage />)
    for (const name of ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]) {
      await waitFor(() => expect(screen.getByText(name)).toBeTruthy(), { timeout: 3000 })
    }
    expect(screen.getAllByText("No candidates").length).toBeGreaterThanOrEqual(6)
  })

  it("renders a real score of 0 as 0 on the candidate card", async () => {
    setup({
      candidates: [makeCandidate("c1", "Zero Score", "stage-a1", "Applied", JOB_A, "Backend Engineer", 0, "DRAFT")],
    })
    render(<PipelinePage />)
    await waitFor(() => expect(screen.getByText("Zero Score")).toBeTruthy(), { timeout: 3000 })
    const card = screen.getByText("Zero Score").closest(".group")
    expect(card).toBeTruthy()
    expect(within(card as HTMLElement).getByText("0")).toBeTruthy()
  })
})