import { ScreeningConfidence } from './screening-confidence.enum';
import { ScreeningSourceCategory } from './screening-source-category.enum';
import { CriterionRequirementType } from './screening-criterion.type';

/**
 * Status returned by the Qwen model for a single criterion evaluation.
 *
 * FULLY_MET     — candidate clearly meets the criterion with verified evidence
 * PARTIALLY_MET — candidate has related or transferable evidence but not full direct evidence
 * NOT_MET       — criterion is clearly absent from the resume
 * UNCERTAIN     — evidence exists but is ambiguous, unverifiable, or insufficient to decide
 */
export type CriterionStatus = 'FULLY_MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'UNCERTAIN';

export interface CriterionEvidenceItem {
  sourceCategory: ScreeningSourceCategory;
  /** Direct quote or paraphrase from the resume/job description */
  sourceText: string;
}

/**
 * Criterion-level evaluation produced by QwenScreeningProvider.
 * One entry per ScreeningCriterion in the input.
 *
 * The model does NOT produce a numeric score — BackendScoringService does that
 * deterministically from the status + weight.
 */
export interface CriterionEvaluation {
  criterionId: string;
  criterion: string;
  requirementType: CriterionRequirementType;
  status: CriterionStatus;
  /** 2–4 sentence reasoning grounded in evidence */
  reason: string;
  confidence: ScreeningConfidence;
  evidence: CriterionEvidenceItem[];
  /** True if evidence verification found an unverifiable quote */
  evidenceUnverified?: boolean;
}

/**
 * Full structured output from QwenScreeningProvider before deterministic scoring.
 */
export interface QwenScreeningOutput {
  criterionEvaluations: CriterionEvaluation[];
  /** 2–3 sentence overall summary for the recruiter */
  summary: string;
  /** Model-detected concerns (not rejection decisions) */
  warnings: string[];
  prohibitedReasoningDetected: boolean;
}
