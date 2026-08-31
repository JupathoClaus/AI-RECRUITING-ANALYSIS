import { describe, it, expect, vi, beforeEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const routerPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/interview/session",
}))

const { completeAiInterview } = vi.hoisted(() => ({
  completeAiInterview: vi.fn(),
}))

vi.mock("@/lib/api/ai-interviews.api", () => ({
  completeAiInterview,
}))

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorageMock.clear()
  Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock, configurable: true })
  sessionStorageMock.setItem("ai-interview-access-token", "tok-1")
  sessionStorageMock.setItem("ai-interview-conversation-url", "https://tavus.daily.co/conv-1")
  sessionStorageMock.setItem("ai-interview-provider", "TAVUS")
  sessionStorageMock.setItem("ai-interview-candidate-first-name", "Ava")
  sessionStorageMock.setItem("ai-interview-job-title", "Backend Engineer")
})

describe("Interview session page â€” End Interview", () => {
  it("shows a confirmation before ending and calls the backend exactly once", async () => {
    completeAiInterview.mockResolvedValue({ completed: false })
    const { default: SessionPage } = await import("@/app/interview/session/page")
    render(<SessionPage />)

    fireEvent.click(screen.getByRole("button", { name: /End Interview/i }))
    expect(screen.getByText("End Interview?")).toBeTruthy()
    expect(screen.getByText(/Are you sure you want to finish your interview\?/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByText("End Interview?")).toBeNull()
    expect(completeAiInterview).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /End Interview/i }))
    fireEvent.click(screen.getAllByRole("button", { name: /^End Interview$/i }).at(-1) as HTMLElement)
    await waitFor(() => {
      expect(completeAiInterview).toHaveBeenCalledTimes(1)
      expect(completeAiInterview).toHaveBeenCalledWith("tok-1")
    })
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/interview/complete?submitted=true")
    })
  })

  it("does not double-submit while ending", async () => {
    let resolveComplete: (v: unknown) => void
    completeAiInterview.mockImplementation(() => new Promise((res) => { resolveComplete = res }))
    const { default: SessionPage } = await import("@/app/interview/session/page")
    render(<SessionPage />)

    fireEvent.click(screen.getByRole("button", { name: /End Interview/i }))
    const confirmBtn = screen.getAllByRole("button", { name: /^End Interview$/i }).at(-1) as HTMLElement
    fireEvent.click(confirmBtn)
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(completeAiInterview).toHaveBeenCalledTimes(1)
    })
    resolveComplete!({ completed: false })
  })
})
