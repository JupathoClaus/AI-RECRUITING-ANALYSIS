/**
 * Candidate comparison (Phase 1): evidence table, never a winner.
 * - Renders side-by-side columns for each candidate selected via ?ids=
 * - Pulls profile, latest application and latest COMPLETED screening
 * - No fabricated values: unscreened candidates render — / "Not recommended"
 *   verdicts are dropped; a plain value is never invented
 * - The page explicitly disclaims an automatic winner
 * - Empty state points back to the Candidates page when no ids arrive
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, waitFor, cleanup } from "@testing-library/react"

vi.setConfig({ testTimeout: 30000 })

const byId = vi.hoisted(() => vi.fn())
const appsByCandidate = vi.hoisted(() => vi.fn())
const latestScreening = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/candidates.api", () => ({
  fetchCandidateById: (...args: unknown[]) => byId(...args),
  mapToDisplayStatus: (s: string) => s.replace(/_/g, " ").toLowerCase(),
}))

vi.mock("@/lib/api/applications.api", () => ({
  fetchApplicationsByCandidate: (...args: unknown[]) => appsByCandidate(...args),
}))

vi.mock("@/lib/api/ai-screening.api", () => ({
  getLatestAiScreening: (...args: unknown[]) => latestScreening(...args),
}))

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ title, description, children, actions }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </div>
  ),
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      React.createElement("span", { "data-testid": `icon-${name}`, "aria-hidden": true, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    ArrowLeft: mock("ArrowLeft"),
    People: mock("People"),
    InfoCircle: mock("InfoCircle"),
    Warning2: mock("Warning2"),
  }
})

import { ApiErrorResponse } from "@/lib/api/client"
import CandidateComparePage from "../page"

function profile(id: string, name: string) {
  return {
    id,
    firstName: name.split(" ")[0],
    lastName: name.split(" ")[1] ?? "",
    displayName: name,
    headline: "Senior Engineer",
    city: "Berlin",
    totalExperienceYears: 5,
    skills: [{ id: "s1", name: "TypeScript", proficiencyLevel: "EXPERT" }],
    status: "ACTIVE",
  }
}

function app(id: string, jobTitle: string, status: string) {
  return {
    id,
    job: { title: jobTitle },
    status,
    submittedAt: "2026-09-01T09:00:00.000Z",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  }
}

function screeningResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "COMPLETED",
    overallScore: 85,
    recommendation: "SHORTLIST",
    confidence: "HIGH",
    matchedQualifications: ["Postgres", "System design"],
    missingQualifications: [],
    uncertainties: [],
    riskFlags: [],
    criteriaScores: [
      { criterion: "Experience", score: 80, maximumScore: 100, weight: 0.5 },
      { criterion: "Culture fit", score: 70, maximumScore: 100, weight: 0.2 },
    ],
    ...overrides,
  }
}

function setParams(pairs: Array<[string, string]>) {
  window.history.replaceState(null, "", `/candidates/compare?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`)
  return window.location.search
}

describe("CandidateComparePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setParams([])
    byId.mockImplementation((id: string) => Promise.resolve(profile(id, id === "c1" ? "Ada Loop" : "Bo Ling")))
    appsByCandidate.mockImplementation((candidateId: string) =>
      Promise.resolve({
        data: [app(candidateId === "c1" ? "app-ada" : "app-bo", "Senior Engineer", "IN_REVIEW")],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    )
    latestScreening.mockResolvedValue(screeningResult())
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState(null, "", "/")
  })

  it("shows the empty state with a link back when no ids are in the URL", async () => {
    render(<CandidateComparePage />)
    await waitFor(() => expect(screen.getByText("Nothing to compare yet")).toBeTruthy())
    expect(byId).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Go to candidates" })).toBeTruthy()
  })

  it("renders side-by-side columns with profile, application and screening facts", async () => {
    setParams([["ids", "c1"], ["ids", "c2"]])
    render(<CandidateComparePage />)

    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    expect(screen.getByText("Bo Ling")).toBeTruthy()

    // Both candidates screened — score and recommendation render once per column.
    expect(screen.getAllByText("85")).toHaveLength(2)
    expect(screen.getAllByText("Recommended for shortlist")).toHaveLength(2)
    // Each per-column value renders once per screened candidate.
    expect(screen.getAllByText("High")).toHaveLength(2)
    expect(screen.getAllByText("Postgres")).toHaveLength(2)
    expect(screen.getAllByText("5 yrs")).toHaveLength(2)
    expect(screen.getAllByText("Berlin")).toHaveLength(2)
    expect(screen.getAllByText("TypeScript")).toHaveLength(2)
    // Criteria scores render the per-criterion weight, not a derived total.
    expect(screen.getAllByText(/w=0.5/)).toHaveLength(2)
    expect(screen.getAllByText(/w=0.2/)).toHaveLength(2)

    // The honest framing is always present.
    expect(screen.getByText(/doesn't select a winner/i)).toBeTruthy()
  })

  it("never invents a score for a candidate that was not screened", async () => {
    setParams([["ids", "c1"], ["ids", "c2"]])
    latestScreening.mockImplementation((appId: string) =>
      appId === "app-ada" ? Promise.reject(new ApiErrorResponse(404, "SCREENING_NOT_FOUND", "No screening")) : Promise.resolve(screeningResult()),
    )
    render(<CandidateComparePage />)

    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    await waitFor(() => expect(screen.getByText("Bo Ling")).toBeTruthy())

    // Ada's screening bucket must stay empty — her column never shows a score.
    expect(screen.getAllByText("85")).toHaveLength(1)
    expect(screen.getAllByText("Recommended for shortlist")).toHaveLength(1)
    // No fabricated recommendation for Ada; she renders honest dashes instead.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("hides the loading skeleton once data arrives and shows the profile links", async () => {
    setParams([["ids", "c1"]])
    render(<CandidateComparePage />)

    await waitFor(() => expect(screen.getByText("Ada Loop")).toBeTruthy())
    expect(screen.getAllByRole("link", { name: "View profile" }).length).toBe(1)
    expect(screen.queryByLabelText("Loading comparison")).toBeNull()
  })
})