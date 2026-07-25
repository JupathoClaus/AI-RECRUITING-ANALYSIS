import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePaginatedOptions } from "../use-paginated-options"

describe("usePaginatedOptions", () => {
  const fetchPage = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })

  it("fetches page 1 on mount", async () => {
    fetchPage.mockResolvedValue({ data: [{ id: "1", label: "A" }], meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false } })
    const { result } = renderHook(() => usePaginatedOptions(fetchPage, { selectedOption: null }))
    await waitFor(() => expect(result.current.initialLoading).toBe(false))
    expect(result.current.options).toHaveLength(1)
  })

  it("stale query B cannot be replaced by resolved query A", async () => {
    let resolveA: any, resolveB: any
    const promiseA = new Promise<any>((r) => { resolveA = r })
    const promiseB = new Promise<any>((r) => { resolveB = r })
    fetchPage
      .mockReturnValueOnce(promiseA)
      .mockReturnValueOnce(promiseB)

    const { result } = renderHook(() => usePaginatedOptions(fetchPage, { selectedOption: null }))
    await waitFor(() => expect(result.current.initialLoading).toBe(true))

    // Start query B
    result.current.setQuery("B")
    await new Promise(r => setTimeout(r, 10))

    // Resolve B first
    resolveB({ data: [{ id: "b1", label: "B-One" }], meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false } })
    await new Promise(r => setTimeout(r, 10))
    await waitFor(() => expect(result.current.options[0]?.label).toBe("B-One"))

    // Resolve A (stale) — should not overwrite
    resolveA({ data: [{ id: "a1", label: "A-Stale" }], meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false } })
    await new Promise(r => setTimeout(r, 10))
    expect(result.current.options[0]?.label).toBe("B-One")
  })
})
