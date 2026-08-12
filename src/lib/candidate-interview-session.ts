import type { AiInterviewProvider, AiInterviewStatus } from "@/lib/api/ai-interviews.api"

const STORAGE_KEY = "talentai-candidate-interview"

export interface CandidateInterviewSession {
  accessToken: string
  candidateFirstName: string
  candidateDisplayName: string
  jobTitle: string
  organizationName: string
  language: string
  estimatedDurationMinutes: number
  expiresAt: string | null
  provider: AiInterviewProvider
  status: AiInterviewStatus
}

export function saveCandidateInterviewSession(session: CandidateInterviewSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function loadCandidateInterviewSession(): CandidateInterviewSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as CandidateInterviewSession
    return session.accessToken ? session : null
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearCandidateInterviewSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
