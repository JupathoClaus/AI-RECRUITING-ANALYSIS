import { useState, useEffect, useRef, useCallback } from "react"

export interface PaginatedOption {
  id: string
  label: string
}

export type FetchOptionPage = (
  query: string,
  page: number,
  limit: number,
  signal: AbortSignal,
) => Promise<{
  data: PaginatedOption[]
  meta: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean }
}>

export interface PaginatedOptionsState {
  options: PaginatedOption[]
  query: string
  page: number
  hasMore: boolean
  initialLoading: boolean
  loadingMore: boolean
  error: string | null
  failedRequest: { query: string; page: number } | null
}

export function usePaginatedOptions(
  fetchPage: FetchOptionPage,
  opts: { selectedOption: PaginatedOption | null; debounceMs?: number; pageSize?: number },
) {
  const { selectedOption, debounceMs = 300, pageSize = 50 } = opts
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [options, setOptions] = useState<PaginatedOption[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedRequest, setFailedRequest] = useState<{ query: string; page: number } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const selectedCache = useRef<PaginatedOption | null>(selectedOption)
  selectedCache.current = selectedOption

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  // Initial fetch on mount
  useEffect(() => {
    fetchOptions(debouncedQuery, 1, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch when debouncedQuery changes
  useEffect(() => {
    if (page === 1) fetchOptions(debouncedQuery, 1, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const fetchOptions = useCallback(async (q: string, p: number, append: boolean) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const version = ++versionRef.current

    if (!append) setInitialLoading(true)
    else setLoadingMore(true)
    setError(null)
    setFailedRequest(null)

    try {
      const result = await fetchPage(q, p, pageSize, controller.signal)
      if (controller.signal.aborted || version !== versionRef.current) return

      if (append) {
        setOptions((prev) => {
          const seen = new Set(prev.map((o) => o.id))
          const deduped = result.data.filter((o) => !seen.has(o.id))
          return [...prev, ...deduped]
        })
      } else {
        setOptions(result.data)
      }
      setPage(p)
      setHasMore(result.meta.hasMore)
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== versionRef.current) return
      setError(err instanceof Error ? err.message : "Failed to load options")
      setFailedRequest({ query: q, page: p })
    } finally {
      if (controller.signal.aborted || version !== versionRef.current) return
      if (!append) setInitialLoading(false)
      else setLoadingMore(false)
    }
  }, [fetchPage, pageSize])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    fetchOptions(debouncedQuery, page + 1, true)
  }, [loadingMore, hasMore, fetchOptions, debouncedQuery, page])

  const retry = useCallback(() => {
    if (failedRequest) {
      const append = failedRequest.page > 1
      fetchOptions(failedRequest.query, failedRequest.page, append)
    }
  }, [failedRequest, fetchOptions])

  const clearQuery = useCallback(() => {
    setQuery("")
    setDebouncedQuery("")
  }, [])

  // Expose selected option display
  const currentSelectedLabel = selectedOption?.label || selectedCache.current?.label || null

  return {
    query,
    setQuery,
    options,
    page,
    hasMore,
    initialLoading,
    loadingMore,
    error,
    failedRequest,
    retry,
    loadMore,
    clearQuery,
    currentSelectedLabel,
    selectedOption,
    debouncedQuery,
  }
}
