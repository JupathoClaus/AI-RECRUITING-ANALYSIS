import { apiRequest } from './client'

export interface StoredFileResponse {
  id: string
  companyId: string
  applicationId: string
  storageKey: string
  originalName: string
  storedName: string
  extension: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  category: string
  status: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export async function uploadResume(
  applicationId: string,
  file: File,
  signal?: AbortSignal,
): Promise<StoredFileResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<StoredFileResponse>(
    `/applications/${applicationId}/resume`,
    {
      method: 'POST',
      body: formData,
      signal,
    },
  )
}

export async function getApplicationResume(
  applicationId: string,
): Promise<StoredFileResponse | null> {
  try {
    return await apiRequest<StoredFileResponse>(
      `/applications/${applicationId}/resume`,
    )
  } catch {
    return null
  }
}
