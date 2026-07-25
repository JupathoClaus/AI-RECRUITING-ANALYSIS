import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const store = new Map<string, string>()
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

// Mock localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (_i: number) => '',
  },
  writable: true,
  configurable: true,
})

// Mock URL.createObjectURL and document for blob tests
globalThis.URL.createObjectURL = vi.fn(() => 'blob:test')
globalThis.URL.revokeObjectURL = vi.fn()
const mockAnchor = { href: '', download: '', click: vi.fn() }

describe("apiRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    store.set('ai-recruiter-access-token', 'test-token')
    store.set('ai-recruiter-refresh-token', 'refresh-token')
  })

  function mockResponse(status: number, body: any, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      headers: new Headers({ 'content-type': 'application/json', ...headers }),
      blob: () => Promise.resolve(new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'text/csv' })),
      clone: function () { return this },
    }
  }

  it("successful request returns data", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { data: { id: '1' } }))
    const { apiRequest } = await import("../client")
    const result = await apiRequest("/test")
    expect(result).toEqual({ id: '1' })
  })

  it("sends Authorization header", async () => {
    let headers: any = null
    mockFetch.mockImplementation(async (_url: string, opts: any) => { headers = opts.headers; return mockResponse(200, { data: {} }) })
    const { apiRequest } = await import("../client")
    await apiRequest("/test")
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it("401 triggers refresh and retry", async () => {
    let callCount = 0
    mockFetch.mockImplementation(async (url: string) => {
      callCount++
      if (url.includes('/auth/refresh')) return mockResponse(200, { data: { accessToken: 'new-token', refreshToken: 'new-refresh' } })
      if (callCount === 1) return mockResponse(401, { message: 'Unauthorized' })
      return mockResponse(200, { data: { id: 'retried' } })
    })
    const { apiRequest } = await import("../client")
    const result = await apiRequest("/protected")
    expect(result).toEqual({ id: 'retried' })
  })

  it("refresh failure throws error, no retry", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) return mockResponse(400, { message: 'Refresh failed' })
      return mockResponse(401, { message: 'Unauthorized' })
    })
    const { apiRequest } = await import("../client")
    await expect(apiRequest("/protected")).rejects.toThrow()
  })

  it("AbortSignal cancels pending request", async () => {
    const controller = new AbortController()
    mockFetch.mockImplementation(async (_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        const signal = opts.signal as AbortSignal
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })
    const { apiRequest } = await import("../client")
    const promise = apiRequest("/test", { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow(/Abort/i)
  })
})
