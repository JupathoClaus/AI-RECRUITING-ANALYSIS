/**
 * The floating assistant is an intentional static feature guide: there is no
 * assistant endpoint, so it must never fabricate recruitment metrics, never
 * imply it performed an action, and never render a chat input that cannot work.
 */

import { describe, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { FloatingAIAssistant } from "@/components/ai-assistant"

function openGuide() {
  render(<FloatingAIAssistant />)
  fireEvent.click(screen.getByRole("button", { name: /open talentai feature guide/i }))
}

describe("FloatingAIAssistant (static feature guide)", () => {
  afterEach(() => cleanup())

  it("labels itself as preview-only with no live data", () => {
    render(<FloatingAIAssistant />)
    expect(screen.queryByText(/Preview only/i)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /open talentai feature guide/i }))

    expect(screen.getByText("TalentAI feature guide")).toBeTruthy()
    expect(
      screen.getByText(/Preview only — no conversational AI, actions, or live data are available here/i),
    ).toBeTruthy()
  })

  it("links only to real workflows and fabricates no metrics or actions", () => {
    openGuide()

    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/applications",
      "/interviews",
      "/reports",
    ])

    const body = document.body.textContent ?? ""
    expect(body).not.toMatch(/12 active job openings|47 candidates|18 days|34%/i)
    expect(body).not.toMatch(/I (have )?(screened|scheduled)|screening (is )?complete|interview (is )?scheduled/i)
  })

  it("does not render a chat input or send control", () => {
    openGuide()

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /send message/i })).toBeNull()
  })

  it("closes the guide", () => {
    openGuide()

    fireEvent.click(screen.getByRole("button", { name: /close feature guide/i }))

    expect(screen.queryByText("TalentAI feature guide")).toBeNull()
  })
})
