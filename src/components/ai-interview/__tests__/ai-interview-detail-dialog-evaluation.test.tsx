/**
 * The recruiter-facing evaluation section of the AI Interview detail dialog:
 * sverifies the AI-assisted report renders honestly (score + recommendation +
 * evidence badges + AI-usage disclosure), that a FAILED evaluation shows the
 * failure and never a score, and that the recruiter decision path (never the
 * AI) calls the backend decision endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

const mockGetAiInterview = vi.fn()
const mockGetEvaluation = vi.fn()
const mockReevaluate = vi.fn()
const mockRecordDecision = vi.fn()
const mockSyncArtifacts = vi.fn()
const mockGetPlayback = vi.fn()

vi.mock("@/lib/api/ai-interviews.api", () => ({
  getAiInterview: (...args: unknown[]) => mockGetAiInterview(...args),
  getAiInterviewEvaluation: (...args: unknown[]) => mockGetEvaluation(...args),
  reEvaluateAiInterview: (...args: unknown[]) => mockReevaluate(...args),
  recordAiInterviewDecision: (...args: unknown[]) => mockRecordDecision(...args),
  syncAiInterviewArtifacts: (...args: unknown[]) => mockSyncArtifacts(...args),
  getRecordingPlayback: (...args: unknown[]) => mockGetPlayback(...args),
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) => React.createElement("span", { "data-testid": `icon-${name}`, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    MagicStar: mock("MagicStar"),
    Clock: mock("Clock"),
    Link2: mock("Link2"),
    DocumentText: mock("DocumentText"),
    Video: mock("Video"),
    Calendar: mock("Calendar"),
    LanguageSquare: mock("LanguageSquare"),
    User: mock("User"),
    Briefcase: mock("Briefcase"),
    Refresh: mock("Refresh"),
    Star1: mock("Star1"),
    InfoCircle: mock("InfoCircle"),
    Warning2: mock("Warning2"),
    CloseSquare: mock("CloseSquare"),
  }
})

import { AiInterviewDetailDialog } from "@/components/ai-interview/ai-interview-detail-dialog"
import type { AiInterviewDetail } from "@/lib/api/ai-interviews.api"

const INTERVIEW: AiInterviewDetail = {
  id: "interview-1",
  applicationId: "app-1",
  provider: "MOCK",
  status: "COMPLETED",
  codeDisplayHint: "ABC-DEF",
  invitationSentAt: null,
  invitationEmail: null,
  accessedAt: null,
  startedAt: "2026-09-29T10:00:00Z",
  completedAt: "2026-09-29T10:05:00Z",
  cancelledAt: null,
  consentAcceptedAt: null,
  accommodationRequested: false,
  accommodationNotes: null,
  tavusConversationId: null,
  tavusConversationUrl: null,
  tavusStatus: null,
  transcriptStatus: "READY",
  transcriptUrl: null,
  transcript: [
    { role: "assistant", content: "Tell me about Kubernetes." },
    { role: "user", content: "I led a Kubernetes migration.", seconds_from_start: 10, duration: 5 },
  ],
  recordingStatus: "NOT_REQUESTED",
  recordingUrl: null,
  recordingMetadata: null,
  language: "en",
  estimatedDurationMinutes: 5,
  expiresAt: null,
  notes: null,
  createdAt: "2026-09-29T09:00:00Z",
  updatedAt: "2026-09-29T10:05:00Z",
  application: {
    candidate: { id: "cand-1", firstName: "Ada", lastName: "Lovelace", email: "ada@test.com" },
    job: { id: "job-1", title: "Senior Engineer" },
  },
}

const COMPLETED_EVALUATION = {
  interviewStatus: "COMPLETED",
  transcriptStatus: "READY",
  evaluationStatus: "COMPLETED",
  evaluationCount: 1,
  report: {
    id: "eval-1",
    status: "COMPLETED",
    attempt: 1,
    totalScore: 80,
    maximumScore: 100,
    recommendation: "PASS",
    confidence: "HIGH",
    summary: "Strong candidate.",
    strengths: ["Clear on Kubernetes"],
    gaps: ["Light on networking"],
    uncertainties: [],
    provider: "mock",
    model: null,
    promptVersion: "v1",
    schemaVersion: "v1",
    inputFingerprint: "fp",
    latencyMs: 12,
    responseId: "r1",
    evidenceTotals: { VERBATIM: 1, SUPPORTED: 0, INFERRED: 0, UNVERIFIED: 0 },
    failureCode: null,
    failureMessageSafe: null,
    startedAt: "2026-09-29T10:06:00Z",
    completedAt: "2026-09-29T10:06:01Z",
    recruiterDecision: null,
    decidedByMembershipId: null,
    decidedAt: null,
    decisionNote: null,
    competencies: [
      {
        competency: "Kubernetes",
        status: "MET",
        score: 80,
        maxScore: 100,
        weight: 1,
        confidence: "HIGH",
        rationale: "Consistent with the transcript.",
        sortOrder: 0,
        evidence: [
          {
            quote: "I led a Kubernetes migration",
            verification: "VERBATIM",
            excerpt: "I led a Kubernetes migration.",
            transcriptId: "transcript-1",
            segmentIndexes: [1],
            startSeconds: 10,
            endSeconds: 15,
            sourceSegmentIndex: 1,
            sourceSeconds: 10,
          },
        ],
      },
    ],
  },
  attempts: [
    { id: "att-1", attempt: 1, status: "COMPLETED", provider: "mock", model: null, promptVersion: "v1", latencyMs: 12, responseId: "r1", failureCode: null, failureMessageSafe: null, startedAt: null, completedAt: "2026-09-29T10:06:01Z" },
  ],
}

function renderDialog() {
  return render(
    <AiInterviewDetailDialog
      interview={INTERVIEW}
      open={true}
      onOpenChange={() => {}}
      onRefreshed={() => {}}
    />,
  )
}

describe("AiInterviewDetailDialog evaluation section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAiInterview.mockResolvedValue(INTERVIEW)
    mockGetEvaluation.mockResolvedValue(COMPLETED_EVALUATION)
    mockGetPlayback.mockRejectedValue(new Error("no playback"))
    mockSyncArtifacts.mockResolvedValue({})
  })

  afterEach(() => cleanup())

  it("renders the honest AI-assisted report with score, recommendation and disclosure", async () => {
    renderDialog()

    expect(await screen.findByText("AI Evaluation")).toBeDefined()
    await waitFor(() => expect(screen.getByText("80")).toBeDefined())
    await waitFor(() => expect(screen.getByText("/100")).toBeDefined())
    await waitFor(() => expect(screen.getByText(/Confidence High/i)).toBeDefined())
    await waitFor(() =>
      expect(screen.getByText(/AI-assisted draft produced by mock/)).toBeDefined(),
    )
    await waitFor(() => expect(screen.getByText(/AI never decides/)).toBeDefined())
    await waitFor(() => expect(screen.getAllByText("Pass").length).toBeGreaterThanOrEqual(1))
  })

  it("renders competency breakdown with verbatim evidence sourced to the transcript", async () => {
    renderDialog()

    await waitFor(() => expect(screen.getByText("Kubernetes")).toBeDefined())
    await waitFor(() => expect(screen.getByText("Verbatim")).toBeDefined())
    await waitFor(() =>
      expect(screen.getByText('"I led a Kubernetes migration"')).toBeDefined(),
    )
    await waitFor(() => expect(screen.getByText("@10s")).toBeDefined())
    await waitFor(() => expect(screen.getByText(/Consistent with the transcript/)).toBeDefined())
  })

  it("renders the transcript excerpt and deep-links evidence to the source turn", async () => {
    renderDialog()

    await waitFor(() =>
      expect(screen.getByText('Transcript: "I led a Kubernetes migration."')).toBeDefined(),
    )
    const link = await screen.findByRole("button", { name: "View in transcript" })
    fireEvent.click(link)

    await waitFor(() => {
      const sourceTurn = screen.getByText("I led a Kubernetes migration.")
      const turnWrapper = sourceTurn.closest("div")
      expect(turnWrapper?.className).toContain("bg-primary/10")
    })
  })

  it("renders strengths and gaps", async () => {
    renderDialog()

    await waitFor(() => expect(screen.getByText("Strengths")).toBeDefined())
    await waitFor(() => expect(screen.getByText("- Clear on Kubernetes")).toBeDefined())
    await waitFor(() => expect(screen.getByText("- Light on networking")).toBeDefined())
  })

  it("records the recruiter decision through the backend decision endpoint", async () => {
    mockRecordDecision.mockResolvedValue({})
    renderDialog()

    const pass = await screen.findByRole("button", { name: "Pass" })
    fireEvent.click(pass)
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }))

    await waitFor(() =>
      expect(mockRecordDecision).toHaveBeenCalledWith("interview-1", {
        decision: "PASS",
        note: undefined,
      }),
    )
  })

  it("shows a FAILED evaluation with the failure code and a re-evaluate path, never a score", async () => {
    mockGetEvaluation.mockResolvedValue({
      ...COMPLETED_EVALUATION,
      evaluationStatus: "FAILED",
      report: {
        ...COMPLETED_EVALUATION.report,
        status: "FAILED",
        totalScore: null,
        recommendation: null,
        failureCode: "PROVIDER_UNAVAILABLE",
        failureMessageSafe: "Mock provider failure (retryable).",
      },
    })
    mockReevaluate.mockResolvedValue({ evaluationId: "eval-2", status: "PENDING" })

    renderDialog()

    await waitFor(() =>
      expect(screen.getByText(/The evaluation failed and no score was produced/)).toBeDefined(),
    )
    await waitFor(() => expect(screen.getByText("PROVIDER_UNAVAILABLE")).toBeDefined())
    await waitFor(() => expect(screen.queryByText("/100")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }))
    await waitFor(() => expect(mockReevaluate).toHaveBeenCalledWith("interview-1"))
  })

  it("shows the un-evaluated state with an evaluate-now trigger for a completed interview", async () => {
    mockGetEvaluation.mockResolvedValue({
      interviewStatus: "COMPLETED",
      transcriptStatus: "READY",
      evaluationStatus: "NOT_REQUESTED",
      evaluationCount: 0,
      report: null,
      attempts: [],
    })
    renderDialog()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Evaluate now" })).toBeDefined(),
    )
  })
})