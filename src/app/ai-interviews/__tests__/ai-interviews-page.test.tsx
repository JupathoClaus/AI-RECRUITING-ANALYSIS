/**
 * The AI Interviews page must never render hardcoded candidates, metrics or
 * sessions. An empty tenant renders an honest empty state; real API errors
 * surface as failure states; unavailable controls cannot imply success.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

const mockGetAiInterview = vi.fn()
const mockCreateAiInterview = vi.fn()
const mockGetByApplication = vi.fn()
const mockListAiInterviews = vi.fn()

vi.mock("@/lib/api/ai-interviews.api", () => ({
  createAiInterview: (...args: unknown[]) => mockCreateAiInterview(...args),
  getAiInterview: (...args: unknown[]) => mockGetAiInterview(...args),
  getAiInterviewsByApplication: (...args: unknown[]) => mockGetByApplication(...args),
  listAiInterviews: (...args: unknown[]) => mockListAiInterviews(...args),
  sendAiInterviewInvitation: vi.fn().mockResolvedValue({ sent: true, sentAt: "", codeHint: "" }),
  cancelAiInterview: vi.fn().mockResolvedValue({ cancelled: true }),
  regenerateAiInterviewCode: vi.fn().mockResolvedValue({ rawCode: "NEW-CODE", displayHint: "NEW-CODE" }),
}))

const makeCandidate = (id: string, name: string) => ({
  id,
  firstName: name.split(" ")[0],
  lastName: name.split(" ")[1] ?? "",
  displayName: name,
  email: `${id}@test.com`,
  phone: "",
  totalExperienceYears: 5,
  skills: [],
  aiScore: null,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
  applicationSummary: {
    total: 1,
    active: 1,
    current: {
      id: `app-${id}`,
      candidateId: id,
      jobId: "job-1",
      jobTitle: "Senior Engineer",
      status: "SUBMITTED",
      displayStatus: "Applied",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
})

vi.mock("@/store/useStore", () => ({
  useStore: vi.fn(() => ({
    candidates: [makeCandidate("c1", "Ada Lovelace")],
    jobs: [{ id: "job-1", title: "Senior Engineer", status: "Active" }],
    fetchCandidates: vi.fn().mockResolvedValue(undefined),
    fetchJobs: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) => React.createElement("span", { "data-testid": `icon-${name}`, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    MagicStar: mock("MagicStar"),
    DocumentText: mock("DocumentText"),
    Clock: mock("Clock"),
    Link2: mock("Link2"),
    Warning2: mock("Warning2"),
    Send2: mock("Send2"),
    Refresh: mock("Refresh"),
    Eye: mock("Eye"),
    DirectboxDefault: mock("DirectboxDefault"),
    CloseSquare: mock("CloseSquare"),
    Check: mock("Check"),
    ArrowDown2: mock("ArrowDown2"),
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

import AIInterviewsPage from "@/app/ai-interviews/page"

describe("AIInterviewsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetByApplication.mockResolvedValue([])
    mockListAiInterviews.mockResolvedValue([])
  })

  afterEach(() => cleanup())

  it("renders an honest empty state instead of hardcoded sessions", async () => {
    render(<AIInterviewsPage />)
    await waitFor(() => {
      expect(screen.getByText("No AI interviews yet")).toBeTruthy()
    })
    expect(screen.queryByText("Emily Chen")).toBeNull()
    expect(screen.queryByText("Total AI Interviews")).toBeNull()
    expect(screen.queryByText("47")).toBeNull()
  })

  it("creates an interview through the real API and shows the real record", async () => {
    mockCreateAiInterview.mockResolvedValue({
      id: "int-1",
      applicationId: "app-c1",
      companyId: "co-1",
      provider: "MOCK",
      status: "CREATED",
      codeDisplayHint: "AB12",
      rawCode: "AB12-CD34",
      language: "en",
      estimatedDurationMinutes: 30,
      expiresAt: null,
      createdAt: "2026-08-01T10:00:00Z",
      application: {
        candidate: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@test.com",
        },
        job: { title: "Senior Engineer" },
      },
    })
    mockGetAiInterview.mockResolvedValue({
      id: "int-1",
      applicationId: "app-c1",
      provider: "MOCK",
      status: "CREATED",
      codeDisplayHint: "AB12",
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
      transcriptStatus: "NOT_REQUESTED",
      transcriptUrl: null,
      transcript: null,
      recordingStatus: null,
      recordingUrl: null,
      language: "en",
      estimatedDurationMinutes: 30,
      expiresAt: null,
      notes: null,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      application: {
        candidate: {
          id: "c1",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@test.com",
        },
        job: { id: "job-1", title: "Senior Engineer" },
      },
    })

    render(<AIInterviewsPage />)
    await waitFor(() => {
      expect(screen.getByText("No AI interviews yet")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /Create AI Interview/i }))
    await waitFor(() => {
      expect(screen.getByText("Candidate & Position")).toBeTruthy()
    })

    // Select the candidate application option.
    fireEvent.click(screen.getAllByRole("combobox")[0])
    await waitFor(() => {
      fireEvent.click(screen.getByText("Ada Lovelace — Senior Engineer"))
    })

    fireEvent.click(screen.getByRole("button", { name: /^Create Interview$/i }))
    await waitFor(() => {
      expect(mockCreateAiInterview).toHaveBeenCalledWith({
        applicationId: "app-c1",
        language: "en",
        estimatedDurationMinutes: 30,
      })
    })

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeTruthy()
      expect(screen.getAllByText(/Created/i).length).toBeGreaterThan(0)
      expect(screen.queryByText("Emily Chen")).toBeNull()
    })
  }, 15000)

  it("loads persisted interviews on mount", async () => {
    mockListAiInterviews.mockResolvedValue([
      {
        id: "persisted-1",
        applicationId: "app-c1",
        provider: "MOCK",
        status: "SENT",
        codeDisplayHint: "AB12",
        invitationSentAt: "2026-08-01T10:00:00Z",
        invitationEmail: "ada@test.com",
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
        transcriptStatus: "NOT_REQUESTED",
        transcriptUrl: null,
        transcript: null,
        recordingStatus: null,
        recordingUrl: null,
        language: "en",
        estimatedDurationMinutes: 30,
        expiresAt: null,
        notes: null,
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T10:00:00Z",
        application: {
          candidate: {
            id: "c1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@test.com",
          },
          job: { id: "job-1", title: "Senior Engineer" },
        },
      },
    ])

    render(<AIInterviewsPage />)
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeTruthy())
    expect(screen.queryByText("No AI interviews yet")).toBeNull()
  })

  it("shows an initial load failure instead of an empty state", async () => {
    mockListAiInterviews.mockRejectedValue(new Error("Interview service unavailable"))
    render(<AIInterviewsPage />)
    await waitFor(() => expect(screen.getByText("Interview service unavailable")).toBeTruthy())
    expect(screen.queryByText("No AI interviews yet")).toBeNull()
  })

  it("renders a failure state when creation fails", async () => {
    mockCreateAiInterview.mockRejectedValue(new Error("Application not found"))

    render(<AIInterviewsPage />)
    await waitFor(() => {
      expect(screen.getByText("No AI interviews yet")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /Create AI Interview/i }))
    await waitFor(() => {
      expect(screen.getByText("Candidate & Position")).toBeTruthy()
    })
    fireEvent.click(screen.getAllByRole("combobox")[0])
    await waitFor(() => {
      fireEvent.click(screen.getByText("Ada Lovelace — Senior Engineer"))
    })
    fireEvent.click(screen.getByRole("button", { name: /^Create Interview$/i }))

    await waitFor(() => {
      expect(screen.getByText("Application not found")).toBeTruthy()
    })
  })

  it("keeps Create Interview disabled until a candidate and a valid duration are set", async () => {
    render(<AIInterviewsPage />)
    await waitFor(() => {
      expect(screen.getByText("No AI interviews yet")).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: /Create AI Interview/i }))
    await waitFor(() => {
      expect(screen.getByText("Candidate & Position")).toBeTruthy()
    })

    const createBtn = () => screen.getByRole("button", { name: /^Create Interview$/i })
    const durationInput = screen.getByRole("spinbutton")

    // No candidate selected yet: disabled even with a valid duration.
    expect(createBtn().hasAttribute("disabled")).toBe(true)

    // Select the candidate application option.
    fireEvent.click(screen.getAllByRole("combobox")[0])
    await waitFor(() => {
      fireEvent.click(screen.getByText("Ada Lovelace — Senior Engineer"))
    })

    // Invalid durations keep the button disabled and surface a hint.
    for (const bad of ["0", "-5", "121", "500"]) {
      fireEvent.change(durationInput, { target: { value: bad } })
      expect(createBtn().hasAttribute("disabled")).toBe(true)
      expect(screen.getByText(/between 5 and 120 minutes/i)).toBeTruthy()
    }

    // Non-numeric / empty input also keeps the button disabled (no hint needed
    // for an empty field).
    for (const bad of ["abc", ""]) {
      fireEvent.change(durationInput, { target: { value: bad } })
      expect(createBtn().hasAttribute("disabled")).toBe(true)
      expect(screen.queryByText(/between 5 and 120 minutes/i)).toBeNull()
    }

    // Backend lower/upper bounds are valid.
    for (const ok of ["5", "120"]) {
      fireEvent.change(durationInput, { target: { value: ok } })
      expect(createBtn().hasAttribute("disabled")).toBe(false)
      expect(screen.queryByText(/between 5 and 120 minutes/i)).toBeNull()
    }

    fireEvent.change(durationInput, { target: { value: "45" } })
    fireEvent.click(createBtn())
    await waitFor(() => {
      expect(mockCreateAiInterview).toHaveBeenCalledWith({
        applicationId: "app-c1",
        language: "en",
        estimatedDurationMinutes: 45,
      })
    })
  })

  it("shows the empty candidate state when the tenant has candidates without applications", async () => {
    const candidatesWithoutApps = [
      {
        id: "c1",
        firstName: "Ada",
        lastName: "Lovelace",
        displayName: "Ada Lovelace",
        email: "ada@test.com",
        phone: "",
        totalExperienceYears: 5,
        skills: [],
        aiScore: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        applicationSummary: { total: 0, active: 0 },
      },
    ]
    const { useStore } = await import("@/store/useStore")
    vi.mocked(useStore).mockReturnValue({
      candidates: candidatesWithoutApps,
      jobs: [{ id: "job-1", title: "Senior Engineer", status: "Active" }],
      fetchCandidates: vi.fn().mockResolvedValue(undefined),
      fetchJobs: vi.fn().mockResolvedValue(undefined),
    })

    render(<AIInterviewsPage />)
    await waitFor(() => {
      expect(screen.getByText("No AI interviews yet")).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: /Create AI Interview/i }))
    await waitFor(() => {
      expect(screen.getByText("No candidates available")).toBeTruthy()
    })
    expect(screen.getByRole("button", { name: /^Create Interview$/i }).hasAttribute("disabled")).toBe(true)
  })
})
