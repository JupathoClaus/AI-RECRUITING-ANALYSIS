/**
 * Assessment AI evaluation contract. The provider NEVER decides the final
 * score: it returns per-criterion evaluations against the recruiter-approved
 * rubric, and the backend computes the authoritative score.
 */

export type AssessmentAiCriterionStatus = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'UNCERTAIN';
export type AssessmentAiConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AssessmentAiEvidence {
  quote: string;
  location: 'candidate_response';
}

export interface AssessmentAiCriterionResult {
  criterionId: string;
  status: AssessmentAiCriterionStatus;
  score: number;
  maxScore: number;
  evidence: AssessmentAiEvidence[];
  rationale: string;
  confidence: AssessmentAiConfidence;
}

export interface AssessmentAiQuestionEvaluation {
  questionId: string;
  criteria: AssessmentAiCriterionResult[];
}

export interface AssessmentAiOutput {
  schemaVersion: 'v1';
  questionEvaluations: AssessmentAiQuestionEvaluation[];
  strengths: string[];
  gaps: string[];
  uncertainties: string[];
}

export interface AssessmentAiRubricInput {
  criterionId: string;
  name: string;
  description?: string | null;
  guidance?: string | null;
  maxScore: number;
}

export interface AssessmentAiQuestionInput {
  questionId: string;
  prompt: string;
  competency?: string | null;
  responseText: string;
  rubric: AssessmentAiRubricInput[];
}

export interface AssessmentAiEvaluationInput {
  assessmentName: string;
  jobTitle?: string | null;
  jobDescription?: string | null;
  questions: AssessmentAiQuestionInput[];
}

export interface AssessmentAiProviderOptions {
  timeoutMs?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface AssessmentAiProviderMetadata {
  provider: string;
  model?: string;
  promptVersion: string;
  schemaVersion: 'v1';
  latencyMs?: number;
  responseId?: string;
}

export interface AssessmentAiProviderResult {
  output: AssessmentAiOutput;
  metadata: AssessmentAiProviderMetadata;
}

export interface AssessmentAiProvider {
  readonly providerName: string;
  evaluate(
    input: AssessmentAiEvaluationInput,
    options?: AssessmentAiProviderOptions,
  ): Promise<AssessmentAiProviderResult>;
}

export class AssessmentAiProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'AssessmentAiProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}
