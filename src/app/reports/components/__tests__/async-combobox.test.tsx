import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AsyncCombobox } from "../async-combobox"
import type { PaginatedOption, FetchOptionPage } from "../../hooks/use-paginated-options"

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function createMockFetchPage(options: PaginatedOption[], hasMore = false): FetchOptionPage {
  return vi.fn().mockResolvedValue({ data: options, meta: { page: 1, limit: 50, total: options.length, totalPages: hasMore ? 2 : 1, hasMore } })
}

describe("AsyncCombobox", () => {
  const onChange = vi.fn()
  const label = "Job"
  const placeholder = "Select a job"

  beforeEach(() => { vi.clearAllMocks() })

  it("renders label and input with placeholder", () => {
    render(<AsyncCombobox fetchPage={createMockFetchPage([])} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    expect(screen.getByText(label)).toBeDefined()
    expect(screen.getByPlaceholderText(placeholder)).toBeDefined()
  })

  it("shows selected label as placeholder when option is chosen", () => {
    const opt: PaginatedOption = { id: "1", label: "Software Engineer" }
    render(<AsyncCombobox fetchPage={createMockFetchPage([opt])} selectedOption={opt} onChange={onChange} label={label} placeholder={placeholder} />)
    expect(screen.getByPlaceholderText("Software Engineer")).toBeDefined()
  })

  it("opens listbox on focus and shows options", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "Engineer" }, { id: "2", label: "Designer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByRole("listbox")).toBeDefined() })
    expect(screen.getByText("Engineer")).toBeDefined()
    expect(screen.getByText("Designer")).toBeDefined()
  })

  it("calls onChange when option is clicked", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "Engineer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("Engineer")).toBeDefined() })
    fireEvent.click(screen.getByText("Engineer"))
    expect(onChange).toHaveBeenCalledWith({ id: "1", label: "Engineer" })
  })

  it("closes on Escape and refocuses input", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "Engineer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByRole("listbox")).toBeDefined() })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("selects active option with Enter", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "Engineer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByRole("listbox")).toBeDefined() })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith({ id: "1", label: "Engineer" })
  })

  it("shows error state with retry button", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("Network error"))
    render(<AsyncCombobox fetchPage={fetchPage} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("Network error")).toBeDefined() })
    expect(screen.getByText("Retry")).toBeDefined()
  })

  it("shows no results when options are empty after load", async () => {
    render(<AsyncCombobox fetchPage={createMockFetchPage([])} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("No results")).toBeDefined() })
  })

  it("shows Load More button when hasMore is true", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "A" }, { id: "2", label: "B" }]
    const fetchPage = createMockFetchPage(opts, true)
    render(<AsyncCombobox fetchPage={fetchPage} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("Load More")).toBeDefined() })
  })

  it("aria-activedescendant references a rendered option", async () => {
    const opts: PaginatedOption[] = [{ id: "opt-1", label: "Engineer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByRole("listbox")).toBeDefined() })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    const activeId = input.getAttribute("aria-activedescendant")
    expect(activeId).toBeTruthy()
    const activeEl = document.getElementById(activeId!)
    expect(activeEl).toBeTruthy()
    expect(activeEl!.textContent).toContain("Engineer")
  })

  it("Tab closes the listbox", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "Engineer" }]
    render(<AsyncCombobox fetchPage={createMockFetchPage(opts)} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByRole("listbox")).toBeDefined() })
    fireEvent.keyDown(input, { key: "Tab" })
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("load more button is outside the listbox", async () => {
    const opts: PaginatedOption[] = [{ id: "1", label: "A" }]
    const fetchPage = createMockFetchPage(opts, true)
    render(<AsyncCombobox fetchPage={fetchPage} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("Load More")).toBeDefined() })
    const loadMore = screen.getByText("Load More")
    expect(loadMore.tagName).toBe("BUTTON")
    expect(screen.queryByRole("listbox")?.contains(loadMore)).toBeFalsy()
  })

  it("retry button is outside the listbox", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("fail"))
    render(<AsyncCombobox fetchPage={fetchPage} selectedOption={null} onChange={onChange} label={label} placeholder={placeholder} />)
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => { expect(screen.getByText("Retry")).toBeDefined() })
    const retry = screen.getByText("Retry")
    expect(screen.queryByRole("listbox")?.contains(retry)).toBeFalsy()
  })
})
