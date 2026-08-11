import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { AiScreeningMalformedResponseError } from '../providers/ai-screening-provider.errors';

const ALLOWED_RECOMMENDATIONS: ReadonlySet<string> = new Set(
  Object.values(ScreeningRecommendation),
);
const ALLOWED_CONFIDENCE: ReadonlySet<string> = new Set(Object.values(ScreeningConfidence));
const ALLOWED_SOURCE_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(ScreeningSourceCategory),
);

const MAX_STRING_LENGTH = 5000;
const MAX_ARRAY_LENGTH = 50;
const MAX_EVIDENCE_LENGTH = 100;
const MAX_CRITERIA_SCORES_LENGTH = 20;

const KNOWN_TOP_LEVEL_KEYS = new Set<string>([
  'overallScore',
  'recommendation',
  'confidence',
  'matchedQualifications',
  'missingQualifications',
  'evidence',
  'uncertainties',
  'riskFlags',
  'explanation',
  'criteriaScores',
  'prohibitedReasoningDetected',
]);

const KNOWN_EVIDENCE_KEYS = new Set<string>([
  'criterion',
  'sourceCategory',
  'sourceText',
  'assessment',
  'score',
  'weight',
  'isRequired',
]);

const KNOWN_CRITERIA_SCORE_KEYS = new Set<string>([
  'criterion',
  'score',
  'maximumScore',
  'weight',
  'explanation',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isBoundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

function isStringArray(v: unknown, maxLen: number): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= maxLen &&
    v.every((item) => isNonEmptyString(item) && isBoundedString(item, MAX_STRING_LENGTH))
  );
}

function checkNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new AiScreeningMalformedResponseError(`Unknown property '${key}' in ${context}`);
    }
  }
}

