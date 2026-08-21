import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest"

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

  it("concurrent 401 calls refresh only once", async () => {
    let refreshCount = 0
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) { refreshCount++; return mockResponse(200, { data: { accessToken: 'new-token', refreshToken: 'new-refresh' } }) }
      return mockResponse(401, { message: 'Unauthorized' })
    })
    const { apiRequest } = await import("../client")
    await Promise.all([apiRequest("/a"), apiRequest("/b")]).catch(() => {})
    expect(refreshCount).toBe(1)
  })

  it("second 401 after refresh throws immediately", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) return mockResponse(200, { data: { accessToken: 't2', refreshToken: 'r2' } })
      return mockResponse(401, { message: 'Unauthorized' })
    })
    const { apiRequest } = await import("../client")
    const p1 = apiRequest("/a")
    const p2 = apiRequest("/b")
    await expect(p1).rejects.toThrow()
    await expect(p2).rejects.toThrow()
  })

  it("caller AbortSignal cancels pending request", async () => {
    mockFetch.mockImplementation(async (_url: string, opts: RequestInit) => {
      return new Promise<void>((resolve) => { if (opts.signal) opts.signal.addEventListener('abort', () => resolve()) })
    })
    const { apiRequest } = await import("../client")
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await expect(apiRequest("/test", { signal: controller.signal })).rejects.toThrow()
  })

  it("internal timeout surfaces a friendly typed error instead of a raw abort", async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation(async (_url: string, opts: RequestInit) => {
      return new Promise<never>((_resolve, reject) => {
        if (opts.signal) {
          if (opts.signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
          opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        }
      })
    })
    const { apiRequest, ApiErrorResponse } = await import("../client")
    const promise = apiRequest("/test")
    vi.advanceTimersByTime(15000)
    await expect(promise).rejects.toBeInstanceOf(ApiErrorResponse)
    await expect(promise).rejects.toMatchObject({
      statusCode: 408,
      errorCode: 'REQUEST_TIMEOUT',
      message: 'The request took too long and was cancelled. Please try again.',
    })
    vi.useRealTimers()
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

  describe("statusInBody", () => {
    it("200 with statusInBody returns data and status", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { id: 's1', status: 'COMPLETED' }))
      const { apiRequest } = await import("../client")
      const result = await apiRequest<any>("/test", { statusInBody: true })
      expect(result.data).toEqual({ id: 's1', status: 'COMPLETED' })
      expect(result.status).toBe(200)
    })

    it("202 with statusInBody returns data and status", async () => {
      mockFetch.mockResolvedValue(mockResponse(202, { id: 's2', status: 'PENDING' }))
      const { apiRequest } = await import("../client")
      const result = await apiRequest<any>("/test", { statusInBody: true })
      expect(result.data).toEqual({ id: 's2', status: 'PENDING' })
      expect(result.status).toBe(202)
    })

    it("400 with statusInBody still throws ApiErrorResponse", async () => {
      mockFetch.mockResolvedValue(mockResponse(400, { errorCode: 'BAD_REQUEST', message: 'Invalid' }))
      const { apiRequest, ApiErrorResponse } = await import("../client")
      await expect(apiRequest("/test", { statusInBody: true })).rejects.toThrow(ApiErrorResponse)
    })

    it("409 preserves exact errorCode", async () => {
      mockFetch.mockResolvedValue(mockResponse(409, { errorCode: 'RESUME_EXTRACTION_PENDING', message: 'Extraction in progress' }))
      const { apiRequest, ApiErrorResponse } = await import("../client")
      try {
        await apiRequest("/test", { statusInBody: true })
        expect(true).toBe(false)
      } catch (e) {
        const err = e as InstanceType<typeof ApiErrorResponse>
        expect(err.errorCode).toBe('RESUME_EXTRACTION_PENDING')
        expect(err.statusCode).toBe(409)
      }
    })
  })

  describe("FormData", () => {
    it("does not set Content-Type for FormData", async () => {
      let capturedHeaders: any = null
      mockFetch.mockImplementation(async (_url: string, opts: any) => { capturedHeaders = opts.headers; return mockResponse(200, { data: { id: '1' } }) })
      const { apiRequest } = await import("../client")
      const fd = new FormData()
      fd.append('file', new File(['content'], 'test.pdf', { type: 'application/pdf' }))
      await apiRequest("/upload", { method: 'POST', body: fd })
      expect(capturedHeaders['Content-Type']).toBeUndefined()
    })

    it("FormData keeps Authorization header", async () => {
      let capturedHeaders: any = null
      mockFetch.mockImplementation(async (_url: string, opts: any) => { capturedHeaders = opts.headers; return mockResponse(200, { data: { id: '1' } }) })
      const { apiRequest } = await import("../client")
      const fd = new FormData()
      fd.append('file', new File(['content'], 'test.pdf', { type: 'application/pdf' }))
      await apiRequest("/upload", { method: 'POST', body: fd })
      expect(capturedHeaders['Authorization']).toBe('Bearer test-token')
    })
  })

  describe("error responses", () => {
    it("403 throws ApiErrorResponse", async () => {
      mockFetch.mockResolvedValue(mockResponse(403, { errorCode: 'FORBIDDEN', message: 'Access denied' }))
      const { apiRequest, ApiErrorResponse } = await import("../client")
      await expect(apiRequest("/admin")).rejects.toThrow(ApiErrorResponse)
    })

    it("404 throws ApiErrorResponse", async () => {
      mockFetch.mockResolvedValue(mockResponse(404, { errorCode: 'NOT_FOUND', message: 'Not found' }))
      const { apiRequest, ApiErrorResponse } = await import("../client")
      await expect(apiRequest("/missing")).rejects.toThrow(ApiErrorResponse)
    })

    it("500 throws ApiErrorResponse", async () => {
      mockFetch.mockResolvedValue(mockResponse(500, { errorCode: 'INTERNAL_SERVER_ERROR', message: 'Server error' }))
      const { apiRequest, ApiErrorResponse } = await import("../client")
      await expect(apiRequest("/error")).rejects.toThrow(ApiErrorResponse)
    })
  })
})
