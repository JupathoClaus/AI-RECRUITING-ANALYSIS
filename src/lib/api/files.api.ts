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
      // Resume uploads can be several MB through the dev proxy — give them
      // room so a slow upload does not hit the default 15s request timeout.
      timeoutMs: 60000,
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

export async function downloadStoredFile(fileId: string): Promise<Blob> {
  const response = await apiRequest<{ blob: Blob }>(`/files/${fileId}/download`, { responseType: 'blob' })
  return response.blob
}

export async function uploadCompanyLogo(file: File): Promise<StoredFileResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<StoredFileResponse>('/company/logo', { method: 'POST', body: formData })
}

export async function getCompanyLogo(): Promise<Blob> {
  const response = await apiRequest<{ blob: Blob }>('/company/logo', { responseType: 'blob' })
  return response.blob
}

export async function uploadProfilePhoto(file: File): Promise<StoredFileResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<StoredFileResponse>('/user/avatar', { method: 'POST', body: formData })
}

export async function getProfilePhoto(): Promise<Blob> {
  const response = await apiRequest<{ blob: Blob }>('/user/avatar', { responseType: 'blob' })
  return response.blob
}
