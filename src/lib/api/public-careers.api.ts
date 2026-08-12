import { apiRequest } from "./client"

export interface PublicJob {
  id: string
  jobCode: string
  title: string
  slug: string
  department: { id: string; name: string } | null
  location: { id: string; name: string; city: string | null; countryCode: string | null } | null
  employmentType: string
  workplaceType: string
  experienceLevel: string
  description: string
  responsibilities: string | null
  qualifications: string | null
  benefits: string | null
  salaryCurrency?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  applicationDeadline: string | null
  publishedAt: string | null
}

export interface PublicJobsResponse {
  data: PublicJob[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PublicApplicationInput {
  idempotencyKey: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  coverLetter?: string
  preferredLanguage?: string
  consentConfirmed: boolean
}

export interface PublicApplicationResult {
  publicReference: string
  status: "submitted" | "pending_review"
}

export function getPublicJobs(companySlug: string): Promise<PublicJobsResponse> {
  return apiRequest(`/public/companies/${encodeURIComponent(companySlug)}/jobs`, {
    skipAuth: true,
  })
}

export function getPublicJob(companySlug: string, jobSlug: string): Promise<PublicJob> {
  return apiRequest(
    `/public/companies/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobSlug)}`,
    { skipAuth: true },
  )
}

export function submitPublicApplication(
  companySlug: string,
  jobSlug: string,
  input: PublicApplicationInput,
): Promise<PublicApplicationResult> {
  return apiRequest(
    `/public/companies/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobSlug)}/applications`,
    { method: "POST", body: input, skipAuth: true },
  )
}

export function uploadPublicResume(publicReference: string, file: File) {
  const body = new FormData()
  body.append("file", file)
  return apiRequest<{ uploaded: true; fileName: string; sizeBytes: number }>(
    `/public/applications/${encodeURIComponent(publicReference)}/resume`,
    { method: "POST", body, skipAuth: true },
  )
}
