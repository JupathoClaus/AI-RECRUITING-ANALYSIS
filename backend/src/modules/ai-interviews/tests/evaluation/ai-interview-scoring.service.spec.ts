import {
  AiInterviewScoringService,
  ScorableCompetency,
} from '../../evaluation/ai-interview-scoring.service';
import { AiInterviewEvaluationRecommendation } from '@prisma/client';

function comp(score: number, max = 100, weight = 1): ScorableCompetency {
  return {
    competency: `c-${score}`,
    status: score >= 70 ? 'MET' : score <= 40 ? 'NOT_MET' : 'PARTIALLY_MET',
    score,
    maxScore: max,
    weight,
    confidence: 'HIGH',
    rationale: 'test',
    evidence: [],
  };
}

describe('AiInterviewScoringService', () => {
  let svc: AiInterviewScoringService;
  beforeEach(() => {
    svc = new AiInterviewScoringService();
  });

  it('scores PASS at or above 70', () => {
    const r = svc.score([comp(70), comp(80)]);
    expect(r.totalScore).toBe(75);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.PASS);
    expect(r.maximumScore).toBe(100);
  });

  it('scores FAIL at or below 40', () => {
    const r = svc.score([comp(40), comp(30)]);
    expect(r.totalScore).toBe(35);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.FAIL);
  });

  it('scores HOLD strictly between 40 and 70', () => {
    const r = svc.score([comp(55), comp(50)]);
    expect(r.totalScore).toBe(52.5);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.HOLD);
  });

  it('clamps scores to [0, maxScore] (the AI cannot exceed the rubric)', () => {
    const r = svc.score([comp(150, 100), comp(-5, 100)]);
    expect(r.totalScore).toBe(50);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.HOLD);
  });

  it('weights competencies and floors weights at 0.1', () => {
    const r = svc.score([comp(90, 100, 2), comp(50, 100, 1)]);
    expect(r.totalScore).toBe(76.67);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.PASS);

    const floored = svc.score([{ ...comp(100, 100, 0.05) }]);
    expect(floored.totalScore).toBe(100);
  });

  it('tallies evidence verification counts', () => {
    const r = svc.score([
      {
        ...comp(80),
        evidence: [
          { quote: 'a', verification: 'VERBATIM' },
          { quote: 'b', verification: 'VERBATIM' },
        ],
      },
      { ...comp(50), evidence: [{ quote: 'c', verification: 'INFERRED' }] },
    ]);
    expect(r.evidenceTotals).toEqual({
      VERBATIM: 2,
      SUPPORTED: 0,
      INFERRED: 1,
      UNVERIFIED: 0,
    });
  });

  it('returns 0 total when there are no competencies (defensive)', () => {
    const r = svc.score([]);
    expect(r.totalScore).toBe(0);
    expect(r.recommendation).toBe(AiInterviewEvaluationRecommendation.FAIL);
  });
});
