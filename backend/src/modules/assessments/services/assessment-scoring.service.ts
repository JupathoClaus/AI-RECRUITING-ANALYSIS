import { Injectable } from '@nestjs/common';
import { AssessmentQuestionType } from '@prisma/client';

export interface ScoringOption {
  id: string;
  isCorrect: boolean;
  points?: number | null;
}

export interface ScoringQuestion {
  id: string;
  type: AssessmentQuestionType;
  points: number;
  competency?: string | null;
  options: ScoringOption[];
}

export interface ScoringResponse {
  questionId: string;
  selectedOptionIds?: string[] | null;
}

export interface QuestionScore {
  questionId: string;
  score: number;
  max: number;
  competency?: string | null;
  deterministic: boolean;
}

export interface DeterministicScoreResult {
  questions: QuestionScore[];
  totalScore: number;
  totalMax: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Deterministic scoring for objective questions. The server — never the AI
 * provider and never the browser — decides whether a choice answer is
 * correct. Open-text answers score 0 here; rubric/AI points are layered on
 * top by the evaluation service, which remains score authority.
 */
@Injectable()
export class AssessmentScoringService {
  scoreDeterministic(
    questions: ScoringQuestion[],
    responses: ScoringResponse[],
  ): DeterministicScoreResult {
    const byId = new Map(responses.map((r) => [r.questionId, r]));
    const scored: QuestionScore[] = [];

    for (const q of questions) {
      if (
        q.type === AssessmentQuestionType.SHORT_TEXT ||
        q.type === AssessmentQuestionType.LONG_TEXT
      ) {
        scored.push({
          questionId: q.id,
          score: 0,
          max: 0,
          competency: q.competency ?? null,
          deterministic: false,
        });
        continue;
      }
      const response = byId.get(q.id);
      const max = q.points ?? 0;
      const score = this.scoreChoice(q, response?.selectedOptionIds ?? []);
      scored.push({
        questionId: q.id,
        score: round2(Math.min(score, max)),
        max,
        competency: q.competency ?? null,
        deterministic: true,
      });
    }

    const totalScore = round2(scored.reduce((s, q) => s + q.score, 0));
    const totalMax = scored.reduce((s, q) => s + q.max, 0);
    return { questions: scored, totalScore, totalMax };
  }

  private scoreChoice(q: ScoringQuestion, selectedIds: string[]): number {
    const selected = new Set(selectedIds);
    const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    if (correctIds.size === 0) return 0;

    if (
      q.type === AssessmentQuestionType.SINGLE_CHOICE ||
      q.type === AssessmentQuestionType.TRUE_FALSE
    ) {
      if (selected.size !== 1) return 0;
      const [only] = [...selected];
      return correctIds.has(only) ? q.points : 0;
    }

    // MULTIPLE_CHOICE: partial credit proportional to correct coverage,
    // penalized by incorrect selections. Bounded to [0, points].
    let correctSelected = 0;
    let incorrectSelected = 0;
    for (const id of selected) {
      if (correctIds.has(id)) correctSelected++;
      else incorrectSelected++;
    }
    const fraction = Math.max(0, (correctSelected - incorrectSelected) / correctIds.size);
    return round2(Math.min(1, fraction) * q.points);
  }
}
