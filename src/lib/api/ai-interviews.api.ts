import { apiRequest } from "./client"

export type AiInterviewProvider = "MOCK" | "TAVUS"
export type AiInterviewStatus = "CREATED" | "SENT" | "ACCESSED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "FAILED"
export type AiInterviewTranscriptStatus = "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED"

export interface CreateAiInterviewRequest {
  applicationId: string
  provider?: AiInterviewProvider
  language?: string
  estimatedDurationMinutes?: number
  notes?: string
  scheduledAt?: string
}

export interface AiInterviewCreatedResponse {
  id: string
  applicationId: string
  companyId: string
  provider: AiInterviewProvider
  status: AiInterviewStatus
  codeDisplayHint: string | null
  rawCode: string
  language: string
  estimatedDurationMinutes: number
  expiresAt: string | null
  createdAt: string
  application: {
    candidate: { firstName: string; lastName: string; email: string }
    job: { title: string }
  }
}

export interface AiInterviewDetail {
  id: string
  applicationId: string
  provider: AiInterviewProvider
  status: AiInterviewStatus
  codeDisplayHint: string | null
  invitationSentAt: string | null
  invitationEmail: string | null
  accessedAt: string | null
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  consentAcceptedAt: string | null
  accommodationRequested: boolean
  accommodationNotes: string | null
  tavusConversationId: string | null
  tavusConversationUrl: string | null
  tavusStatus: string | null
  transcriptStatus: AiInterviewTranscriptStatus
  transcriptUrl: string | null
  transcript: TranscriptTurn[] | null
  recordingStatus: string | null
  recordingUrl: string | null
  recordingMetadata: {
    storage_provider?: string
    storage_uri?: string
    bucket_name?: string
    s3_key?: string
    duration?: number
  } | null
  language: string
  estimatedDurationMinutes: number
  expiresAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  application: {
    candidate: {
      id: string
      firstName: string
      lastName: string
      email: string
    }
    job: { id: string; title: string }
  }
}

export interface TranscriptTurn {
  role?: string
  content?: string
  timestamp?: number
  seconds_from_start?: number
  duration?: number
}

export interface SendInvitationRequest {
  rawCode?: string
  note?: string
}

export interface SendInvitationResponse {
  sent: boolean
  sentAt: string
  codeHint: string
}

export interface RegenerateCodeResponse {
  rawCode: string
  displayHint: string
}

export interface PreviewInvitationResponse {
  candidateName: string
  candidateEmail: string
  jobTitle: string
  companyName: string
  interviewCode: string
  estimatedDurationMinutes: number
  expiresAt: string | null
}

// Recruiter API
export async function createAiInterview(dto: CreateAiInterviewRequest): Promise<AiInterviewCreatedResponse> {
  return apiRequest<AiInterviewCreatedResponse>("/ai-interviews", {
    method: "POST",
    body: dto,
  })
}

export async function getAiInterview(id: string): Promise<AiInterviewDetail> {
  return apiRequest<AiInterviewDetail>(`/ai-interviews/${id}`)
}

export async function listAiInterviews(): Promise<AiInterviewDetail[]> {
  return apiRequest<AiInterviewDetail[]>("/ai-interviews")
}

export async function getAiInterviewsByApplication(applicationId: string): Promise<AiInterviewDetail[]> {
  return apiRequest<AiInterviewDetail[]>(`/ai-interviews/by-application/${applicationId}`)
}

export async function previewAiInterviewInvitation(id: string): Promise<PreviewInvitationResponse> {
  return apiRequest<PreviewInvitationResponse>(`/ai-interviews/${id}/preview`)
}

export async function regenerateAiInterviewCode(id: string): Promise<RegenerateCodeResponse> {
  return apiRequest<RegenerateCodeResponse>(`/ai-interviews/${id}/regenerate-code`, {
    method: "POST",
  })
}

export async function sendAiInterviewInvitation(id: string, dto: SendInvitationRequest): Promise<SendInvitationResponse> {
  return apiRequest<SendInvitationResponse>(`/ai-interviews/${id}/send`, {
    method: "POST",
    body: dto,
  })
}

export async function cancelAiInterview(id: string): Promise<{ cancelled: boolean }> {
  return apiRequest<{ cancelled: boolean }>(`/ai-interviews/${id}/cancel`, {
    method: "POST",
  })
}

export interface ArtifactSyncResponse {
  synced: boolean
  error: string | null
  status: AiInterviewStatus
  transcriptStatus: AiInterviewTranscriptStatus
  transcriptTurns: number
  transcriptUrl: string | null
  recordingStatus: string | null
  recordingUrl: string | null
  tavusStatus: string | null
}

export interface RecordingPlaybackResponse {
  playbackUrl: string
  expiresAt: string
}

export async function getRecordingPlayback(id: string): Promise<RecordingPlaybackResponse> {
  return apiRequest<RecordingPlaybackResponse>(`/ai-interviews/${id}/recording-playback`)
}

export async function syncAiInterviewArtifacts(id: string): Promise<ArtifactSyncResponse> {
  return apiRequest<ArtifactSyncResponse>(`/ai-interviews/${id}/sync-artifacts`, {
    method: "POST",
  })
}

// Public candidate API
export async function verifyInterviewCode(code: string): Promise<{
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
}> {
  return apiRequest("/ai-interviews/public/verify-code", {
    method: "POST",
    body: { code },
    skipAuth: true,
  })
}

export async function getInterviewSession(accessToken: string): Promise<{
  candidateFirstName: string
  candidateDisplayName: string
  jobTitle: string
  organizationName: string
  language: string
  estimatedDurationMinutes: number
  expiresAt: string | null
  provider: AiInterviewProvider
  status: AiInterviewStatus
}> {
  return apiRequest("/ai-interviews/public/session", {
    headers: { Authorization: `Bearer ${accessToken}` },
    skipAuth: true,
  })
}

export async function startAiInterview(
  accessToken: string,
  dto: {
    acknowledgementsAccepted: boolean
    accommodationRequested?: boolean
    accommodationNotes?: string
  },
): Promise<{
  conversationUrl: string
  conversationId: string
  meetingToken?: string | null
  provider: AiInterviewProvider
  status: AiInterviewStatus
}> {
  return apiRequest("/ai-interviews/public/start", {
    method: "POST",
    body: dto,
    headers: { Authorization: `Bearer ${accessToken}` },
    skipAuth: true,
  })
}

export async function completeAiInterview(accessToken: string): Promise<{ completed: boolean }> {
  return apiRequest("/ai-interviews/public/complete", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    skipAuth: true,
  })
}
