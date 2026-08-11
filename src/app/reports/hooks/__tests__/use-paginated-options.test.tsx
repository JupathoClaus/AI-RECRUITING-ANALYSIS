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

  function createDeferredResult<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }

  it("stale query B cannot be replaced by resolved query A", async () => {
    const deferredA = createDeferredResult<{ data: { id: string; label: string }[]; meta: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }>()
    const deferredB = createDeferredResult<{ data: { id: string; label: string }[]; meta: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }>()
    fetchPage
      .mockReturnValueOnce(deferredA.promise)
      .mockReturnValueOnce(deferredB.promise)

    const { result } = renderHook(() => usePaginatedOptions(fetchPage, { selectedOption: null }))
    await waitFor(() => expect(result.current.initialLoading).toBe(true))

    // Start query B
    result.current.setQuery("B")
    await new Promise(r => setTimeout(r, 50))

    // Resolve B first
    deferredB.resolve({ data: [{ id: "b1", label: "B-One" }], meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false } })
    await new Promise(r => setTimeout(r, 50))
    await waitFor(() => expect(result.current.options[0]?.label).toBe("B-One"))

    // Resolve A (stale) — should not overwrite
    deferredA.resolve({ data: [{ id: "a1", label: "A-Stale" }], meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false } })
    await new Promise(r => setTimeout(r, 50))
    expect(result.current.options[0]?.label).toBe("B-One")
  })
})
