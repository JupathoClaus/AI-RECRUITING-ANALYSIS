import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { AiScreeningMalformedResponseError } from '../providers/ai-screening-provider.errors';

const MAX_STRING_LENGTH = 5000;
const MAX_ARRAY_LENGTH = 50;
const MAX_EVIDENCE_LENGTH = 100;
const ALLOWED_RECOMMENDATIONS: string[] = Object.values(ScreeningRecommendation);
const ALLOWED_CONFIDENCE: string[] = Object.values(ScreeningConfidence);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isBoundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

function isStringArray(v: unknown, maxLen: number): v is string[] {
  return Array.isArray(v) && v.length <= maxLen && v.every((item) => isNonEmptyString(item) && isBoundedString(item, MAX_STRING_LENGTH));
}

export function validateScreeningOutput(value: unknown): ProviderScreeningResult {
  if (typeof value !== 'object' || value === null) {
    throw new AiScreeningMalformedResponseError('Output must be a non-null object');
  }

  const obj = value as Record<string, unknown>;

  const overallScore = obj.overallScore;
  if (typeof overallScore !== 'number' || !Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100) {
    throw new AiScreeningMalformedResponseError('overallScore must be an integer between 0 and 100');
  }

  const recommendation = obj.recommendation;
  if (typeof recommendation !== 'string' || !ALLOWED_RECOMMENDATIONS.includes(recommendation)) {
    throw new AiScreeningMalformedResponseError(`recommendation must be one of: ${ALLOWED_RECOMMENDATIONS.join(', ')}`);
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'string' || !ALLOWED_CONFIDENCE.includes(confidence)) {
    throw new AiScreeningMalformedResponseError(`confidence must be one of: ${ALLOWED_CONFIDENCE.join(', ')}`);
  }

  if (!isStringArray(obj.matchedQualifications, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError('matchedQualifications must be an array of non-empty strings');
  }

  if (!isStringArray(obj.missingQualifications, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError('missingQualifications must be an array of non-empty strings');
  }

  const evidence = obj.evidence;
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_LENGTH) {
    throw new AiScreeningMalformedResponseError('evidence must be a non-empty array');
  }
  for (const item of evidence) {
    if (typeof item !== 'object' || item === null) {
      throw new AiScreeningMalformedResponseError('Each evidence item must be a non-null object');
    }
    if (typeof item.criterion !== 'string' || item.criterion.trim().length === 0) {
      throw new AiScreeningMalformedResponseError('Each evidence item must have a non-empty criterion');
    }
    if (typeof item.sourceCategory !== 'string' || item.sourceCategory.trim().length === 0) {
      throw new AiScreeningMalformedResponseError('Each evidence item must have a non-empty sourceCategory');
    }
    if (typeof item.assessment !== 'string' || item.assessment.trim().length === 0) {
      throw new AiScreeningMalformedResponseError('Each evidence item must have a non-empty assessment');
    }
  }

  if (!isStringArray(obj.uncertainties, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError('uncertainties must be an array of non-empty strings');
  }

  if (!isStringArray(obj.riskFlags, MAX_ARRAY_LENGTH)) {
    throw new AiScreeningMalformedResponseError('riskFlags must be an array of non-empty strings');
  }

  const explanation = obj.explanation;
  if (!isNonEmptyString(explanation) || !isBoundedString(explanation, MAX_STRING_LENGTH)) {
    throw new AiScreeningMalformedResponseError('explanation must be a non-empty string with max length 5000');
  }

  const criteriaScores = obj.criteriaScores;
  if (!Array.isArray(criteriaScores)) {
    throw new AiScreeningMalformedResponseError('criteriaScores must be an array');
  }
  for (const cs of criteriaScores) {
    if (typeof cs !== 'object' || cs === null) continue;
    if (typeof cs.score !== 'number' || typeof cs.maximumScore !== 'number') {
      throw new AiScreeningMalformedResponseError('Each criteriaScore must have numeric score and maximumScore');
    }
    if (cs.score < 0 || cs.score > cs.maximumScore) {
      throw new AiScreeningMalformedResponseError('score must be between 0 and maximumScore');
    }
  }

  const prohibitedReasoningDetected = obj.prohibitedReasoningDetected;
  if (typeof prohibitedReasoningDetected !== 'boolean') {
    throw new AiScreeningMalformedResponseError('prohibitedReasoningDetected must be a boolean');
  }

  if (prohibitedReasoningDetected && (recommendation === ScreeningRecommendation.SHORTLIST || recommendation === ScreeningRecommendation.NOT_SHORTLIST)) {
    throw new AiScreeningMalformedResponseError('prohibitedReasoningDetected forces HUMAN_REVIEW');
  }

  if (recommendation === ScreeningRecommendation.SHORTLIST && obj.matchedQualifications.length === 0) {
    throw new AiScreeningMalformedResponseError('SHORTLIST requires at least one matched qualification');
  }

  if (recommendation === ScreeningRecommendation.SHORTLIST && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('SHORTLIST requires supporting evidence');
  }

  if (recommendation === ScreeningRecommendation.NOT_SHORTLIST && obj.missingQualifications.length === 0) {
    throw new AiScreeningMalformedResponseError('NOT_SHORTLIST requires at least one missing job-related qualification');
  }

  if (recommendation === ScreeningRecommendation.NOT_SHORTLIST && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('NOT_SHORTLIST requires supporting evidence');
  }

  if (recommendation === ScreeningRecommendation.HUMAN_REVIEW && obj.uncertainties.length === 0 && obj.riskFlags.length === 0) {
    throw new AiScreeningMalformedResponseError('HUMAN_REVIEW requires at least one uncertainty or risk flag');
  }

  if (confidence === ScreeningConfidence.HIGH && evidence.length === 0) {
    throw new AiScreeningMalformedResponseError('HIGH confidence requires supporting evidence');
  }

  const providerMetadata = obj.providerMetadata;
  if (providerMetadata !== undefined) {
    if (typeof providerMetadata !== 'object' || providerMetadata === null || Array.isArray(providerMetadata)) {
      throw new AiScreeningMalformedResponseError('providerMetadata must be a plain object');
    }
  }

  return value as ProviderScreeningResult;
}
