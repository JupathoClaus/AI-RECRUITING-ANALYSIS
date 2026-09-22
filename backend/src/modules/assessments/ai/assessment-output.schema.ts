import {
  AssessmentAiOutput,
  AssessmentAiCriterionStatus,
  AssessmentAiConfidence,
} from './assessment-ai-provider.interface';

export interface AssessmentOutputValidation {
  valid: boolean;
  errors: string[];
  /** Top-level overallScore (or similar) supplied by the model — always ignored. */
  ignoredOverallScore?: unknown;
}

const STATUSES: AssessmentAiCriterionStatus[] = ['MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN'];
const CONFIDENCES: AssessmentAiConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
const MAX_STRING = 5000;
const MAX_CRITERIA_PER_QUESTION = 20;
const MAX_QUESTIONS = 200;
const MAX_EVIDENCE_PER_CRITERION = 10;
const MAX_LIST_ITEMS = 50;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

/**
 * Strict validator for AI evaluation output. Unknown criterion/question ids
 * are rejected against the authoritative rubric; any model-supplied overall
 * score is dropped (the backend is score authority).
 */
export function validateAssessmentAiOutput(
  raw: unknown,
  expected: { questionId: string; criterionIds: string[] }[],
): { output: AssessmentAiOutput; validation: AssessmentOutputValidation } {
  const errors: string[] = [];
  let ignoredOverallScore: unknown;

  if (!isRecord(raw)) {
    return {
      output: emptyOutput(),
      validation: { valid: false, errors: ['Output must be a JSON object.'] },
    };
  }

  if ('overallScore' in raw || 'totalScore' in raw || 'finalScore' in raw) {
    ignoredOverallScore =
      (raw as Record<string, unknown>).overallScore ??
      (raw as Record<string, unknown>).totalScore ??
      (raw as Record<string, unknown>).finalScore;
  }

  if (raw.schemaVersion !== 'v1') errors.push('schemaVersion must be "v1".');

  const expectedMap = new Map(expected.map((e) => [e.questionId, new Set(e.criterionIds)]));
  const evaluationsRaw = raw.questionEvaluations;
  const questionEvaluations: AssessmentAiOutput['questionEvaluations'] = [];

  if (!Array.isArray(evaluationsRaw)) {
    errors.push('questionEvaluations must be an array.');
  } else {
    if (evaluationsRaw.length > MAX_QUESTIONS) errors.push('Too many question evaluations.');
    const seenQuestions = new Set<string>();
    for (const entry of evaluationsRaw) {
      if (!isRecord(entry) || typeof entry.questionId !== 'string') {
        errors.push('Each evaluation must reference a questionId.');
        continue;
      }
      const allowed = expectedMap.get(entry.questionId);
      if (!allowed) {
        errors.push(`Unknown questionId in AI output: ${entry.questionId}.`);
        continue;
      }
      if (seenQuestions.has(entry.questionId)) {
        errors.push(`Duplicate evaluation for question ${entry.questionId}.`);
        continue;
      }
      seenQuestions.add(entry.questionId);

      if (!Array.isArray(entry.criteria)) {
        errors.push(`criteria must be an array for question ${entry.questionId}.`);
        continue;
      }
      if (entry.criteria.length > MAX_CRITERIA_PER_QUESTION) {
        errors.push(`Too many criteria for question ${entry.questionId}.`);
      }
      const seenCriteria = new Set<string>();
      const criteria: AssessmentAiOutput['questionEvaluations'][number]['criteria'] = [];
      for (const c of entry.criteria) {
        if (!isRecord(c) || typeof c.criterionId !== 'string') {
          errors.push('Each criterion result must reference a criterionId.');
          continue;
        }
        if (!allowed.has(c.criterionId)) {
          errors.push(`Unknown criterionId in AI output: ${c.criterionId}.`);
          continue;
        }
        if (seenCriteria.has(c.criterionId)) {
          errors.push(`Duplicate criterion ${c.criterionId}.`);
          continue;
        }
        seenCriteria.add(c.criterionId);

        if (!STATUSES.includes(c.status as AssessmentAiCriterionStatus)) {
          errors.push(`Invalid status for criterion ${c.criterionId}.`);
          continue;
        }
        if (typeof c.score !== 'number' || !Number.isFinite(c.score)) {
          errors.push(`Invalid score for criterion ${c.criterionId}.`);
          continue;
        }
        if (typeof c.maxScore !== 'number' || !Number.isFinite(c.maxScore) || c.maxScore <= 0) {
          errors.push(`Invalid maxScore for criterion ${c.criterionId}.`);
          continue;
        }
        if (!CONFIDENCES.includes(c.confidence as AssessmentAiConfidence)) {
          errors.push(`Invalid confidence for criterion ${c.criterionId}.`);
          continue;
        }
        if (!str(c.rationale, MAX_STRING)) {
          errors.push(`Invalid rationale for criterion ${c.criterionId}.`);
          continue;
        }
        const evidenceRaw = Array.isArray(c.evidence) ? c.evidence : [];
        if (evidenceRaw.length > MAX_EVIDENCE_PER_CRITERION) {
          errors.push(`Too much evidence for criterion ${c.criterionId}.`);
          continue;
        }
        const evidence: { quote: string; location: 'candidate_response' }[] = [];
        for (const e of evidenceRaw) {
          if (!isRecord(e) || !str(e.quote, MAX_STRING)) {
            errors.push(`Invalid evidence quote for criterion ${c.criterionId}.`);
            continue;
          }
          evidence.push({
            quote: (e.quote as string).slice(0, MAX_STRING),
            location: 'candidate_response' as const,
          });
        }
        criteria.push({
          criterionId: c.criterionId,
          status: c.status as AssessmentAiCriterionStatus,
          score: c.score as number,
          maxScore: c.maxScore as number,
          evidence,
          rationale: c.rationale as string,
          confidence: c.confidence as AssessmentAiConfidence,
        });
      }
      if (criteria.length !== allowed.size) {
        errors.push(
          `Incomplete criteria for question ${entry.questionId}: expected ${allowed.size}, got ${criteria.length}.`,
        );
      }
      questionEvaluations.push({ questionId: entry.questionId, criteria });
    }
  }

  const strengths = stringList(raw.strengths, 'strengths', errors);
  const gaps = stringList(raw.gaps, 'gaps', errors);
  const uncertainties = stringList(raw.uncertainties, 'uncertainties', errors);

  return {
    output: { schemaVersion: 'v1', questionEvaluations, strengths, gaps, uncertainties },
    validation: { valid: errors.length === 0, errors, ignoredOverallScore },
  };
}

function stringList(v: unknown, field: string, errors: string[]): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    errors.push(`${field} must be an array.`);
    return [];
  }
  if (v.length > MAX_LIST_ITEMS) errors.push(`Too many ${field}.`);
  const out: string[] = [];
  for (const item of v.slice(0, MAX_LIST_ITEMS)) {
    if (typeof item !== 'string' || item.length > MAX_STRING) {
      errors.push(`Invalid ${field} entry.`);
      continue;
    }
    out.push(item);
  }
  return out;
}

function emptyOutput(): AssessmentAiOutput {
  return {
    schemaVersion: 'v1',
    questionEvaluations: [],
    strengths: [],
    gaps: [],
    uncertainties: [],
  };
}
