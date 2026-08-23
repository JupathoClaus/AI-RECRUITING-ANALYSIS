import { describe, it, expect, vi, beforeEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { AiInterviewDetail } from "@/lib/api/ai-interviews.api"

const { syncAiInterviewArtifacts, getAiInterview } = vi.hoisted(() => ({
  syncAiInterviewArtifacts: vi.fn(),
  getAiInterview: vi.fn(),
}))

vi.mock("@/lib/api/ai-interviews.api", () => ({
  syncAiInterviewArtifacts,
  getAiInterview,
}))

function makeInterview(overrides: Partial<AiInterviewDetail> = {}): AiInterviewDetail {
  return {
    id: "int-1",
    applicationId: "app-1",
    provider: "TAVUS",
    status: "COMPLETED",
    codeDisplayHint: "****-1234",
    invitationSentAt: "2026-08-01T10:00:00Z",
    invitationEmail: "candidate@test.com",
    accessedAt: null,
    startedAt: "2026-08-01T10:05:00Z",
    completedAt: "2026-08-01T10:20:00Z",
    cancelledAt: null,
    consentAcceptedAt: "2026-08-01T10:04:00Z",
    accommodationRequested: false,
    accommodationNotes: null,
    tavusConversationId: "conv-1",
    tavusConversationUrl: null,
    tavusStatus: "ended",
    transcriptStatus: "READY",
    transcriptUrl: null,
    transcript: [
      { role: "assistant", content: "Tell me about your experience.", seconds_from_start: 3 },
      { role: "user", content: "I led the migration to TypeScript.", seconds_from_start: 10 },
    ],
    recordingStatus: null,
    recordingUrl: null,
    language: "en",
    estimatedDurationMinutes: 30,
    expiresAt: null,
    notes: null,
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:20:00Z",
    application: {
      candidate: { id: "c1", firstName: "Ava", lastName: "Liu", email: "ava@test.com" },
      job: { id: "j1", title: "Backend Engineer" },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AiInterviewDetailDialog", () => {
  it("shows processing states while artifacts are pending", async () => {
    const { AiInterviewDetailDialog } = await import("@/components/ai-interview/ai-interview-detail-dialog")
    const interview = makeInterview({
      transcriptStatus: "PENDING",
      transcript: null,
      recordingStatus: "PROCESSING",
    })
    render(
      <AiInterviewDetailDialog interview={interview} open onOpenChange={() => {}} />,
    )
    expect(screen.getByText("Transcript is being processed. It will appear here when ready.")).toBeTruthy()
    expect(screen.getByText("Recording is being processed by the provider. It will appear here when ready.")).toBeTruthy()
  }, 15000)

  it("labels transcript speakers as AI Interviewer and Candidate", async () => {
    const { AiInterviewDetailDialog } = await import("@/components/ai-interview/ai-interview-detail-dialog")
    const interview = makeInterview()
    render(
      <AiInterviewDetailDialog interview={interview} open onOpenChange={() => {}} />,
    )
    expect(screen.getAllByText("AI Interviewer").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Candidate").length).toBeGreaterThan(0)
    expect(screen.getByText("I led the migration to TypeScript.")).toBeTruthy()
  })

  it("hides system-prompt turns from the transcript", async () => {
    const { AiInterviewDetailDialog } = await import("@/components/ai-interview/ai-interview-detail-dialog")
    const interview = makeInterview({
      transcript: [
        { role: "system", content: "You are in a live video conference call with a user..." },
        { role: "assistant", content: "Hello, welcome.", seconds_from_start: 1 },
        { role: "user", content: "Thanks.", seconds_from_start: 4 },
      ],
    })
    render(
      <AiInterviewDetailDialog interview={interview} open onOpenChange={() => {}} />,
    )
    expect(screen.queryByText(/You are in a live video conference call/)).toBeNull()
    expect(screen.getByText("Hello, welcome.")).toBeTruthy()
  })

  it("refreshes via the sync endpoint and updates the interview", async () => {
    const { AiInterviewDetailDialog } = await import("@/components/ai-interview/ai-interview-detail-dialog")
    const initial = makeInterview({
      transcriptStatus: "PENDING",
      transcript: null,
      recordingStatus: null,
    })
    const updatedInterview = makeInterview({
      transcriptStatus: "READY",
      recordingStatus: "READY",
      recordingUrl: "s3://recordings/conv-1/1234",
    })
    const onRefreshed = vi.fn()
    syncAiInterviewArtifacts.mockResolvedValue({
      synced: true,
      error: null,
      status: "COMPLETED",
      transcriptStatus: "READY",
      transcriptTurns: 2,
      transcriptUrl: null,
      recordingStatus: "READY",
      recordingUrl: "s3://recordings/conv-1/1234",
      tavusStatus: "ended",
    })
    getAiInterview.mockResolvedValue(updatedInterview)

    function Harness() {
      const [interview, setInterview] = React.useState(initial)
      return (
        <AiInterviewDetailDialog
          interview={interview}
          open
          onOpenChange={() => {}}
          onRefreshed={(u) => {
            setInterview(u)
            onRefreshed(u)
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }))
    await waitFor(() => {
      expect(syncAiInterviewArtifacts).toHaveBeenCalledWith("int-1")
    })
    await waitFor(() => {
      expect(onRefreshed).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText("Open recording reference")).toBeTruthy()
    })
  })

  it("shows Watch Recording for playable http(s) recording URLs", async () => {
    const { AiInterviewDetailDialog } = await import("@/components/ai-interview/ai-interview-detail-dialog")
    const interview = makeInterview({
      recordingStatus: "READY",
      recordingUrl: "https://recordings.example.com/conv-1/1234",
    })
    render(
      <AiInterviewDetailDialog interview={interview} open onOpenChange={() => {}} />,
    )
    expect(screen.getByText("Watch Recording")).toBeTruthy()
  })
})