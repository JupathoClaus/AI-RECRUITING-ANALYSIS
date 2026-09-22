import { describe, it, expect, vi } from "vitest"
import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { QuestionBuilder, toEditable, blankQuestion } from "../question-builder"

const SINGLE = {
  id: "q1",
  type: "SINGLE_CHOICE",
  prompt: "What shows disk usage?",
  instructions: null,
  sortOrder: 0,
  required: true,
  points: 10,
  competency: "Linux",
  aiEvaluated: false,
  aiApproved: true,
  options: [
    { id: "o1", label: "df -h", sortOrder: 0, isCorrect: true },
    { id: "o2", label: "ls", sortOrder: 1, isCorrect: false },
  ],
  rubricCriteria: [],
} as const

describe("QuestionBuilder", () => {
  it("renders existing questions with options", () => {
    const onChange = vi.fn()
    render(<QuestionBuilder questions={toEditable([SINGLE as never])} onChange={onChange} />)
    expect(screen.getByDisplayValue("What shows disk usage?")).toBeTruthy()
    expect(screen.getByDisplayValue("df -h")).toBeTruthy()
  })

  it("switching to long text clears options and enables rubric editing", () => {
    let current = toEditable([SINGLE as never])
    const onChange = vi.fn((next) => { current = next })
    const { rerender } = render(<QuestionBuilder questions={current} onChange={onChange} />)
    const trigger = screen.getByLabelText("Question type")
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText("Long text"))
    rerender(<QuestionBuilder questions={current} onChange={onChange} />)
    expect(screen.queryByDisplayValue("df -h")).toBeNull()
    expect(screen.getByText(/Evaluate with AI/)).toBeTruthy()
  })

  it("blankQuestion seeds a valid single-choice skeleton", () => {
    const q = blankQuestion(2)
    expect(q.type).toBe("SINGLE_CHOICE")
    expect(q.sortOrder).toBe(2)
    expect(q.options).toHaveLength(2)
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1)
  })
})
