import { Injectable } from '@nestjs/common';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { CriterionEvaluation, CriterionStatus } from '../domain/criterion-evaluation.type';
import { ScreeningCriterion, CriterionRequirementType } from '../domain/screening-criterion.type';

export interface ScoringInput {
  evaluations: CriterionEvaluation[];
  criteria: ScreeningCriterion[];
  /** True when unverified evidence exists on a non-preferred criterion */
  hasUnverifiedCriticalEvidence: boolean;
}

export interface ScoringResult {
  overallScore: number;
  recommendation: ScreeningRecommendation;
  /** Points awarded per criterion ID */
  criterionPoints: Map<string, number>;
  uncertainCount: number;
  unverifiedCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score multipliers by status
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MULTIPLIER: Record<CriterionStatus, number> = {
  FULLY_MET: 1.0,
  PARTIALLY_MET: 0.5,
  NOT_MET: 0.0,
  UNCERTAIN: 0.0, // uncertain evidence earns no automatic positive score
};

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Score ≥ this AND no unmet hard requirements AND no critical uncertainty → SHORTLIST */
const SHORTLIST_THRESHOLD = 72;

/** Score ≤ this AND sufficient evidence quality → NOT_SHORTLIST */
const NOT_SHORTLIST_THRESHOLD = 38;

/**
 * BackendScoringService
 *
 * Computes a deterministic numeric score from criterion-level evaluations
 * returned by the Qwen model.
 *
 * Formula:
 *   For each criterion:
 *     points = criterion.weight × STATUS_MULTIPLIER[status]
 *
 *   overallScore = round( sum(points) / sum(weights) × 100 )
 *
 * Recommendation logic:
 *   SHORTLIST        score ≥ 72 AND no HARD_REQUIREMENT unmet AND no critical uncertainty
 *   NOT_SHORTLIST    score ≤ 38 AND there is enough evidence to be confident
 *   HUMAN_REVIEW     everything in between, or hard requirement partially met,
 *                    or evidence uncertain, or unverified critical evidence
 *
 * The model NEVER directly sets these thresholds — only the service does.
 */
@Injectable()
export class BackendScoringService {
  score(input: ScoringInput): ScoringResult {
    const { evaluations, criteria, hasUnverifiedCriticalEvidence } = input;

    const criterionWeightMap = new Map(criteria.map((c) => [c.id, c]));
    const criterionPoints = new Map<string, number>();

    let weightedPoints = 0;
    let totalWeight = 0;
    let uncertainCount = 0;
    let unverifiedCount = 0;
    let hardRequirementUnmet = false;
    let hardRequirementPartial = false;
    let requiredUncertain = false;

    for (const ev of evaluations) {
      const criterion = criterionWeightMap.get(ev.criterionId);
      const weight = criterion?.weight ?? 0;
      const requirementType: CriterionRequirementType = ev.requirementType;

      if (ev.evidenceUnverified) unverifiedCount++;
      if (ev.status === 'UNCERTAIN') uncertainCount++;

      const multiplier = STATUS_MULTIPLIER[ev.status];
      const points = weight * multiplier;
      criterionPoints.set(ev.criterionId, points);

      weightedPoints += points;
      totalWeight += weight;

      // Track hard requirement violations separately
      if (requirementType === 'HARD_REQUIREMENT') {
        if (ev.status === 'NOT_MET') hardRequirementUnmet = true;
        if (ev.status === 'PARTIALLY_MET') hardRequirementPartial = true;
      }
      if (requirementType === 'REQUIRED' && ev.status === 'UNCERTAIN') {
        requiredUncertain = true;
      }
    }

    // If no weighted criteria at all, score is 0
    const rawRatio = totalWeight > 0 ? weightedPoints / totalWeight : 0;
    const overallScore = Math.round(Math.max(0, Math.min(100, rawRatio * 100)));

    // ── Recommendation ────────────────────────────────────────────────────────
    let recommendation: ScreeningRecommendation;

    if (hardRequirementUnmet) {
      // Unmet hard requirement → not shortlist
      recommendation = ScreeningRecommendation.NOT_SHORTLIST;
    } else if (
      hardRequirementPartial ||
      requiredUncertain ||
      hasUnverifiedCriticalEvidence ||
      uncertainCount > evaluations.length * 0.25
    ) {
      // Partial hard requirement or significant uncertainty → human review
      recommendation = ScreeningRecommendation.HUMAN_REVIEW;
    } else if (overallScore >= SHORTLIST_THRESHOLD) {
      recommendation = ScreeningRecommendation.SHORTLIST;
    } else if (overallScore <= NOT_SHORTLIST_THRESHOLD && evaluations.length > 0) {
      // Only mark NOT_SHORTLIST when there is enough evidence to be confident
      const evidenceCount = evaluations.reduce((sum, e) => sum + e.evidence.length, 0);
      recommendation =
        evidenceCount > 0
          ? ScreeningRecommendation.NOT_SHORTLIST
          : ScreeningRecommendation.HUMAN_REVIEW;
    } else {
      recommendation = ScreeningRecommendation.HUMAN_REVIEW;
    }

    return {
      overallScore,
      recommendation,
      criterionPoints,
      uncertainCount,
      unverifiedCount,
    };
  }

  /**
   * Compute the score for a single criterion in isolation.
   * Used in tests and the benchmark runner.
   */
  scoreCriterion(status: CriterionStatus, weight: number): number {
    return weight * STATUS_MULTIPLIER[status];
  }
}
