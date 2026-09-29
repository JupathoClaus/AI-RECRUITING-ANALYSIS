import {
  AiInterviewAiOutput,
  AiInterviewCompetencyStatus,
  AiInterviewEvaluationConfidence,
} from './ai-interview-ai-provider.interface';

export interface AiInterviewOutputValidation {
  valid: boolean;
  errors: string[];
  /** Any top-level overall score supplied by the model — always ignored. */
  ignoredOverallScore?: unknown;
}

const STATUSES: AiInterviewCompetencyStatus[] = ['MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN'];
const CONFIDENCES: AiInterviewEvaluationConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
const MAX_STRING = 5000;
const MAX_COMPETENCIES = 20;
const MAX_EVIDENCE_PER_COMPETENCY = 10;
const MAX_LIST_ITEMS = 50;
const MAX_SUMMARY = 2000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

/**
 * Strict validator for AI interview evaluation output. Unknown competency ids
 * are rejected against the server-derived competency set; any model-supplied
 * overall score is dropped (the backend is score authority).
 */
export function validateAiInterviewAiOutput(
  raw: unknown,
  expectedCompetencies: string[],
): { output: AiInterviewAiOutput; validation: AiInterviewOutputValidation } {
  const errors: string[] = [];
  let ignoredOverallScore: unknown;

  if (!isRecord(raw)) {
    return {
      output: emptyOutput(),
      validation: { valid: false, errors: ['Output must be a JSON object.'] },
    };
  }

  if ('overallScore' in raw || 'totalScore' in raw || 'finalScore' in raw || 'score' in raw) {
    ignoredOverallScore =
      (raw as Record<string, unknown>).overallScore ??
      (raw as Record<string, unknown>).totalScore ??
      (raw as Record<string, unknown>).finalScore ??
      (raw as Record<string, unknown>).score;
  }

  if (raw.schemaVersion !== 'v1') errors.push('schemaVersion must be "v1".');

  const expected = new Set(expectedCompetencies);
  const evaluationsRaw = raw.competencyEvaluations;
  const competencyEvaluations: AiInterviewAiOutput['competencyEvaluations'] = [];

  if (!Array.isArray(evaluationsRaw)) {
    errors.push('competencyEvaluations must be an array.');
  } else {
    if (evaluationsRaw.length > MAX_COMPETENCIES) errors.push('Too many competency evaluations.');
    const seen = new Set<string>();
    for (const entry of evaluationsRaw) {
      if (!isRecord(entry) || typeof entry.competency !== 'string') {
        errors.push('Each evaluation must reference a competency.');
        continue;
      }
      if (!expected.has(entry.competency)) {
        errors.push(`Unknown competency in AI output: ${entry.competency}.`);
        continue;
      }
      if (seen.has(entry.competency)) {
        errors.push(`Duplicate evaluation for competency ${entry.competency}.`);
        continue;
      }
      seen.add(entry.competency);

      if (!STATUSES.includes(entry.status as AiInterviewCompetencyStatus)) {
        errors.push(`Invalid status for competency ${entry.competency}.`);
        continue;
      }
      if (
        typeof entry.maxScore !== 'number' ||
        !Number.isFinite(entry.maxScore) ||
        entry.maxScore <= 0
      ) {
        errors.push(`Invalid maxScore for competency ${entry.competency}.`);
        continue;
      }
      if (typeof entry.score !== 'number' || !Number.isFinite(entry.score)) {
        errors.push(`Invalid score for competency ${entry.competency}.`);
        continue;
      }
      if (entry.score < 0 || entry.score > entry.maxScore) {
        errors.push(`Score out of range for competency ${entry.competency}.`);
        continue;
      }
      if (!CONFIDENCES.includes(entry.confidence as AiInterviewEvaluationConfidence)) {
        errors.push(`Invalid confidence for competency ${entry.competency}.`);
        continue;
      }
      if (!str(entry.rationale, MAX_STRING)) {
        errors.push(`Invalid rationale for competency ${entry.competency}.`);
        continue;
      }
      const evidenceRaw = Array.isArray(entry.evidence) ? entry.evidence : [];
      if (evidenceRaw.length > MAX_EVIDENCE_PER_COMPETENCY) {
        errors.push(`Too much evidence for competency ${entry.competency}.`);
        continue;
      }
      const evidence: { quote: string; location: 'candidate_response' }[] = [];
      for (const e of evidenceRaw) {
        if (!isRecord(e) || !str(e.quote, MAX_STRING)) {
          errors.push(`Invalid evidence quote for competency ${entry.competency}.`);
          continue;
        }
        evidence.push({
          quote: (e.quote as string).slice(0, MAX_STRING),
          location: 'candidate_response' as const,
        });
      }
      competencyEvaluations.push({
        competency: entry.competency,
        status: entry.status as AiInterviewCompetencyStatus,
        score: entry.score as number,
        maxScore: entry.maxScore as number,
        evidence,
        rationale: entry.rationale as string,
        confidence: entry.confidence as AiInterviewEvaluationConfidence,
      });
    }
  }

  let summary: string;
  if (raw.summary === undefined) {
    errors.push('summary is required.');
    summary = '';
  } else if (str(raw.summary, MAX_SUMMARY)) {
    summary = raw.summary;
  } else {
    errors.push('summary must be a string under 2000 characters.');
    summary = '';
  }

  const strengths = stringList(raw.strengths, 'strengths', errors);
  const gaps = stringList(raw.gaps, 'gaps', errors);
  const uncertainties = stringList(raw.uncertainties, 'uncertainties', errors);

  return {
    output: { schemaVersion: 'v1', competencyEvaluations, summary, strengths, gaps, uncertainties },
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

function emptyOutput(): AiInterviewAiOutput {
  return {
    schemaVersion: 'v1',
    competencyEvaluations: [],
    summary: '',
    strengths: [],
    gaps: [],
    uncertainties: [],
  };
}
