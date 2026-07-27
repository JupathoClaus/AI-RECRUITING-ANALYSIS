import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiRequest = vi.hoisted(() => vi.fn())

vi.mock('../client', () => ({
  apiRequest: mockApiRequest,
  ApiErrorResponse: class extends Error {
    statusCode: number; errorCode: string; errors: string[]
    constructor(statusCode: number, errorCode: string, message: string, errors: string[] = []) {
      super(message); this.name = 'ApiErrorResponse'; this.statusCode = statusCode; this.errorCode = errorCode; this.errors = errors
    }
  },
}))

import { requestAiScreening, listAiScreenings, getLatestAiScreening, getAiScreeningById } from '../ai-screening.api'

describe('ai-screening.api', () => {
  beforeEach(() => vi.clearAllMocks())

  function nestResponse(status: number, data: { action: string; data: { id: string } }) {
    return { data: { statusCode: status, message: 'Success', data }, status, headers: new Headers() }
  }

  it('requestAiScreening calls POST with correct route', async () => {
    mockApiRequest.mockResolvedValue(nestResponse(202, { action: 'CREATED', data: { id: 's1' } }))
    const r = await requestAiScreening('app-1')
    expect(mockApiRequest).toHaveBeenCalledWith('/applications/app-1/ai-screenings', expect.objectContaining({ method: 'POST' }))
    expect(r.data.action).toBe('CREATED')
    expect(r.data.data.id).toBe('s1')
  })

  it('requestAiScreening sends forceRerun', async () => {
    mockApiRequest.mockResolvedValue(nestResponse(202, { action: 'CREATED', data: { id: 's2' } }))
    await requestAiScreening('app-2', { forceRerun: true })
    expect(mockApiRequest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: { forceRerun: true } }))
  })

  it('requestAiScreening forwards signal', async () => {
    const controller = new AbortController()
    mockApiRequest.mockResolvedValue(nestResponse(202, { action: 'CREATED', data: { id: 's3' } }))
    await requestAiScreening('app-3', { signal: controller.signal })
    expect(mockApiRequest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }))
  })

  it('requestAiScreening uses statusInBody: true', async () => {
    mockApiRequest.mockResolvedValue(nestResponse(200, { action: 'REUSED', data: { id: 's4' } }))
    const r = await requestAiScreening('app-4')
    expect(mockApiRequest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ statusInBody: true }))
    expect(r.status).toBe(200)
    expect(r.data.action).toBe('REUSED')
  })

  it('listAiScreenings calls GET with page and limit', async () => {
    mockApiRequest.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
    await listAiScreenings('app-5', { page: 2, limit: 10 })
    expect(mockApiRequest).toHaveBeenCalledWith('/applications/app-5/ai-screenings', expect.objectContaining({ params: { page: 2, limit: 10 } }))
  })

  it('getLatestAiScreening calls GET with signal', async () => {
    const controller = new AbortController()
    mockApiRequest.mockResolvedValue({ id: 's6', status: 'COMPLETED' })
    await getLatestAiScreening('app-6', controller.signal)
    expect(mockApiRequest).toHaveBeenCalledWith('/applications/app-6/ai-screenings/latest', expect.objectContaining({ signal: controller.signal }))
  })

  it('getAiScreeningById calls GET with correct route', async () => {
    const controller = new AbortController()
    mockApiRequest.mockResolvedValue({ id: 's7', status: 'COMPLETED' })
    await getAiScreeningById('s7', controller.signal)
    expect(mockApiRequest).toHaveBeenCalledWith('/ai-screenings/s7', expect.objectContaining({ signal: controller.signal }))
  })
})
