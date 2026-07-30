import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';

const PROHIBITED_PATTERNS: RegExp[] = [
  /\bage\b/i,
  /\b(?:gender|sex)\b/i,
  /\brace\b/i,
  /\bethnic(?:ity|)\b/i,
  /\btribe\b/i,
  /\breligion\b/i,
  /\bdisab(?:led|ility|ilities)\b/i,
  /\bpregnancy\b/i,
  /\bmarital status\b/i,
  /\bmedical condition\b/i,
  /\battractiveness\b/i,
  /\bcultural fit\b/i,
];

function containsProhibitedReasoning(text: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

function checkFields(fields: string[]): boolean {
  return fields.some((field) => containsProhibitedReasoning(field));
}

export function isProhibitedReasoningDetected(result: ProviderScreeningResult): boolean {
  const textFields: string[] = [result.explanation];

  for (const q of result.matchedQualifications) textFields.push(q);
  for (const q of result.missingQualifications) textFields.push(q);
  for (const e of result.evidence) {
    textFields.push(e.assessment);
    if (e.sourceText) textFields.push(e.sourceText);
  }
  for (const u of result.uncertainties) textFields.push(u);
  for (const r of result.riskFlags) textFields.push(r);
  for (const cs of result.criteriaScores) {
    textFields.push(cs.criterion);
    if (cs.explanation) textFields.push(cs.explanation);
  }

  return checkFields(textFields);
}

export function applyProhibitedReasoningGuard(
  result: ProviderScreeningResult,
): ProviderScreeningResult {
  if (!isProhibitedReasoningDetected(result)) return result;

  const safeExplanation =
    'Screening result flagged for review due to potential non-job-related reasoning.';

  return {
    overallScore: 0,
    recommendation: ScreeningRecommendation.HUMAN_REVIEW,
    confidence: ScreeningConfidence.LOW,
    matchedQualifications: result.matchedQualifications,
    missingQualifications: result.missingQualifications,
    evidence: [
      {
        criterion: 'compliance',
        sourceCategory: ScreeningSourceCategory.UNKNOWN,
        sourceText: 'Prohibited reasoning detected in provider output',
        assessment: 'flag',
        isRequired: true,
      },
    ],
    uncertainties: ['Screening result flagged for prohibited reasoning'],
    riskFlags: ['PROHIBITED_REASONING_DETECTED'],
    explanation: safeExplanation,
    criteriaScores: [],
    prohibitedReasoningDetected: true,
    providerMetadata: result.providerMetadata,
  };
}
