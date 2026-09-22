import { describe, it, expect, vi, beforeEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { AssessmentResultDto } from "@/lib/api/assessments.api"

const { getAssessmentResult, retryAssessmentEvaluation } = vi.hoisted(() => ({
  getAssessmentResult: vi.fn(),
  retryAssessmentEvaluation: vi.fn(),
}))

vi.mock("@/lib/api/assessments.api", () => ({
  getAssessmentResult,
  retryAssessmentEvaluation,
}))

import { AssessmentResultView } from "../assessment-result-view"

function makeResult(overrides: Partial<AssessmentResultDto> = {}): AssessmentResultDto {
  return {
    session: { id: "sess-1", status: "EVALUATED", attemptNumber: 1, startedAt: "2026-09-22T10:00:00Z", submittedAt: "2026-09-22T10:20:00Z", expiresAt: null },
    assessment: { id: "a1", name: "Sysadmin Assessment", passingScore: 70, durationMinutes: 30, versionNumber: 2, versionId: "v2" },
    application: { id: "app-1", status: "ASSESSMENT", job: { id: "j1", title: "Systems Administrator" }, candidate: { id: "c1", firstName: "Michael", lastName: "K", email: "m@test.com" } },
    questions: [
      {
        id: "q1", type: "SINGLE_CHOICE", prompt: "What shows disk usage?", instructions: null, sortOrder: 0,
        required: true, points: 10, competency: "Linux", aiEvaluated: false,
        options: [
          { id: "o1", label: "df -h", sortOrder: 0, isCorrect: true, selected: true },
          { id: "o2", label: "ls", sortOrder: 1, isCorrect: false, selected: false },
        ],
        rubricCriteria: [],
        response: { textAnswer: null, selectedOptionIds: ["o1"], deterministicScore: 10, deterministicMax: 10, updatedAt: "2026-09-22T10:10:00Z" },
      },
    ],
    evaluations: [
      { id: "e1", attempt: 1, status: "COMPLETED", provider: "mock", model: "mock", promptVersion: "v1", schemaVersion: "v1", latencyMs: 42 },
    ],
    latestEvaluation: { id: "e1", attempt: 1, status: "COMPLETED" },
    result: {
      totalScore: 84,
      deterministicScore: 10,
      deterministicMax: 10,
      aiScore: null,
      aiMax: null,
      competencyBreakdown: [{ competency: "Linux", score: 10, max: 10 }],
      strengths: ["Strong Linux fundamentals"],
      gaps: [],
      uncertainties: [],
      evaluatedAt: "2026-09-22T10:21:00Z",
      threshold: { passingScore: 70, meetsThreshold: true },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AssessmentResultView", () => {
  it("renders the authoritative numeric score with threshold context", async () => {
    getAssessmentResult.mockResolvedValue(makeResult())
    render(<AssessmentResultView sessionId="sess-1" />)
    expect(await screen.findByText("84")).toBeTruthy()
    expect(screen.getByText(/Meets the configured passing threshold/)).toBeTruthy()
    expect(screen.getByText(/decision support/)).toBeTruthy()
  })

  it("shows evaluation-pending state without fabricating a score", async () => {
    const pending = makeResult({ result: null, latestEvaluation: { id: "e1", attempt: 1, status: "RUNNING" }, evaluations: [{ id: "e1", attempt: 1, status: "RUNNING" }] })
    getAssessmentResult.mockResolvedValue(pending)
    render(<AssessmentResultView sessionId="sess-1" />)
    expect(await screen.findByText(/Evaluation is being processed/)).toBeTruthy()
    expect(screen.queryByText("84")).toBeNull()
  })

  it("offers retry when evaluation failed and preserves the failure", async () => {
    const failed = makeResult({
      result: null,
      latestEvaluation: { id: "e1", attempt: 1, status: "FAILED" },
      evaluations: [{ id: "e1", attempt: 1, status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", failureMessageSafe: "endpoint down" }],
    })
    getAssessmentResult.mockResolvedValue(failed)
    retryAssessmentEvaluation.mockResolvedValue({ id: "e2", attempt: 2, status: "PENDING" })
    render(<AssessmentResultView sessionId="sess-1" />)
    expect(await screen.findByText(/endpoint down/)).toBeTruthy()
    fireEvent.click(screen.getByText("Retry evaluation"))
    await waitFor(() => expect(retryAssessmentEvaluation).toHaveBeenCalledWith("sess-1"))
  })
})
