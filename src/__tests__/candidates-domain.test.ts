/**
 * Pure domain helper tests for Candidate/Application separation.
 * These tests verify the selection, mapping, and status logic
 * independently from the runtime environment.
 *
 * Run: npx jest src/__tests__/candidates-domain.test.ts
 * (Requires Jest to be set up in the frontend)
 */

import {
  selectCurrentApplication,
  selectLatestApplication,
  buildApplicationInfo,
  mapToDisplayStatus,
  isActiveStatus,
  isTerminalStatus,
} from "@/lib/api/candidates.api"
import type { ApplicationStatus } from "@/types"

const NOW = "2026-07-20T12:00:00Z"
const EARLIER = "2026-07-19T12:00:00Z"
const OLDEST = "2026-07-18T12:00:00Z"

function makeApp(
  id: string,
  status: ApplicationStatus,
  updatedAt: string,
  createdAt: string = updatedAt,
) {
  return { id, candidateId: "c1", jobId: "j1", jobTitle: "Engineer", status, version: 1, createdAt, updatedAt }
}

// ── Status tests ────────────────────────────────────────────────────

describe("isTerminalStatus", () => {
  it("returns true for HIRED", () => expect(isTerminalStatus("HIRED")).toBe(true))
  it("returns true for REJECTED", () => expect(isTerminalStatus("REJECTED")).toBe(true))
  it("returns true for WITHDRAWN", () => expect(isTerminalStatus("WITHDRAWN")).toBe(true))
  it("returns true for DISQUALIFIED", () => expect(isTerminalStatus("DISQUALIFIED")).toBe(true))
  it("returns false for SUBMITTED", () => expect(isTerminalStatus("SUBMITTED")).toBe(false))
  it("returns false for DRAFT", () => expect(isTerminalStatus("DRAFT")).toBe(false))
})

describe("isActiveStatus", () => {
  it("returns true for SUBMITTED", () => expect(isActiveStatus("SUBMITTED")).toBe(true))
  it("returns true for UNDER_REVIEW", () => expect(isActiveStatus("UNDER_REVIEW")).toBe(true))
  it("returns true for INTERVIEW", () => expect(isActiveStatus("INTERVIEW")).toBe(true))
  it("returns false for HIRED", () => expect(isActiveStatus("HIRED")).toBe(false))
  it("returns false for REJECTED", () => expect(isActiveStatus("REJECTED")).toBe(false))
  it("returns false for ARCHIVED", () => expect(isActiveStatus("ARCHIVED")).toBe(false))
})

describe("mapToDisplayStatus", () => {
  const cases: [ApplicationStatus, string][] = [
    ["DRAFT", "Applied"],
    ["SUBMITTED", "Applied"],
    ["UNDER_REVIEW", "Screening"],
    ["SCREENING", "Screening"],
    ["SHORTLISTED", "Screening"],
    ["ASSESSMENT", "Interview"],
    ["INTERVIEW", "Interview"],
    ["OFFER", "Offer"],
    ["HIRED", "Hired"],
    ["REJECTED", "Rejected"],
    ["WITHDRAWN", "Rejected"],
    ["DISQUALIFIED", "Rejected"],
  ]
  it.each(cases)("maps %s → %s", (status, expected) => {
    expect(mapToDisplayStatus(status)).toBe(expected)
  })
})

// ── Application selection tests ─────────────────────────────────────

describe("selectCurrentApplication", () => {
  it("returns undefined for empty array", () => {
    expect(selectCurrentApplication([])).toBeUndefined()
  })

  it("returns the only active application", () => {
    const apps = [makeApp("a1", "SUBMITTED", NOW)]
    expect(selectCurrentApplication(apps)?.id).toBe("a1")
  })

  it("prefers most recently updated active application", () => {
    const apps = [
      makeApp("old", "SUBMITTED", EARLIER),
      makeApp("recent", "SUBMITTED", NOW),
    ]
    expect(selectCurrentApplication(apps)?.id).toBe("recent")
  })

  it("prefers active over newer terminal application", () => {
    const apps = [
      makeApp("active", "SUBMITTED", EARLIER),
      makeApp("terminal", "HIRED", NOW),
    ]
    expect(selectCurrentApplication(apps)?.id).toBe("active")
  })

  it("returns latest terminal when all are terminal", () => {
    const apps = [
      makeApp("old", "REJECTED", EARLIER),
      makeApp("recent", "HIRED", NOW),
    ]
    expect(selectCurrentApplication(apps)?.id).toBe("recent")
  })

  it("breaks ties by createdAt then by id", () => {
    const apps = [
      makeApp("a1", "SUBMITTED", NOW, EARLIER),
      makeApp("a2", "SUBMITTED", NOW, NOW),
    ]
    expect(selectCurrentApplication(apps)?.id).toBe("a2")
  })
})

// ── Application info tests ──────────────────────────────────────────

describe("buildApplicationInfo", () => {
  it("returns zero counts for empty array", () => {
    const info = buildApplicationInfo([])
    expect(info.total).toBe(0)
    expect(info.active).toBe(0)
    expect(info.current).toBeUndefined()
    expect(info.latest).toBeUndefined()
  })

  it("counts total and active correctly", () => {
    const apps = [
      makeApp("a1", "SUBMITTED", NOW),
      makeApp("a2", "REJECTED", EARLIER),
    ]
    const info = buildApplicationInfo(apps)
    expect(info.total).toBe(2)
    expect(info.active).toBe(1)
  })

  it("maps current application display status", () => {
    const apps = [makeApp("a1", "SUBMITTED", NOW)]
    const info = buildApplicationInfo(apps)
    expect(info.current?.displayStatus).toBe("Applied")
  })

  it("maps terminal application display status", () => {
    const apps = [makeApp("a1", "HIRED", NOW)]
    const info = buildApplicationInfo(apps)
    expect(info.current?.displayStatus).toBe("Hired")
  })

  it("Candidate status independent from Application status", () => {
    // This test verifies the concept — Candidate has CandidateStatus
    // while Application has ApplicationStatus. They are distinct types.
    const apps = [makeApp("a1", "SUBMITTED", NOW)]
    const info = buildApplicationInfo(apps)
    expect(info.current?.status).toBe("SUBMITTED")
    // CandidateStatus is a separate type (ACTIVE|INACTIVE|BLOCKED)
    // and is NOT derived from application data
  })
})

// ── Invariant tests ─────────────────────────────────────────────────

describe("domain invariants", () => {
  it("each Candidate maps once regardless of application count", () => {
    const apps = [
      makeApp("a1", "SUBMITTED", NOW),
      makeApp("a2", "UNDER_REVIEW", EARLIER),
      makeApp("a3", "REJECTED", OLDEST),
    ]
    const info = buildApplicationInfo(apps)
    // One info object for one candidate, regardless of app count
    expect(info.total).toBe(3)
    expect(info.current).toBeDefined()
    expect(info.latest).toBeDefined()
  })
})
