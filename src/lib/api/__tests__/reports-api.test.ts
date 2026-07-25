import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

// Mock anchor click to avoid jsdom "Not implemented" error
const mockAnchor = { href: '', download: '', click: vi.fn() }
document.body.appendChild = vi.fn()
document.body.removeChild = vi.fn()
vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any)

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (_i: number) => '',
} as any

import { downloadReportCsv } from "../reports.api"

describe("downloadReportCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    store.set('ai-recruiter-access-token', 'test-token')
  })

  function mockResponse(status: number, body: any, headers: Record<string, string> = {}) {
    const blob = body instanceof Blob ? body : new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'text/csv' })
    return {
      ok: status >= 200 && status < 300,
      status,
      blob: () => Promise.resolve(blob),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      headers: new Headers(headers),
      clone: function () { return this },
    }
  }

  it("returns filename from Content-Disposition", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'content-disposition': 'attachment; filename="report.csv"' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.filename).toBe('report.csv')
  })

  it("returns fallback filename when Content-Disposition missing", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c'))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.filename).toBe('candidate-evaluation.csv')
  })

  it("detects truncation from headers", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'x-export-truncated': 'true', 'x-export-total-count': '5234', 'x-export-returned-count': '5000' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBe(5234)
    expect(result.returnedCount).toBe(5000)
  })

  it("non-truncated export has no truncation", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c'))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBeNull()
  })

  it("malformed truncation counts return null", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'x-export-truncated': 'true', 'x-export-total-count': 'abc', 'x-export-returned-count': '' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBeNull()
    expect(result.returnedCount).toBeNull()
  })

  it("throws on non-2xx", async () => {
    mockFetch.mockResolvedValue(mockResponse(500, 'Server error'))
    await expect(downloadReportCsv('candidate-evaluation')).rejects.toThrow()
  })

  it("Authorization header is sent", async () => {
    let capturedHeaders: any = null
    mockFetch.mockImplementation((_url: string, opts: any) => {
      capturedHeaders = opts.headers
      return Promise.resolve(mockResponse(200, 'a,b,c'))
    })
    await downloadReportCsv('candidate-evaluation')
    expect(capturedHeaders['Authorization']).toBe('Bearer test-token')
  })

  it("credentials is include", async () => {
    let capturedOpts: any = null
    mockFetch.mockImplementation((_url: string, opts: any) => {
      capturedOpts = opts
      return Promise.resolve(mockResponse(200, 'a,b,c'))
    })
    await downloadReportCsv('candidate-evaluation')
    expect(capturedOpts.credentials).toBe('include')
  })
})
