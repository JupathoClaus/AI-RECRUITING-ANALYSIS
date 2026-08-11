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

import { uploadResume, getApplicationResume } from '../files.api'

describe('files.api', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('uploadResume', () => {
    it('creates FormData with file under field name "file"', async () => {
      mockApiRequest.mockResolvedValue({ id: 'f1' })
      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' })
      await uploadResume('app-1', file)
      const call = mockApiRequest.mock.calls[0]
      expect(call[0]).toBe('/applications/app-1/resume')
      expect(call[1].method).toBe('POST')
      const fd = call[1].body as FormData
      expect(fd.get('file')).toBe(file)
    })

    it('forwards AbortSignal', async () => {
      mockApiRequest.mockResolvedValue({ id: 'f2' })
      const controller = new AbortController()
      const file = new File(['c'], 'r.pdf', { type: 'application/pdf' })
      await uploadResume('app-2', file, controller.signal)
      expect(mockApiRequest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }))
    })
  })

  describe('getApplicationResume', () => {
    it('returns resume on success', async () => {
      mockApiRequest.mockResolvedValue({ id: 'f3', originalName: 'resume.pdf' })
      const r = await getApplicationResume('app-3')
      expect(r).toEqual({ id: 'f3', originalName: 'resume.pdf' })
    })

    it('calls correct route', async () => {
      mockApiRequest.mockResolvedValue(null)
      await getApplicationResume('app-4')
      expect(mockApiRequest).toHaveBeenCalledWith('/applications/app-4/resume')
    })
  })
})
