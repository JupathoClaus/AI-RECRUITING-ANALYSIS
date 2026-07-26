import { describe, it, expect, vi, beforeEach } from "vitest"
import { apiRequest } from "../client"

vi.mock("../client", () => ({
  apiRequest: vi.fn(),
}))

describe("ai-interviews.api", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe("createAiInterview", () => {
    it("calls POST /ai-interviews with applicationId", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ id: "int-1", rawCode: "ABCD-EFGH" })
      const { createAiInterview } = await import("../ai-interviews.api")
      const result = await createAiInterview({ applicationId: "app-1" })
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews", {
        method: "POST",
        body: { applicationId: "app-1" },
      })
      expect(result.rawCode).toBe("ABCD-EFGH")
    })
  })

  describe("sendAiInterviewInvitation", () => {
    it("calls POST /ai-interviews/:id/send with email", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ sent: true, rawCode: "WXYZ-1234" })
      const { sendAiInterviewInvitation } = await import("../ai-interviews.api")
      const result = await sendAiInterviewInvitation("int-1", { to: "c@test.com" })
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/int-1/send", {
        method: "POST",
        body: { to: "c@test.com" },
      })
      expect(result.sent).toBe(true)
    })
  })

  describe("verifyInterviewCode", () => {
    it("calls POST /ai-interviews/public/verify-code with code", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ accessToken: "tok-1", candidateName: "Daniel", jobTitle: "Developer" })
      const { verifyInterviewCode } = await import("../ai-interviews.api")
      const result = await verifyInterviewCode("ABCD-EFGH")
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/public/verify-code", {
        method: "POST",
        body: { code: "ABCD-EFGH" },
      })
      expect(result.accessToken).toBe("tok-1")
    })
  })

  describe("startAiInterview", () => {
    it("calls POST /ai-interviews/public/start with Bearer token", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ conversationUrl: "https://tavus.com/abc", provider: "TAVUS" })
      const { startAiInterview } = await import("../ai-interviews.api")
      const result = await startAiInterview("tok-1", true)
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/public/start", {
        method: "POST",
        body: { acknowledgementsAccepted: true },
        headers: { Authorization: "Bearer tok-1" },
      })
      expect(result.provider).toBe("TAVUS")
    })
  })

  describe("completeAiInterview", () => {
    it("calls POST /ai-interviews/public/complete", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ completed: true })
      const { completeAiInterview } = await import("../ai-interviews.api")
      const result = await completeAiInterview("tok-1")
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/public/complete", {
        method: "POST",
        headers: { Authorization: "Bearer tok-1" },
      })
      expect(result.completed).toBe(true)
    })
  })

  describe("regenerateAiInterviewCode", () => {
    it("calls POST /ai-interviews/:id/regenerate-code", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ rawCode: "NEWC-ODE1", displayHint: "NEWC-ODE1" })
      const { regenerateAiInterviewCode } = await import("../ai-interviews.api")
      const result = await regenerateAiInterviewCode("int-1")
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/int-1/regenerate-code", {
        method: "POST",
      })
      expect(result.rawCode).toBe("NEWC-ODE1")
    })
  })

  describe("cancelAiInterview", () => {
    it("calls POST /ai-interviews/:id/cancel", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ cancelled: true })
      const { cancelAiInterview } = await import("../ai-interviews.api")
      const result = await cancelAiInterview("int-1")
      expect(apiRequest).toHaveBeenCalledWith("/ai-interviews/int-1/cancel", {
        method: "POST",
      })
      expect(result.cancelled).toBe(true)
    })
  })
})
