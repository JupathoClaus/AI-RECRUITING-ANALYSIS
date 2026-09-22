import { describe, it, expect } from "vitest"
import {
  formatCountdown,
  formatDurationMs,
  assignmentStatusLabel,
  sessionStatusLabel,
  thresholdNote,
  answeredPositions,
} from "../assessment-helpers"

describe("formatCountdown", () => {
  it("formats mm:ss and hh:mm:ss", () => {
    expect(formatCountdown(90)).toBe("01:30")
    expect(formatCountdown(3661)).toBe("1:01:01")
    expect(formatCountdown(0)).toBe("00:00")
    expect(formatCountdown(-5)).toBe("00:00")
  })
})

describe("formatDurationMs", () => {
  it("formats minutes and hours, em-dash for null", () => {
    expect(formatDurationMs(null)).toBe("—")
    expect(formatDurationMs(20 * 60000)).toBe("20 min")
    expect(formatDurationMs(90 * 60000)).toBe("1h 30m")
  })
})

describe("status labels", () => {
  it("maps assignment and session statuses to human labels", () => {
    expect(assignmentStatusLabel("ASSIGNED")).toBe("Awaiting candidate")
    expect(assignmentStatusLabel("EVALUATED")).toBe("Evaluated")
    expect(sessionStatusLabel("NOT_STARTED")).toBe("Not started")
    expect(sessionStatusLabel("EVALUATING")).toBe("Evaluating")
  })
})

describe("thresholdNote", () => {
  it("reports meets/below without deciding", () => {
    expect(thresholdNote(84, 70)).toMatch(/Meets/)
    expect(thresholdNote(60, 70)).toMatch(/Below/)
    expect(thresholdNote(60, null)).toBeNull()
  })
})

describe("answeredPositions", () => {
  const questions = [
    { id: "q1", type: "SINGLE_CHOICE", required: true },
    { id: "q2", type: "LONG_TEXT", required: true },
    { id: "q3", type: "SHORT_TEXT", required: false },
  ]
  it("counts answers and flags missing required questions", () => {
    const answers = new Map([
      ["q1", { selectedOptionIds: ["o1"] }],
      ["q2", { textAnswer: "  " }],
    ])
    const stats = answeredPositions({ questions, answers })
    expect(stats.answered).toBe(1)
    expect(stats.total).toBe(3)
    expect(stats.missingRequired).toEqual(["q2"])
  })

  it("passes a fully answered set", () => {
    const answers = new Map([
      ["q1", { selectedOptionIds: ["o1"] }],
      ["q2", { textAnswer: "done" }],
    ])
    const stats = answeredPositions({ questions, answers })
    expect(stats.answered).toBe(2)
    expect(stats.missingRequired).toEqual([])
  })
})
