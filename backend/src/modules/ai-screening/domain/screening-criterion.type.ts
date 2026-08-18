/**
 * A single structured job criterion used for AI evaluation.
 *
 * Criteria are built from structured job data (JobSkill, JobEducationRequirement,
 * JobExperienceRequirement) by CriterionBuilderService and passed to the
 * QwenScreeningProvider. They are never invented during screening.
 */
export type CriterionRequirementType = 'HARD_REQUIREMENT' | 'REQUIRED' | 'PREFERRED';

export type CriterionCategory =
  | 'SKILL'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'RESPONSIBILITY'
  | 'OTHER';

export interface ScreeningCriterion {
  /** Stable identifier — used to cross-reference evaluations with criteria */
  id: string;

  /** Short human-readable name, e.g. "TypeScript", "5+ years backend", "Bachelor's degree" */
  name: string;

  /**
   * Full description passed to the model, e.g.
   * "5+ years of production backend development in Node.js or TypeScript [REQUIRED]"
   */
  description: string;

  requirementType: CriterionRequirementType;
  category: CriterionCategory;

  /**
   * Fractional weight used by BackendScoringService.
   * All criteria weights should ideally sum to 1.0, but scoring normalises regardless.
   * Range: 0.0–1.0
   */
  weight: number;

  /**
   * Minimum years of experience required, if applicable.
   * Used by ExperienceDurationService for deterministic comparison.
   */
  minimumYears?: number;

  /**
   * Accepted evidence patterns — plain-text hints for the model only.
   * Example: ["Node.js", "Express", "NestJS", "REST API"]
   * The model must still ground evidence in the resume, not just keyword match.
   */
  acceptedEvidence?: string[];
}
