export type JobStatus = "Active" | "Paused" | "Closed" | "Draft"
export type JobType = "full-time" | "part-time" | "contract" | "internship"

export type CandidateStatus = "ACTIVE" | "INACTIVE" | "BLOCKED"

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "SCREENING"
  | "SHORTLISTED"
  | "ASSESSMENT"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN"
  | "DISQUALIFIED"
  | "ON_HOLD"
  | "ARCHIVED"

export type DisplayApplicationStatus =
  | "Applied"
  | "Screening"
  | "Interview"
  | "Offer"
  | "Hired"
  | "Rejected"

export interface Job {
  id: string
  title: string
  department: string
  location: string
  type: JobType
  salaryMin: number
  salaryMax: number
  description: string
  status: JobStatus
  applicants: number
  createdAt: Date
}

export interface CandidateSkill {
  id: string
  skillId?: string
  name: string
  proficiencyLevel?: string | null
}

export interface CandidateCompanyProfile {
  companyCandidateId?: string
  rating: number
  tags?: string[]
  ownerId?: string
  internalSummary?: string
}

export interface CandidateApplicationSummary {
  id: string
  candidateId: string
  jobId: string
  jobTitle: string
  status: ApplicationStatus
  displayStatus: DisplayApplicationStatus
  stageId?: string
  stageName?: string
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface CandidateApplicationInfo {
  total: number
  active: number
  latest?: CandidateApplicationSummary
  current?: CandidateApplicationSummary
}

export interface CandidateScreeningSummary {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null
  overallScore: number | null
  recommendation: "SHORTLIST" | "NOT_SHORTLIST" | "HUMAN_REVIEW" | null
  confidence: "LOW" | "MEDIUM" | "HIGH" | null
  resultId: string | null
  completedAt: string | null
  pendingRerun: boolean
  failedRerun: boolean
}

export interface Candidate {
  id: string
  firstName: string
  lastName: string
  displayName: string
  email: string
  phone: string
  avatar?: string
  headline?: string
  currentJobTitle?: string
  currentEmployer?: string
  totalExperienceYears: number
  skills: CandidateSkill[]
  aiScore: number | null
  status: CandidateStatus
  source?: string
  version: number
  createdAt: Date
  updatedAt: Date

  companyProfile?: CandidateCompanyProfile
  applicationSummary?: CandidateApplicationInfo
  screening?: CandidateScreeningSummary
  notes?: string
}

export interface Interview {
  id: string
  candidateId: string
  candidateName: string
  jobId: string
  jobTitle: string
  date: Date
  scheduledAt: Date
  duration: number
  status: "Scheduled" | "Completed" | "Cancelled"
  backendStatus: "SCHEDULED" | "CONFIRMED" | "RESCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED"
  type: "Video" | "Phone" | "On-site" | "AI" | "Technical"
  score?: number
  version: number
  applicationId?: string
}

export interface Activity {
  id: string
  type: "application" | "interview" | "offer" | "hire" | "rejection"
  candidateName: string
  message: string
  timestamp: Date
}
