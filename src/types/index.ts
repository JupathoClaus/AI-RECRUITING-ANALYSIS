export type JobStatus = "Active" | "Paused" | "Closed" | "Draft"
export type JobType = "full-time" | "part-time" | "contract" | "internship"
export type CandidateStatus = "Applied" | "Screening" | "Interview" | "Offer" | "Hired" | "Rejected"

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

export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  avatar?: string
  jobId: string
  jobTitle: string
  experience: number
  skills: string[]
  aiScore: number
  rating: number
  status: CandidateStatus
  stage: CandidateStatus
  notes: string
  appliedAt: Date
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
  type: "Video" | "Phone" | "On-site" | "AI" | "Technical"
  score?: number
}

export interface Activity {
  id: string
  type: "application" | "interview" | "offer" | "hire" | "rejection"
  candidateName: string
  message: string
  timestamp: Date
}
