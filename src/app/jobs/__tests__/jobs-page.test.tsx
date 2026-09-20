/**
 * Jobs page: salary information must be available in the Create Job flow,
 * consistent with Edit Job. Covers:
 * - create dialog renders salary inputs
 * - create request carries the canonical salary fields
 * - minimum > maximum rejected client-side
 * - salary is optional (blank allowed)
 * - Edit Job still loads and shows salary values
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react"

const mockGetJobs = vi.fn()
const mockGetJobById = vi.fn()
const mockCreateJob = vi.fn()
const mockUpdateJob = vi.fn()

vi.mock("@/lib/api/jobs.api", () => ({
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  getJobById: (...args: unknown[]) => mockGetJobById(...args),
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  updateJob: (...args: unknown[]) => mockUpdateJob(...args),
  publishJob: vi.fn(),
  closeJob: vi.fn(),
  reopenJob: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  archiveJob: vi.fn(),
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
    Grid5: mock("Grid5"),
    Menu: mock("Menu"),
    Briefcase: mock("Briefcase"),
    Location: mock("Location"),
    DollarSquare: mock("DollarSquare"),
    People: mock("People"),
    Calendar: mock("Calendar"),
    Buildings: mock("Buildings"),
    DirectLeft: mock("DirectLeft"),
    DirectRight: mock("DirectRight"),
    RotateLeft: mock("RotateLeft"),
    InfoCircle: mock("InfoCircle"),
    More: mock("More"),
    TickCircle: mock("TickCircle"),
    CloseCircle: mock("CloseCircle"),
    Pause: mock("Pause"),
    Edit2: mock("Edit2"),
    Archive: mock("Archive"),
    ArrowDown2: mock("ArrowDown2"),
    Check: mock("Check"),
    DirectboxDefault: mock("DirectboxDefault"),
    CloseSquare: mock("CloseSquare"),
  }
})

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ title, description, actions, children }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </div>
  ),
}))

import JobsPage from "@/app/jobs/page"

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  jobCode: "JOB-1",
  title: "Senior Engineer",
  slug: "senior-engineer",
  department: null,
  location: null,
  employmentType: "FULL_TIME",
  workplaceType: "HYBRID",
  experienceLevel: "SENIOR",
  status: "DRAFT",
  visibility: "INTERNAL",
  approvalStatus: "NOT_REQUIRED",
  publicationStatus: "NOT_PUBLISHED",
  description: "A senior engineering role.",
  responsibilities: null,
  qualifications: null,
  numberOfOpenings: 1,
  salaryCurrency: "UGX",
  salaryMin: 2500000,
  salaryMax: 5000000,
  salaryVisible: true,
  applicationDeadline: null,
  owner: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  publishedAt: null,
  _count: { collaborators: 0, screeningQuestions: 0, skills: 0 },
  ...overrides,
})

async function openCreateDialog() {
  render(<JobsPage />)
  await waitFor(() => expect(screen.getByText("Senior Engineer")).toBeTruthy())
  fireEvent.click(screen.getByRole("button", { name: "Create Job" }))
  return await screen.findByRole("dialog")
}

describe("JobsPage salary fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockGetJobs.mockResolvedValue({ data: [makeJob()], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } })
    mockGetJobById.mockResolvedValue(makeJob())
  })

  afterEach(() => cleanup())

  it("create job dialog renders salary inputs", async () => {
    const dialog = await openCreateDialog()
    expect(within(dialog).getByLabelText("Minimum Salary")).toBeTruthy()
    expect(within(dialog).getByLabelText("Maximum Salary")).toBeTruthy()
    expect(within(dialog).getByRole("combobox", { name: "Currency" })).toBeTruthy()
  })

  it(
    "create request includes salary fields",
    async () => {
      const dialog = await openCreateDialog()
      fireEvent.change(within(dialog).getByPlaceholderText("e.g. Senior Software Engineer"), {
        target: { value: "DevOps Engineer" },
      })
      fireEvent.change(within(dialog).getByPlaceholderText("Describe the role, responsibilities, and requirements..."), {
        target: { value: "Runs the infrastructure." },
      })
      fireEvent.change(within(dialog).getByLabelText("Minimum Salary"), { target: { value: "2500000" } })
      fireEvent.change(within(dialog).getByLabelText("Maximum Salary"), { target: { value: "5000000" } })
      fireEvent.click(within(dialog).getByRole("combobox", { name: "Currency" }))
      fireEvent.click(await screen.findByRole("option", { name: "UGX" }))
      await waitFor(() =>
        expect(within(dialog).getByRole("combobox", { name: "Currency" }).textContent).toContain("UGX"),
      )
      fireEvent.click(within(dialog).getByRole("button", { name: "Create Job" }))
      await waitFor(() => expect(mockCreateJob).toHaveBeenCalled())
      const payload = mockCreateJob.mock.calls[0][0]
      expect(payload.salaryMin).toBe(2500000)
      expect(payload.salaryMax).toBe(5000000)
      expect(payload.salaryCurrency).toBe("UGX")
    },
    15000,
  )

  it("rejects minimum greater than maximum client-side", async () => {
    const dialog = await openCreateDialog()
    fireEvent.change(within(dialog).getByPlaceholderText("e.g. Senior Software Engineer"), {
      target: { value: "DevOps Engineer" },
    })
    fireEvent.change(within(dialog).getByPlaceholderText("Describe the role, responsibilities, and requirements..."), {
      target: { value: "Runs the infrastructure." },
    })
    fireEvent.change(within(dialog).getByLabelText("Minimum Salary"), { target: { value: "5000000" } })
    fireEvent.change(within(dialog).getByLabelText("Maximum Salary"), { target: { value: "2500000" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Job" }))
    await waitFor(() =>
      expect(screen.getByText("Minimum salary cannot be greater than maximum salary.")).toBeTruthy(),
    )
    expect(mockCreateJob).not.toHaveBeenCalled()
  })

  it("rejects negative salary values client-side", async () => {
    const dialog = await openCreateDialog()
    fireEvent.change(within(dialog).getByPlaceholderText("e.g. Senior Software Engineer"), {
      target: { value: "DevOps Engineer" },
    })
    fireEvent.change(within(dialog).getByPlaceholderText("Describe the role, responsibilities, and requirements..."), {
      target: { value: "Runs the infrastructure." },
    })
    fireEvent.change(within(dialog).getByLabelText("Minimum Salary"), { target: { value: "-100" } })
    // The input has min={0}: native constraint validation (real browsers AND
    // jsdom) blocks form submission for out-of-range values, so the job must
    // not be created and the dialog must stay open.
    const minInput = within(dialog).getByLabelText("Minimum Salary") as HTMLInputElement
    expect(minInput.checkValidity()).toBe(false)
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Job" }))
    await new Promise((r) => setTimeout(r, 300))
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(await screen.findByRole("dialog")).toBeTruthy()
  })

  it("salary is optional — blank salary still creates", async () => {
    const dialog = await openCreateDialog()
    fireEvent.change(within(dialog).getByPlaceholderText("e.g. Senior Software Engineer"), {
      target: { value: "DevOps Engineer" },
    })
    fireEvent.change(within(dialog).getByPlaceholderText("Describe the role, responsibilities, and requirements..."), {
      target: { value: "Runs the infrastructure." },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Job" }))
    await waitFor(() => expect(mockCreateJob).toHaveBeenCalled())
    const payload = mockCreateJob.mock.calls[0][0]
    expect(payload.salaryMin).toBeUndefined()
    expect(payload.salaryMax).toBeUndefined()
    expect(payload.salaryCurrency).toBeUndefined()
  })

  it("edit job dialog loads existing salary values", async () => {
    render(<JobsPage />)
    await waitFor(() => expect(screen.getByText("Senior Engineer")).toBeTruthy())
    // The fixture stores UGX; the grid card must render the stored currency,
    // not a hardcoded USD symbol.
    fireEvent.click(screen.getByText("UGX 2,500,000 – UGX 5,000,000"))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("UGX 2,500,000 – UGX 5,000,000")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }))
    expect((within(dialog).getByLabelText("Minimum Salary") as HTMLInputElement).value).toBe("2500000")
    expect((within(dialog).getByLabelText("Maximum Salary") as HTMLInputElement).value).toBe("5000000")
    expect(within(dialog).getByRole("combobox", { name: "Currency" }).textContent).toContain("UGX")
  })
})