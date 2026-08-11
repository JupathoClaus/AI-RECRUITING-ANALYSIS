import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StatusMultiSelect } from "../status-multi-select"

describe("StatusMultiSelect", () => {
  const onChange = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })

  it("renders trigger button with default label", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    expect(screen.getByText("Application status")).toBeDefined()
  })

  it("shows count when statuses are selected", () => {
    render(<StatusMultiSelect selected={["DRAFT", "HIRED"]} onChange={onChange} />)
    expect(screen.getByText("2 selected")).toBeDefined()
  })

  it("opens popup on button click", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("group", { name: "Application status" })).toBeDefined()
  })

  it("shows all status options in popup", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByText("Draft")).toBeDefined()
    expect(screen.getByText("Hired")).toBeDefined()
    expect(screen.getByText("Rejected")).toBeDefined()
  })

  it("calls onChange with added status when checkbox is checked", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByLabelText("Draft"))
    expect(onChange).toHaveBeenCalledWith(["DRAFT"])
  })

  it("calls onChange with removed status when checkbox is unchecked", () => {
    render(<StatusMultiSelect selected={["DRAFT"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByLabelText("Draft"))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("shows Clear All button when selections exist", () => {
    render(<StatusMultiSelect selected={["DRAFT"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByText("Clear All")).toBeDefined()
  })

  it("Clear All resets to empty", () => {
    render(<StatusMultiSelect selected={["DRAFT", "HIRED"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByText("Clear All"))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("closes popup on Escape and refocuses trigger", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(screen.getByRole("group")).toBeDefined()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("group")).toBeNull()
  })

  it("outside click closes popup", () => {
    render(<StatusMultiSelect selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("group")).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole("group")).toBeNull()
  })

  it("aria-controls references unique IDs across instances", () => {
    render(<>
      <StatusMultiSelect selected={[]} onChange={vi.fn()} />
      <StatusMultiSelect selected={["DRAFT"]} onChange={vi.fn()} />
    </>)
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(2)
    const id1 = buttons[0].getAttribute("aria-controls")
    const id2 = buttons[1].getAttribute("aria-controls")
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })
})
