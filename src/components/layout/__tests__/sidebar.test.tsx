/**
 * Sidebar: Phase 1 information-architecture regression.
 * - Top level is reduced to modes of work + one org item; no "Notifications".
 * - Hiring / Interviews / Reports are expandable groups.
 * - A group with an active child auto-opens so the active route is visible.
 * - Collapsed (icon-only) sidebar hides child labels but keeps the group link.
 * - Help & Support marks the current page when on /help.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

vi.setConfig({ testTimeout: 30000 })

let pathname = "/dashboard"
let user = { name: "Ada Lovelace", email: "ada@test.com", role: "RECRUITER" }
const mockLogout = vi.fn()
const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
}))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user, logout: mockLogout }),
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      React.createElement("span", { "data-testid": `icon-${name}`, "aria-hidden": true, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    Category: mock("Category"),
    Briefcase: mock("Briefcase"),
    DocumentText: mock("DocumentText"),
    People: mock("People"),
    Routing2: mock("Routing2"),
    Calendar: mock("Calendar"),
    MagicStar: mock("MagicStar"),
    Video: mock("Video"),
    Chart: mock("Chart"),
    TrendUp: mock("TrendUp"),
    Setting2: mock("Setting2"),
    MessageQuestion: mock("MessageQuestion"),
    Logout: mock("Logout"),
    Menu: mock("Menu"),
    ArrowDown2: mock("ArrowDown2"),
    ArrowLeft2: mock("ArrowLeft2"),
    ArrowRight2: mock("ArrowRight2"),
  }
})

import { Sidebar } from "../sidebar"

describe("Sidebar IA", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathname = "/dashboard"
    user = { name: "Ada Lovelace", email: "ada@test.com", role: "RECRUITER" }
  })

  afterEach(() => cleanup())

  it("shows only the top-level destinations, not every capability", () => {
    render(<Sidebar collapsed={false} onCollapsedChange={vi.fn()} />)

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Hiring" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Interviews" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Reports" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy()

    // Phase 1 removed the flat capability items and the sidebar notification entry.
    expect(screen.queryByRole("link", { name: "AI Screener" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Company" })).toBeNull()
  })

  it("keeps children hidden until the group is expanded", () => {
    render(<Sidebar collapsed={false} onCollapsedChange={vi.fn()} />)

    expect(screen.queryByRole("link", { name: "Jobs" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Applications" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand Hiring" }))

    expect(screen.getByRole("link", { name: "Jobs" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Applications" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Candidates" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeTruthy()
  })

  it("auto-opens only the group whose child route is active", () => {
    pathname = "/jobs"
    render(<Sidebar collapsed={false} onCollapsedChange={vi.fn()} />)

    // The active child is visible without any manual expansion.
    const jobs = screen.getByRole("link", { name: "Jobs" })
    expect(jobs).toBeTruthy()
    expect(jobs.getAttribute("aria-current")).toBe("page")

    // Sibling children of the same group are open too.
    expect(screen.getByRole("link", { name: "Applications" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Candidates" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeTruthy()

    // Unrelated groups stay collapsed: their children are not present.
    expect(screen.getByRole("link", { name: "Interviews" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Reports" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Human Interviews" })).toBeNull()
    expect(screen.queryByRole("link", { name: "AI Interviews" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Recruitment Reports" })).toBeNull()
  })

  it("collapsed sidebar keeps group links but hides child labels", () => {
    render(<Sidebar collapsed={true} onCollapsedChange={vi.fn()} />)

    expect(screen.queryByText("Jobs")).toBeNull()
    expect(screen.queryByText("Applications")).toBeNull()
    // The group destination link itself must survive collapsed mode.
    expect(screen.getByRole("link", { name: "Hiring" })).toBeTruthy()
  })

  it("keeps Help & Support reachable and marks it active on /help", () => {
    pathname = "/help"
    render(<Sidebar collapsed={false} onCollapsedChange={vi.fn()} />)

    const help = screen.getByRole("link", { name: "Help & Support" })
    expect(help).toBeTruthy()
    expect(help.getAttribute("aria-current")).toBe("page")
  })
})