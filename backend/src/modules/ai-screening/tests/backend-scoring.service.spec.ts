import { BackendScoringService } from '../services/backend-scoring.service';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { ScreeningCriterion } from '../domain/screening-criterion.type';

function makeEval(overrides: Partial<CriterionEvaluation> = {}): CriterionEvaluation {
  return {
    criterionId: 'c-1',
    criterion: 'TypeScript',
    requirementType: 'REQUIRED',
    status: 'FULLY_MET',
    reason: 'Strong evidence.',
    confidence: ScreeningConfidence.HIGH,
    evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: 'Built TS apps.' }],
    ...overrides,
  };
}

function makeCriterion(overrides: Partial<ScreeningCriterion> = {}): ScreeningCriterion {
  return {
    id: 'c-1',
    name: 'TypeScript',
    description: 'TypeScript skill',
    requirementType: 'REQUIRED',
    category: 'SKILL',
    weight: 1.0,
    ...overrides,
  };
}

describe('BackendScoringService', () => {
  let scorer: BackendScoringService;
  beforeEach(() => {
    scorer = new BackendScoringService();
  });

  // ── Scoring formula ────────────────────────────────────────────────────────

  it('FULLY_MET with weight 1.0 → score 100', () => {
    const result = scorer.score({
      evaluations: [makeEval()],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(100);
  });

  it('PARTIALLY_MET with weight 1.0 → score 50', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'PARTIALLY_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(50);
  });

  it('NOT_MET with weight 1.0 → score 0', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'NOT_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(0);
  });

  it('UNCERTAIN with weight 1.0 → score 0', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'UNCERTAIN' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(0);
  });

  it('two criteria with different weights produce correct weighted average', () => {
    // c-1: FULLY_MET, weight=0.6 → 0.6 points
    // c-2: NOT_MET,   weight=0.4 → 0.0 points
    // score = 0.6 / 1.0 * 100 = 60
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({ criterionId: 'c-2', criterion: 'Node.js', status: 'NOT_MET' }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.6 }),
        makeCriterion({ id: 'c-2', weight: 0.4, name: 'Node.js' }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(60);
  });

  it('empty evaluations → score 0', () => {
    const result = scorer.score({
      evaluations: [],
      criteria: [],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(0);
  });

  // ── Recommendation logic ───────────────────────────────────────────────────

  it('score ≥ 72 + no hard issues → SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'FULLY_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });

  it('score ≤ 38 with evidence → NOT_SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'NOT_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
  });

  it('HARD_REQUIREMENT NOT_MET → NOT_SHORTLIST regardless of score', () => {
    const result = scorer.score({
      evaluations: [makeEval({ requirementType: 'HARD_REQUIREMENT', status: 'NOT_MET' })],
      criteria: [makeCriterion({ requirementType: 'HARD_REQUIREMENT' })],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
  });

  it('HARD_REQUIREMENT PARTIALLY_MET → HUMAN_REVIEW', () => {
    const result = scorer.score({
      evaluations: [makeEval({ requirementType: 'HARD_REQUIREMENT', status: 'PARTIALLY_MET' })],
      criteria: [makeCriterion({ requirementType: 'HARD_REQUIREMENT' })],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('score between 38–72 → HUMAN_REVIEW', () => {
    // PARTIALLY_MET with weight=1.0 → score 50 → between 38 and 72 → HUMAN_REVIEW
    const result = scorer.score({
      evaluations: [makeEval({ status: 'PARTIALLY_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('unverified critical evidence → HUMAN_REVIEW even with high score', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'FULLY_MET' })],
      criteria: [makeCriterion()],
      hasUnverifiedCriticalEvidence: true,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('scoreCriterion helper works correctly', () => {
    expect(scorer.scoreCriterion('FULLY_MET', 0.5)).toBe(0.5);
    expect(scorer.scoreCriterion('PARTIALLY_MET', 0.5)).toBe(0.25);
    expect(scorer.scoreCriterion('NOT_MET', 0.5)).toBe(0);
    expect(scorer.scoreCriterion('UNCERTAIN', 0.5)).toBe(0);
  });

  // ── Threshold boundaries ───────────────────────────────────────────────────
  // NOTE: the score is a weighted RATIO (points / total weight), so absolute
  // weights are irrelevant — only their relative sizes matter. These tests use
  // two criteria whose relative weights hit the exact boundary ratios.

  it('score 38 → NOT_SHORTLIST (boundary inclusive)', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({ criterionId: 'c-2', criterion: 'Node.js', status: 'NOT_MET' }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.38 }),
        makeCriterion({ id: 'c-2', name: 'Node.js', weight: 0.62 }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(38);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
  });

  it('score 39 → HUMAN_REVIEW (above NOT_SHORTLIST boundary)', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({ criterionId: 'c-2', criterion: 'Node.js', status: 'NOT_MET' }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.39 }),
        makeCriterion({ id: 'c-2', name: 'Node.js', weight: 0.61 }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(39);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('score 71 → HUMAN_REVIEW (below SHORTLIST boundary)', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({ criterionId: 'c-2', criterion: 'Node.js', status: 'NOT_MET' }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.71 }),
        makeCriterion({ id: 'c-2', name: 'Node.js', weight: 0.29 }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(71);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('score 72 → SHORTLIST (boundary inclusive)', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({ criterionId: 'c-2', criterion: 'Node.js', status: 'NOT_MET' }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.72 }),
        makeCriterion({ id: 'c-2', name: 'Node.js', weight: 0.28 }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(72);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });

  // ── Zero criteria / zero weight safety ─────────────────────────────────────

  it('no evaluations at all → HUMAN_REVIEW, never NOT_SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [],
      criteria: [],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(0);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('evaluations with no matching criteria (zero total weight) → HUMAN_REVIEW, never NOT_SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'NOT_MET' })],
      criteria: [],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.overallScore).toBe(0);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  // ── Authoritative requirementType ──────────────────────────────────────────

  it('model-echoed HARD_REQUIREMENT on a REQUIRED criterion does NOT force NOT_SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'c-1', status: 'FULLY_MET' }),
        makeEval({
          criterionId: 'c-2',
          criterion: 'Node.js',
          requirementType: 'HARD_REQUIREMENT',
          status: 'NOT_MET',
        }),
      ],
      criteria: [
        makeCriterion({ id: 'c-1', weight: 0.7 }),
        makeCriterion({ id: 'c-2', weight: 0.3, name: 'Node.js', requirementType: 'REQUIRED' }),
      ],
      hasUnverifiedCriticalEvidence: false,
    });
    // Score 70 → HUMAN_REVIEW. If the model's HARD_REQUIREMENT echo were
    // trusted, this would be NOT_SHORTLIST.
    expect(result.overallScore).toBe(70);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('real HARD_REQUIREMENT from the criterion definition still forces NOT_SHORTLIST', () => {
    const result = scorer.score({
      evaluations: [makeEval({ status: 'NOT_MET' })],
      criteria: [makeCriterion({ requirementType: 'HARD_REQUIREMENT' })],
      hasUnverifiedCriticalEvidence: false,
    });
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
  });

  // ── Deterministic experience duration cap ─────────────────────────────────

  it('caps FULLY_MET on an EXPERIENCE criterion when total duration is below the minimum', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({
          criterionId: 'exp-1',
          criterion: '5+ years backend',
          status: 'FULLY_MET',
          requirementType: 'REQUIRED',
        }),
      ],
      criteria: [
        makeCriterion({
          id: 'exp-1',
          name: '5+ years backend',
          category: 'EXPERIENCE',
          minimumYears: 5,
        }),
      ],
      hasUnverifiedCriticalEvidence: false,
      // Resume shows only 2 years of total employment (certain) — the model
      // claimed FULLY_MET on a 5-year criterion. Deterministic cap downgrades
      // to PARTIALLY_MET → score 50 → HUMAN_REVIEW.
      experienceDuration: { totalRelevantMonths: 24, uncertain: false, periods: [] },
    });
    expect(result.overallScore).toBe(50);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('does NOT cap FULLY_MET when deterministic duration meets the minimum', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'exp-1', criterion: '5+ years backend', status: 'FULLY_MET' }),
      ],
      criteria: [
        makeCriterion({
          id: 'exp-1',
          name: '5+ years backend',
          category: 'EXPERIENCE',
          minimumYears: 5,
        }),
      ],
      hasUnverifiedCriticalEvidence: false,
      experienceDuration: { totalRelevantMonths: 72, uncertain: false, periods: [] },
    });
    expect(result.overallScore).toBe(100);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });

  it('does NOT cap when the duration estimate is uncertain (bare years, gaps)', () => {
    const result = scorer.score({
      evaluations: [
        makeEval({ criterionId: 'exp-1', criterion: '5+ years backend', status: 'FULLY_MET' }),
      ],
      criteria: [
        makeCriterion({
          id: 'exp-1',
          name: '5+ years backend',
          category: 'EXPERIENCE',
          minimumYears: 5,
        }),
      ],
      hasUnverifiedCriticalEvidence: false,
      experienceDuration: { totalRelevantMonths: 24, uncertain: true, periods: [] },
    });
    expect(result.overallScore).toBe(100);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });

  it('does not cap SKILL criteria — duration only constrains EXPERIENCE criteria', () => {
    const result = scorer.score({
      evaluations: [makeEval()],
      criteria: [makeCriterion({ minimumYears: 5 })], // SKILL category
      hasUnverifiedCriticalEvidence: false,
      experienceDuration: { totalRelevantMonths: 12, uncertain: false, periods: [] },
    });
    expect(result.overallScore).toBe(100);
  });
});
