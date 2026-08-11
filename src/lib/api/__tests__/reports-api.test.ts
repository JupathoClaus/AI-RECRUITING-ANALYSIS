import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

const mockAnchor = { href: '', download: '', click: vi.fn() }
document.body.appendChild = vi.fn()
document.body.removeChild = vi.fn()

import { downloadReportCsv } from "../reports.api"

describe("downloadReportCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any)
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn((k: string) => k.includes('token') ? 'test-token' : null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  function mockResponse(status: number, body: any, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      blob: () => Promise.resolve(new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'text/csv' })),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      headers: new Headers(headers),
      clone: function () { return this },
    }
  }

  // ── Normal blob ──
  it("returns filename from Content-Disposition", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'content-disposition': 'attachment; filename="report.csv"' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.filename).toBe('report.csv')
  })

  it("falls back when no Content-Disposition", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c'))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.filename).toBe('candidate-evaluation.csv')
  })

  it("sends Authorization header", async () => {
    let headers: any = null
    mockFetch.mockImplementation((_url: string, opts: any) => { headers = opts.headers; return Promise.resolve(mockResponse(200, 'a,b,c')) })
    await downloadReportCsv('candidate-evaluation')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it("uses credentials include", async () => {
    let opts: any = null
    mockFetch.mockImplementation((_url: string, o: any) => { opts = o; return Promise.resolve(mockResponse(200, 'a,b,c')) })
    await downloadReportCsv('candidate-evaluation')
    expect(opts.credentials).toBe('include')
  })

  // ── Error handling ──
  it("throws on 500", async () => {
    mockFetch.mockResolvedValue(mockResponse(500, 'Server error'))
    await expect(downloadReportCsv('candidate-evaluation')).rejects.toThrow()
  })

  it("throws on 401 without refresh", async () => {
    mockFetch.mockResolvedValue(mockResponse(401, 'Unauthorized'))
    await expect(downloadReportCsv('candidate-evaluation')).rejects.toThrow()
  })

  // ── Truncation ──
  it("detects truncation", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'x-export-truncated': 'true', 'x-export-total-count': '5234', 'x-export-returned-count': '5000' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBe(5234)
    expect(result.returnedCount).toBe(5000)
  })

  it("non-truncated has no truncation", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c'))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBeNull()
  })

  it("malformed counts return null", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, 'a,b,c', { 'x-export-truncated': 'true', 'x-export-total-count': 'abc', 'x-export-returned-count': '' }))
    const result = await downloadReportCsv('candidate-evaluation')
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBeNull()
    expect(result.returnedCount).toBeNull()
  })
})
