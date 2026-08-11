const SESSION_KEYS = [
  "ai-interview-access-token",
  "ai-interview-conversation-url",
  "ai-interview-conversation-id",
  "ai-interview-meeting-token",
  "ai-interview-provider",
  "ai-interview-candidate-name",
  "ai-interview-job-title",
] as const

export function clearInterviewSession(): void {
  for (const key of SESSION_KEYS) {
    sessionStorage.removeItem(key)
  }
}
