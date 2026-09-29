import { Injectable } from '@nestjs/common';
import {
  AiInterviewCompetencyStatus,
  AiInterviewEvaluationConfidence,
  AiInterviewEvaluationRecommendation,
} from '@prisma/client';

export const INTERVIEW_PASS_THRESHOLD = 70;
export const INTERVIEW_FAIL_THRESHOLD = 40;

export interface EvidenceCheck {
  quote: string;
  verification: 'VERBATIM' | 'SUPPORTED' | 'INFERRED' | 'UNVERIFIED';
}

export interface ScorableCompetency {
  competency: string;
  status: AiInterviewCompetencyStatus;
  score: number;
  maxScore: number;
  weight: number;
  confidence: AiInterviewEvaluationConfidence;
  rationale: string;
  evidence: EvidenceCheck[];
}

export interface InterviewScoringResult {
  competencies: ScorableCompetency[];
  totalScore: number;
  maximumScore: number;
  recommendation: AiInterviewEvaluationRecommendation;
  evidenceTotals: Record<'VERBATIM' | 'SUPPORTED' | 'INFERRED' | 'UNVERIFIED', number>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Deterministic post-interview scoring. The backend — never the AI provider
 * and never the browser — decides the total score and the recommendation.
 *
 * - Each competency's score is clamped to [0, maxScore] and weighted 1.0.
 * - The total is the weighted percentage over all competencies (0–100).
 * - Recommendation is a documented function of the total:
 *     PASS  >= 70
 *     FAIL  <= 40
 *     HOLD   in between (needs recruiter judgment)
 * The AI provider returns per-competency evaluations only; any model-supplied
 * overall score was already dropped at the schema boundary.
 */
@Injectable()
export class AiInterviewScoringService {
  score(competencies: ScorableCompetency[]): InterviewScoringResult {
    const clamped = competencies.map((c) => ({
      ...c,
      score: round2(Math.min(Math.max(0, c.score), Math.max(0, c.maxScore))),
    }));

    let weightedScore = 0;
    let weightedMax = 0;
    const evidenceTotals = {
      VERBATIM: 0,
      SUPPORTED: 0,
      INFERRED: 0,
      UNVERIFIED: 0,
    } as InterviewScoringResult['evidenceTotals'];

    for (const c of clamped) {
      const max = Math.max(0, c.maxScore);
      const weight = Math.max(0.1, c.weight);
      weightedScore += c.score * weight;
      weightedMax += max * weight;
      for (const e of c.evidence) {
        evidenceTotals[e.verification]++;
      }
    }

    const totalScore = weightedMax > 0 ? round2((weightedScore / weightedMax) * 100) : 0;
    const maximumScore = 100;
    const recommendation: AiInterviewEvaluationRecommendation =
      totalScore >= INTERVIEW_PASS_THRESHOLD
        ? AiInterviewEvaluationRecommendation.PASS
        : totalScore <= INTERVIEW_FAIL_THRESHOLD
          ? AiInterviewEvaluationRecommendation.FAIL
          : AiInterviewEvaluationRecommendation.HOLD;

    return {
      competencies: clamped,
      totalScore,
      maximumScore,
      recommendation,
      evidenceTotals,
    };
  }
}
