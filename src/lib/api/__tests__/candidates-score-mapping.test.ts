/**
 * Candidate score mapping tests: real AI screening summaries flow into
 * Candidate.aiScore without fabrication. A real score of 0 must be
 * preserved as distinct from "not screened" (null).
 */

import { mapCandidateFromApi } from "@/lib/api/candidates.api"
import type { CandidateApiListItem } from "@/lib/api/candidates.api"

function makeApiCandidate(overrides: Partial<CandidateApiListItem> = {}): CandidateApiListItem {
  return {
    id: "c1",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada Lovelace",
    city: null,
    headline: null,
    currentJobTitle: "Engineer",
    currentEmployer: null,
    totalExperienceYears: 5,
    status: "ACTIVE",
    source: "RECRUITER_CREATED",
    skillSummary: [],
    preferredInterviewLanguage: null,
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
    version: 1,
    ...overrides,
  }
}

describe("mapCandidateFromApi score mapping", () => {
  it("maps null screening to a null aiScore (not screened)", () => {
    const c = mapCandidateFromApi(makeApiCandidate({ screening: null }))
    expect(c.aiScore).toBeNull()
    expect(c.screening).toBeUndefined()
  })

  it("maps no screening field to a null aiScore", () => {
    const c = mapCandidateFromApi(makeApiCandidate())
    expect(c.aiScore).toBeNull()
  })

  it("preserves a real score of 0 as distinct from not-screened", () => {
    const c = mapCandidateFromApi(
      makeApiCandidate({
        screening: {
          status: "COMPLETED",
          overallScore: 0,
          recommendation: "NOT_SHORTLIST",
          confidence: "HIGH",
          resultId: "res-1",
          completedAt: "2026-08-01T12:00:00Z",
          pendingRerun: false,
          failedRerun: false,
        },
      }),
    )
    expect(c.aiScore).toBe(0)
    expect(c.screening?.resultId).toBe("res-1")
    expect(c.screening?.recommendation).toBe("NOT_SHORTLIST")
  })

  it("maps the latest completed score", () => {
    const c = mapCandidateFromApi(
      makeApiCandidate({
        screening: {
          status: "COMPLETED",
          overallScore: 87,
          recommendation: "SHORTLIST",
          confidence: "HIGH",
          resultId: "res-2",
          completedAt: "2026-08-02T12:00:00Z",
          pendingRerun: false,
          failedRerun: false,
        },
      }),
    )
    expect(c.aiScore).toBe(87)
  })

  it("keeps the completed score visible while a newer rerun is pending", () => {
    const c = mapCandidateFromApi(
      makeApiCandidate({
        screening: {
          status: "PENDING",
          overallScore: 71,
          recommendation: "HUMAN_REVIEW",
          confidence: "MEDIUM",
          resultId: "res-3",
          completedAt: "2026-08-02T12:00:00Z",
          pendingRerun: true,
          failedRerun: false,
        },
      }),
    )
    expect(c.aiScore).toBe(71)
    expect(c.screening?.status).toBe("PENDING")
    expect(c.screening?.pendingRerun).toBe(true)
  })

  it("keeps the completed score visible after a failed rerun", () => {
    const c = mapCandidateFromApi(
      makeApiCandidate({
        screening: {
          status: "FAILED",
          overallScore: 64,
          recommendation: "HUMAN_REVIEW",
          confidence: "LOW",
          resultId: "res-4",
          completedAt: "2026-08-02T12:00:00Z",
          pendingRerun: false,
          failedRerun: true,
        },
      }),
    )
    expect(c.aiScore).toBe(64)
    expect(c.screening?.failedRerun).toBe(true)
  })
})
