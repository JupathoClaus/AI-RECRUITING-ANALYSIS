/**
 * AI interview post-interview evaluation contract. The provider NEVER decides
 * the final outcome: it returns per-competency evaluations grounded in the
 * candidate's actual transcript, and the backend computes the authoritative
 * score and recommendation. The recruiter always makes the final decision.
 */

export type AiInterviewCompetencyStatus = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'UNCERTAIN';
export type AiInterviewEvaluationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiInterviewAiEvidence {
  quote: string;
  location: 'candidate_response';
}

export interface AiInterviewAiCompetencyResult {
  competency: string;
  status: AiInterviewCompetencyStatus;
  score: number;
  maxScore: number;
  evidence: AiInterviewAiEvidence[];
  rationale: string;
  confidence: AiInterviewEvaluationConfidence;
}

export interface AiInterviewAiOutput {
  schemaVersion: 'v1';
  competencyEvaluations: AiInterviewAiCompetencyResult[];
  summary: string;
  strengths: string[];
  gaps: string[];
  uncertainties: string[];
}

export interface AiInterviewCompetencyInput {
  competency: string;
  description?: string | null;
  guidance?: string | null;
  maxScore: number;
  weight: number;
}

export interface AiInterviewTranscriptInput {
  /** Role of the speaker: 'user' (candidate) or 'assistant' (AI interviewer). */
  role: 'user' | 'assistant' | 'system';
  content: string;
  secondsFromStart?: number | null;
  durationSeconds?: number | null;
}

export interface AiInterviewAiEvaluationInput {
  jobTitle: string;
  jobDescription?: string | null;
  jobResponsibilities?: string | null;
  jobQualifications?: string | null;
  experienceLevel?: string | null;
  competencies: AiInterviewCompetencyInput[];
  transcript: AiInterviewTranscriptInput[];
  /** Concatenated candidate responses only — the evidence verification source. */
  candidateResponseText: string;
}

export interface AiInterviewAiProviderOptions {
  timeoutMs?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface AiInterviewAiProviderMetadata {
  provider: string;
  model?: string;
  promptVersion: string;
  schemaVersion: 'v1';
  latencyMs?: number;
  responseId?: string;
}

export interface AiInterviewAiProviderResult {
  output: AiInterviewAiOutput;
  metadata: AiInterviewAiProviderMetadata;
}

export interface AiInterviewAiProvider {
  readonly providerName: string;
  evaluate(
    input: AiInterviewAiEvaluationInput,
    options?: AiInterviewAiProviderOptions,
  ): Promise<AiInterviewAiProviderResult>;
}

export class AiInterviewAiProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'AiInterviewAiProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}
