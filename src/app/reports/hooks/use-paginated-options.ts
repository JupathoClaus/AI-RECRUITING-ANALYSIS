import { useState, useEffect, useRef, useCallback } from "react"

export interface PaginatedOption { id: string; label: string }

export type FetchOptionPage = (
  query: string, page: number, limit: number, signal: AbortSignal,
) => Promise<{
  data: PaginatedOption[]
  meta: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean }
}>

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
  const [failedRequest, setFailedRequest] = useState<{ query: string; page: number; mode: 'replace' | 'append' } | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(selectedOption?.label || null)

  const abortRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const isMounted = useRef(true)

  // Store the selected label from options cache
  const optionsCache = useRef<Map<string, PaginatedOption>>(new Map())
  useEffect(() => {
    for (const opt of options) optionsCache.current.set(opt.id, opt)
    // Update selected label if we have a better one
    if (selectedOption) {
      const cached = optionsCache.current.get(selectedOption.id)
      if (cached?.label) setSelectedLabel(cached.label)
    }
  }, [options, selectedOption])

  const fetchOptions = useCallback(async (q: string, p: number, mode: 'replace' | 'append') => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const version = ++versionRef.current

    if (mode === 'replace') { setInitialLoading(true); setOptions([]); setPage(1) }
    else { setLoadingMore(true) }

    setError(null)
    setFailedRequest(null)

    try {
      const result = await fetchPage(q, p, pageSize, controller.signal)
      if (!isMounted.current || controller.signal.aborted || version !== versionRef.current) return

      if (mode === 'append') {
        setOptions((prev) => {
          const ids = new Map(prev.map((o) => [o.id, o]))
          for (const item of result.data) ids.set(item.id, item)
          return [...ids.values()]
        })
      } else {
        setOptions(result.data)
      }
      setPage(p)
      setHasMore(result.meta.hasMore)
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== versionRef.current) return
      setError(err instanceof Error ? err.message : "Failed to load options")
      setFailedRequest({ query: q, page: p, mode })
    } finally {
      if (controller.signal.aborted || version !== versionRef.current) return
      if (mode === 'replace') setInitialLoading(false)
      else setLoadingMore(false)
    }
  }, [fetchPage, pageSize])

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  // Initial mount fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOptions("", 1, 'replace')
    return () => { isMounted.current = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // React to debounced query changes
  useEffect(() => {
    if (debouncedQuery === "") return // handled by mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOptions(debouncedQuery, 1, 'replace')
  }, [debouncedQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    fetchOptions(debouncedQuery, page + 1, 'append')
  }, [loadingMore, hasMore, fetchOptions, debouncedQuery, page])

  const retry = useCallback(() => {
    if (!failedRequest) return
    fetchOptions(failedRequest.query, failedRequest.page, failedRequest.mode)
  }, [failedRequest, fetchOptions])

  const clearQueryFn = useCallback(() => {
    setQuery("")
    setDebouncedQuery("")
    fetchOptions("", 1, 'replace')
  }, [fetchOptions])

  return {
    query, setQuery, options, page, hasMore,
    initialLoading, loadingMore, error, failedRequest,
    retry, loadMore, clearQuery: clearQueryFn,
    selectedLabel, selectedOption,
  }
}
