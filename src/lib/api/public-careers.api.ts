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
  expectedStartDate?: string | null
  numberOfOpenings?: number | null
  publishedAt: string | null
}

export interface PublicJobsResponse {
  data: PublicJob[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export type PublicScreeningQuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "YES_NO"
  | "NUMBER"
  | "DATE"

export interface PublicScreeningQuestion {
  id: string
  question: string
  description: string | null
  type: PublicScreeningQuestionType
  options: unknown
  required: boolean
  sortOrder: number
}

export interface PublicScreeningQuestionsResponse {
  data: PublicScreeningQuestion[]
}

export interface ScreeningAnswerPayload {
  questionId: string
  textAnswer?: string
  numericAnswer?: number
  dateAnswer?: string
  answer?: unknown
}

export interface PublicApplicationInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  currentJobTitle?: string
  totalExperienceYears?: number
  linkedInUrl?: string
  portfolioUrl?: string
  coverLetter?: string
  preferredLanguage?: string
  consentConfirmed: boolean
  /** Honeypot field — must stay empty. */
  websiteUrl?: string
  screeningAnswers?: ScreeningAnswerPayload[]
}

export interface PublicApplicationResult {
  publicReference: string
  applicationNumber: string | null
  status: "submitted" | "pending_review" | "received"
  resumeAttached: boolean
}

export function getPublicJobs(companySlug: string): Promise<PublicJobsResponse> {
  return apiRequest(`/public/companies/${encodeURIComponent(companySlug)}/jobs`, {
    skipAuth: true,
    timeoutMs: 20000,
  })
}

export function getPublicJob(companySlug: string, jobSlug: string): Promise<PublicJob> {
  return apiRequest(
    `/public/companies/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobSlug)}`,
    { skipAuth: true, timeoutMs: 20000 },
  )
}

export function getPublicScreeningQuestions(
  companySlug: string,
  jobSlug: string,
): Promise<PublicScreeningQuestionsResponse> {
  return apiRequest(
    `/public/companies/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobSlug)}/screening-questions`,
    { skipAuth: true, timeoutMs: 20000 },
  )
}

/**
 * Submits a public application with its CV in ONE atomic request:
 * candidate (find-or-create) + application + resume storage + extraction
 * queueing all happen server-side before this promise resolves.
 */
export async function submitPublicApplication(
  companySlug: string,
  jobSlug: string,
  input: PublicApplicationInput,
  resumeFile: File,
): Promise<PublicApplicationResult> {
  const formData = new FormData()
  formData.append("idempotencyKey", crypto.randomUUID())
  formData.append("firstName", input.firstName)
  formData.append("lastName", input.lastName)
  formData.append("email", input.email)
  if (input.phone) formData.append("phone", input.phone)
  if (input.currentJobTitle) formData.append("currentJobTitle", input.currentJobTitle)
  if (input.totalExperienceYears !== undefined && !Number.isNaN(input.totalExperienceYears)) {
    formData.append("totalExperienceYears", String(input.totalExperienceYears))
  }
  if (input.linkedInUrl) formData.append("linkedInUrl", input.linkedInUrl)
  if (input.portfolioUrl) formData.append("portfolioUrl", input.portfolioUrl)
  if (input.coverLetter) formData.append("coverLetter", input.coverLetter)
  if (input.preferredLanguage) formData.append("preferredLanguage", input.preferredLanguage)
  formData.append("consentConfirmed", String(input.consentConfirmed))
  // Honeypot stays empty for humans.
  formData.append("websiteUrl", "")
  if (input.screeningAnswers?.length) {
    formData.append("screeningAnswers", JSON.stringify(input.screeningAnswers))
  }
  formData.append("file", resumeFile)

  return apiRequest<PublicApplicationResult>(
    `/public/companies/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobSlug)}/applications`,
    {
      method: "POST",
      body: formData,
      skipAuth: true,
      timeoutMs: 120000,
    },
  )
}

export function getPublicApplicationStatus(publicReference: string): Promise<{
  status: string
  submittedAt: string | null
}> {
  return apiRequest(`/public/applications/${encodeURIComponent(publicReference)}/status`, {
    skipAuth: true,
    timeoutMs: 15000,
  })
}
