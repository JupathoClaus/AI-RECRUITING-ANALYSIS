export class VerifyCodeResponseDto {
  accessToken: string;
  candidateFirstName: string;
  candidateDisplayName: string;
  jobTitle: string;
  organizationName: string;
  language: string;
  estimatedDurationMinutes: number;
  expiresAt: Date | null;
  provider: string;
  status: string;
}

export class SessionResponseDto {
  candidateFirstName: string;
  candidateDisplayName: string;
  jobTitle: string;
  organizationName: string;
  language: string;
  estimatedDurationMinutes: number;
  expiresAt: Date | null;
  provider: string;
  status: string;
}

export class StartInterviewResponseDto {
  conversationUrl: string;
  conversationId: string;
  provider: string;
  status: string;
  meetingToken?: string | null;
}
