const SESSION_KEYS = [
  "ai-interview-access-token",
  "ai-interview-conversation-url",
  "ai-interview-conversation-id",
  "ai-interview-meeting-token",
  "ai-interview-provider",
  "ai-interview-candidate-first-name",
  "ai-interview-candidate-name",
  "ai-interview-job-title",
  "ai-interview-organization",
  "ai-interview-language",
  "ai-interview-duration",
  "ai-interview-expires-at",
] as const

export function clearInterviewSession(): void {
  for (const key of SESSION_KEYS) {
    sessionStorage.removeItem(key)
  }
}

export function storeInterviewSession(data: Record<string, string>): void {
  for (const key of SESSION_KEYS) {
    if (data[key] !== undefined) {
      sessionStorage.setItem(key, data[key])
    }
  }
}