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
  const [failedReq, setFailedReq] = useState<{ query: string; page: number; mode: 'replace' | 'append' } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const loadingMoreRef = useRef(false)

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  const doFetch = useCallback(async (q: string, p: number, mode: 'replace' | 'append') => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const version = ++versionRef.current

    if (mode === 'replace') { setInitialLoading(true); setOptions([]); setPage(1) }
    else { setLoadingMore(true); loadingMoreRef.current = true }

    setError(null)
    setFailedReq(null)

    try {
      const result = await fetchPage(q, p, pageSize, controller.signal)
      if (controller.signal.aborted || version !== versionRef.current) return

      if (mode === 'append') {
        setOptions((prev) => {
          const seen = new Map(prev.map((o) => [o.id, o]))
          for (const item of result.data) seen.set(item.id, item)
          return [...seen.values()]
        })
      } else {
        setOptions(result.data)
      }
      setPage(p)
      setHasMore(result.meta.hasMore)
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== versionRef.current) return
      setError(err instanceof Error ? err.message : "Failed to load options")
      setFailedReq({ query: q, page: p, mode })
    } finally {
      if (controller.signal.aborted || version !== versionRef.current) return
      if (mode === 'replace') setInitialLoading(false)
      else { setLoadingMore(false); loadingMoreRef.current = false }
    }
  }, [fetchPage, pageSize])

  // Single authoritative effect: fetches on mount and on every debounced query change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    doFetch(debouncedQuery, 1, 'replace')
    return () => { abortRef.current?.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const loadMore = useCallback(() => {
    if (loadingMore || loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    doFetch(debouncedQuery, page + 1, 'append')
  }, [loadingMore, hasMore, doFetch, debouncedQuery, page])

  const retry = useCallback(() => {
    if (!failedReq) return
    doFetch(failedReq.query, failedReq.page, failedReq.mode)
  }, [failedReq, doFetch])

  // Selected option label persistence (stored as state to avoid ref-in-render)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedOption?.label) setSelectedLabel(selectedOption.label)
    else if (selectedOption) {
      const cached = new Map(options.map((o) => [o.id, o.label]))
      setSelectedLabel(cached.get(selectedOption.id) || null)
    } else setSelectedLabel(null)
  }, [options, selectedOption])

  return {
    query, setQuery, options, page, hasMore,
    initialLoading, loadingMore, error, failedReq,
    retry, loadMore,
    selectedLabel,
  }
}
