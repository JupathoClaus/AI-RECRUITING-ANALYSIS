/**
 * The AI Assistant is a static preview: it must never fabricate recruitment
 * metrics and never claim that screening/scheduling/analytics actions were
 * performed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { FloatingAIAssistant } from "@/components/ai-assistant"

function openAssistant() {
  render(<FloatingAIAssistant />)
  fireEvent.click(screen.getByRole("button", { name: /Open AI Assistant preview/i }))
}

async function ask(question: string) {
  const input = screen.getByPlaceholderText("Ask how to use a feature...")
  fireEvent.change(input, { target: { value: question } })
  fireEvent.click(screen.getByRole("button", { name: /send message/i }))
}

describe("FloatingAIAssistant (preview)", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollIntoView", vi.fn())
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("labels itself as preview with actions unavailable", () => {
    openAssistant()
    expect(screen.getByText("Preview — actions unavailable")).toBeTruthy()
    expect(screen.getByText(/no actions are executed and no live data is shown/i)).toBeTruthy()
  })

  it("does not fabricate numerical recruitment metrics", async () => {
    openAssistant()
    await ask("Show hiring analytics")

    const reply = await screen.findByText(/Hiring metrics are shown on the Dashboard/i, {
      timeout: 5000,
    })
    expect(reply.textContent).not.toMatch(/12 active job openings|47 candidates|18 days|34%/i)
    expect(reply.textContent).toMatch(/does not load or fabricate metric values/i)
  })

  it("never claims screening was performed", async () => {
    openAssistant()
    await ask("Screen a candidate for me")

    const reply = await screen.findByText(/AI screening is available now/i, { timeout: 5000 })
    expect(reply.textContent).not.toMatch(/I (have )?screened|screening (is )?complete/i)
    expect(reply.textContent).toMatch(/AI Screener page/i)
  })

  it("never claims scheduling was performed", async () => {
    openAssistant()
    await ask("Schedule an interview")

    const reply = await screen.findByText(/Interviews are scheduled from the Interviews page/i, {
      timeout: 5000,
    })
    expect(reply.textContent).not.toMatch(/scheduled (an|the) interview/i)
  })
})