export function validateScreeningOutput(value: unknown): ProviderScreeningResult {
  if (typeof value !== 'object' || value === null) {
    throw new AiScreeningMalformedResponseError('Output must be a non-null object');
  }

  const obj = value as Record<string, unknown>;

  checkNoUnknownKeys(obj, KNOWN_TOP_LEVEL_KEYS, 'top-level output');

  const overallScore = obj.overallScore;
  if (
    typeof overallScore !== 'number' ||
    !Number.isInteger(overallScore) ||
    overallScore < 0 ||
    overallScore > 100
  ) {
    throw new AiScreeningMalformedResponseError(
      'overallScore must be an integer between 0 and 100',
    );
  }

  const recommendation = obj.recommendation;
  if (typeof recommendation !== 'string' || !ALLOWED_RECOMMENDATIONS.has(recommendation)) {
    throw new AiScreeningMalformedResponseError(
      `recommendation must be one of: ${Array.from(ALLOWED_RECOMMENDATIONS).join(', ')}`,
    );
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'string' || !ALLOWED_CONFIDENCE.has(confidence)) {
    throw new AiScreeningMalformedResponseError(
      `confidence must be one of: ${Array.from(ALLOWED_CONFIDENCE).join(', ')}`,
    );
  }

  if (!isStringArray(obj.matchedQualifications, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError(
      'matchedQualifications must be an array of non-empty strings',
    );
  }

  if (!isStringArray(obj.missingQualifications, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError(
      'missingQualifications must be an array of non-empty strings',
    );
  }

  const evidence = obj.evidence;
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_LENGTH) {
    throw new AiScreeningMalformedResponseError('evidence must be an array');
  }
  for (const item of evidence) {
    if (typeof item !== 'object' || item === null) {
      throw new AiScreeningMalformedResponseError('Each evidence item must be a non-null object');
    }
    const ev = item as Record<string, unknown>;
    checkNoUnknownKeys(ev, KNOWN_EVIDENCE_KEYS, 'evidence item');

    if (typeof ev.criterion !== 'string' || ev.criterion.trim().length === 0) {
      throw new AiScreeningMalformedResponseError(
        'Each evidence item must have a non-empty criterion',
      );
    }
    if (
      typeof ev.sourceCategory !== 'string' ||
      !ALLOWED_SOURCE_CATEGORIES.has(ev.sourceCategory)
    ) {
      throw new AiScreeningMalformedResponseError(
        `Each evidence item must have a valid sourceCategory, got '${ev.sourceCategory}'`,
      );
    }
    if (typeof ev.assessment !== 'string' || ev.assessment.trim().length === 0) {
      throw new AiScreeningMalformedResponseError(
        'Each evidence item must have a non-empty assessment',
      );
    }
  }

  if (!isStringArray(obj.uncertainties, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError(
      'uncertainties must be an array of non-empty strings',
    );
  }

  if (!isStringArray(obj.riskFlags, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError('riskFlags must be an array of non-empty strings');
  }

  const explanation = obj.explanation;
  if (!isNonEmptyString(explanation) || !isBoundedString(explanation, MAX_STRING_LENGTH)) {
    throw new AiScreeningMalformedResponseError(
      'explanation must be a non-empty string with max length 5000',
    );
  }

  const criteriaScores = obj.criteriaScores;
  if (!Array.isArray(criteriaScores) || criteriaScores.length > MAX_CRITERIA_SCORES_LENGTH) {
    throw new AiScreeningMalformedResponseError('criteriaScores must be an array');
  }
  for (const cs of criteriaScores) {
    if (typeof cs !== 'object' || cs === null) {
      throw new AiScreeningMalformedResponseError('Each criteriaScore must be a non-null object');
    }
    const cso = cs as Record<string, unknown>;
    checkNoUnknownKeys(cso, KNOWN_CRITERIA_SCORE_KEYS, 'criteriaScore');

    if (typeof cso.criterion !== 'string' || cso.criterion.trim().length === 0) {
      throw new AiScreeningMalformedResponseError(
        'Each criteriaScore must have a non-empty criterion',
      );
    }
    if (typeof cso.score !== 'number' || typeof cso.maximumScore !== 'number') {
      throw new AiScreeningMalformedResponseError(
        'Each criteriaScore must have numeric score and maximumScore',
      );
    }
    if (cso.maximumScore <= 0 || cso.maximumScore > 100) {
      throw new AiScreeningMalformedResponseError('maximumScore must be between 1 and 100');
    }
    if (cso.score < 0 || cso.score > cso.maximumScore) {
      throw new AiScreeningMalformedResponseError('score must be between 0 and maximumScore');
    }
    if (typeof cso.weight !== 'number' || cso.weight < 0 || cso.weight > 1) {
      throw new AiScreeningMalformedResponseError('weight must be a number between 0 and 1');
    }
  }

  const prohibitedReasoningDetected = obj.prohibitedReasoningDetected;
  if (typeof prohibitedReasoningDetected !== 'boolean') {
    throw new AiScreeningMalformedResponseError('prohibitedReasoningDetected must be a boolean');
  }

  if (prohibitedReasoningDetected && recommendation !== ScreeningRecommendation.HUMAN_REVIEW) {
    throw new AiScreeningMalformedResponseError('prohibitedReasoningDetected forces HUMAN_REVIEW');
  }

  if (
    recommendation === ScreeningRecommendation.SHORTLIST &&
    obj.matchedQualifications.length === 0
  ) {
    throw new AiScreeningMalformedResponseError(
      'SHORTLIST requires at least one matched qualification',
    );
  }

  if (recommendation === ScreeningRecommendation.SHORTLIST && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('SHORTLIST requires supporting evidence');
  }

  if (
    recommendation === ScreeningRecommendation.NOT_SHORTLIST &&
    obj.missingQualifications.length === 0
  ) {
    throw new AiScreeningMalformedResponseError(
      'NOT_SHORTLIST requires at least one missing job-related qualification',
    );
  }

  if (recommendation === ScreeningRecommendation.NOT_SHORTLIST && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('NOT_SHORTLIST requires supporting evidence');
  }

  if (
    recommendation === ScreeningRecommendation.HUMAN_REVIEW &&
    obj.uncertainties.length === 0 &&
    obj.riskFlags.length === 0
  ) {
    throw new AiScreeningMalformedResponseError(
      'HUMAN_REVIEW requires at least one uncertainty or risk flag',
    );
  }

  if (confidence === ScreeningConfidence.HIGH && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('HIGH confidence requires supporting evidence');
  }

  return value as ProviderScreeningResult;
}
