/**
 * Hiring hub (Phase 1): live-count workspace.
 * - Renders the four hiring workspaces with real counts
 * - Bounded queries (limit 1) are used for counts, never full list fetches
 * - New-application sub-count reflects the Applied bucket only
 * - Partial failures degrade the affected card without a fake value
 * - All failures produce an honest "unavailable" banner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, waitFor, cleanup } from "@testing-library/react"

vi.setConfig({ testTimeout: 30000 })

const apps = vi.hoisted(() => vi.fn())
const candidates = vi.hoisted(() => vi.fn())
const scoreSummary = vi.hoisted(() => vi.fn())
const fetchJobs = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const useStoreMock = vi.hoisted(() => ({ useStore: vi.fn(() => ({ jobs: [], fetchJobs })) }))

vi.mock("@/lib/api/applications.api", () => ({
  fetchApplications: (...args: unknown[]) => apps(...args),
}))

vi.mock("@/lib/api/candidates.api", () => ({
  fetchCandidates: (...args: unknown[]) => candidates(...args),
  fetchCandidatesScoreSummary: (...args: unknown[]) => scoreSummary(...args),
  displayStatusToApplicationStatuses: (display: string) =>
    display === "Applied" ? ["DRAFT", "SUBMITTED"] : ["DRAFT", "SUBMITTED", "REVIEWING", "SHORTLISTED"],
}))

vi.mock("@/store/useStore", () => useStoreMock)

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
    Briefcase: mock("Briefcase"),
    DocumentText: mock("DocumentText"),
    People: mock("People"),
    Routing2: mock("Routing2"),
    ArrowRight: mock("ArrowRight"),
    Danger: mock("Danger"),
  }
})

import HiringHubPage from "../page"

function meta(total: number) {
  return { total, page: 1, limit: 1, totalPages: Math.max(total, 1) }
}

describe("HiringHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJobs.mockResolvedValue(undefined)
    useStoreMock.useStore.mockReturnValue({ jobs: [], fetchJobs })
    apps.mockImplementation(async ({ limit = 1, status }: { limit?: number; status?: string[] } = {}) => {
      expect(limit).toBe(1) // counts must never be full-list fetches
      return { items: [], meta: meta(status ? 2 : 14) }
    })
    candidates.mockResolvedValue({ items: [], meta: meta(12) })
    scoreSummary.mockResolvedValue({ totalCandidates: 12, scoredCandidates: 4, averageScore: null, topCandidates: [] })
  })

  afterEach(() => cleanup())

  it("renders all four workspaces and their live counts", async () => {
    render(<HiringHubPage />)

    await waitFor(() => expect(screen.getByText("2 awaiting review")).toBeTruthy())
    expect(screen.getByText("Hiring at a glance")).toBeTruthy()

    // Application total and candidate total come from bounded count queries.
    const cards = screen.getAllByText("14")
    expect(cards.length).toBeGreaterThan(0)

    const candStat = screen.getByText("4 AI-screened")
    expect(candStat).toBeTruthy()

    expect(screen.getByRole("link", { name: /^Jobs/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /^Applications/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /^Candidates/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /^Pipeline/ })).toBeTruthy()
    expect(screen.getByText("New Job")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("counts open positions from the jobs store", async () => {
    useStoreMock.useStore.mockReturnValue({ jobs: [{ id: "j1" }, { id: "j2" }], fetchJobs })

    render(<HiringHubPage />)
    await waitFor(() => expect(screen.getByText("2 awaiting review")).toBeTruthy())
    expect(screen.queryByText("Unavailable right now")).toBeNull()
  })

  it("degrades just the affected card when one query fails", async () => {
    scoreSummary.mockRejectedValue(new Error("boom"))
    render(<HiringHubPage />)

    await waitFor(() => expect(screen.getByText("14")).toBeTruthy())
    // Candidate total still shows, but the AI-screened sub-count is dropped (not invented).
    expect(screen.getByText("12")).toBeTruthy()
    expect(screen.queryByText(/AI-screened/)).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows an honest banner and refrains from fake values when everything fails", async () => {
    apps.mockRejectedValue(new Error("boom"))
    candidates.mockRejectedValue(new Error("boom"))
    scoreSummary.mockRejectedValue(new Error("boom"))

    render(<HiringHubPage />)

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy())
    // No card may show a fabricated number.
    expect(screen.queryByText("14")).toBeNull()
    expect(screen.queryByText("12")).toBeNull()
  })
})