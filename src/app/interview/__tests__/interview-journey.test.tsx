import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { ApiErrorResponse } from "@/lib/api/client"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/interview/access",
}))

const { verifyInterviewCode } = vi.hoisted(() => ({
  verifyInterviewCode: vi.fn(),
}))

vi.mock("@/lib/api/ai-interviews.api", () => ({
  verifyInterviewCode,
}))

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  }
})()

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorageMock.clear()
  Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock, configurable: true })
})

describe("Interview code entry page", () => {
  it("renders the AI Recruiter branded code entry", async () => {
    const { default: Page } = await import("@/app/interview/access/page")
    render(<Page />)
    expect(screen.getByText("Welcome to your interview")).toBeTruthy()
    expect(screen.getByLabelText("Interview code")).toBeTruthy()
    expect(screen.getByText("Secure Interview Access")).toBeTruthy()
    expect(screen.getByRole("img", { name: "AI Recruiter" })).toBeTruthy()
  })

  it("formats the code input as XXXX-XXXX", async () => {
    const { default: Page } = await import("@/app/interview/access/page")
    render(<Page />)
    const input = screen.getByLabelText("Interview code") as HTMLInputElement
    fireEvent.change(input, { target: { value: "abcd" } })
    expect(input.value).toBe("ABCD")
    fireEvent.change(input, { target: { value: "ABCDE" } })
    expect(input.value).toBe("ABCD-E")
  })

  it("shows a distinct message for an invalid code", async () => {
    verifyInterviewCode.mockRejectedValue(
      new ApiErrorResponse(400, "INVALID_CODE", "We could not verify this interview code."),
    )
    const { default: Page } = await import("@/app/interview/access/page")
    render(<Page />)
    const input = screen.getByLabelText("Interview code")
    fireEvent.change(input, { target: { value: "ABCD-EFGH" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("could not verify")
    })
  })

  it("shows a distinct expired message", async () => {
    verifyInterviewCode.mockRejectedValue(
      new ApiErrorResponse(400, "INTERVIEW_EXPIRED", "This interview invitation has expired."),
    )
    const { default: Page } = await import("@/app/interview/access/page")
    render(<Page />)
    const input = screen.getByLabelText("Interview code")
    fireEvent.change(input, { target: { value: "ABCD-EFGH" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("expired")
    })
  })

  it("stores the verified session and navigates to welcome", async () => {
    verifyInterviewCode.mockResolvedValue({
      accessToken: "tok-1",
      candidateFirstName: "Ava",
      candidateDisplayName: "Ava Liu",
      jobTitle: "Backend Engineer",
      organizationName: "AI Recruiter Co",
      language: "en",
      estimatedDurationMinutes: 30,
      expiresAt: null,
      provider: "MOCK",
      status: "ACCESSED",
    })
    const { default: Page } = await import("@/app/interview/access/page")
    render(<Page />)
    const input = screen.getByLabelText("Interview code")
    fireEvent.change(input, { target: { value: "ABCD-EFGH" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }))
    await waitFor(() => {
      expect(sessionStorageMock.getItem("ai-interview-access-token")).toBe("tok-1")
    })
  })
})

describe("Interview preparation page", () => {
  it("keeps the continue button disabled until both consents are given", async () => {
    sessionStorageMock.setItem("ai-interview-access-token", "tok-1")
    const { default: Page } = await import("@/app/interview/preparation/page")
    render(<Page />)
    const button = screen.getByRole("button", { name: /Check camera & microphone/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)

    const boxes = screen.getAllByRole("checkbox")
    fireEvent.click(boxes[0])
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(boxes[1])
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it("reveals the accommodation text field when an adjustment is needed", async () => {
    sessionStorageMock.setItem("ai-interview-access-token", "tok-1")
    const { default: Page } = await import("@/app/interview/preparation/page")
    render(<Page />)
    expect(screen.queryByLabelText(/adjustment would help you/)).toBeNull()
    fireEvent.click(screen.getByLabelText("Yes, I need an adjustment."))
    expect(screen.getByLabelText(/adjustment would help you/)).toBeTruthy()
  })
})