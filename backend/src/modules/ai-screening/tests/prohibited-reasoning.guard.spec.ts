import {
  isProhibitedReasoningDetected,
  applyProhibitedReasoningGuard,
} from '../providers/prohibited-reasoning.guard';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ProviderScreeningResult } from '../domain/screening-result.type';

const BASE_RESULT: ProviderScreeningResult = {
  overallScore: 85,
  recommendation: ScreeningRecommendation.SHORTLIST,
  confidence: ScreeningConfidence.HIGH,
  matchedQualifications: ['TypeScript'],
  missingQualifications: [],
  evidence: [
    {
      criterion: 'skills',
      sourceCategory: 'RESUME' as any,
      sourceText: 'Good skills',
      assessment: 'match',
    },
  ],
  uncertainties: [],
  riskFlags: [],
  explanation: 'Candidate has strong technical background.',
  criteriaScores: [
    { criterion: 'skills', score: 85, maximumScore: 100, weight: 0.5, explanation: 'Good match' },
  ],
  prohibitedReasoningDetected: false,
};

describe('isProhibitedReasoningDetected', () => {
  it('returns false for clean result', () => {
    expect(isProhibitedReasoningDetected(BASE_RESULT)).toBe(false);
  });

  it('detects age in explanation', () => {
    const r = { ...BASE_RESULT, explanation: 'Candidate age is a determining factor.' };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
  });

  it('detects gender in explanation', () => {
    const r = { ...BASE_RESULT, explanation: 'This gender is a good fit for the team.' };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
  });

  it('detects race in evidence assessment', () => {
    const r = {
      ...BASE_RESULT,
      evidence: [{ ...BASE_RESULT.evidence[0], assessment: 'race is a concern' }],
    };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
  });

  it('detects religion in risk flags', () => {
    const r = { ...BASE_RESULT, riskFlags: ['religion concern'] };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
  });

  it('detects disability in matched qualifications', () => {
    const r = { ...BASE_RESULT, matchedQualifications: ['disabled candidate'] };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
  });

  it('does not flag safe technical terms', () => {
    const r = {
      ...BASE_RESULT,
      explanation: 'The candidate has the right years of experience for a senior role.',
    };
    expect(isProhibitedReasoningDetected(r)).toBe(false);
  });
});

describe('applyProhibitedReasoningGuard', () => {
  it('returns result unchanged when no prohibited reasoning', () => {
    const result = applyProhibitedReasoningGuard(BASE_RESULT);
    expect(result).toBe(BASE_RESULT);
  });

  it('forces HUMAN_REVIEW when prohibited reasoning detected', () => {
    const r = { ...BASE_RESULT, explanation: 'Candidate age is a determining factor.' };
    const result = applyProhibitedReasoningGuard(r);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.confidence).toBe(ScreeningConfidence.LOW);
    expect(result.prohibitedReasoningDetected).toBe(true);
    expect(result.riskFlags).toContain('PROHIBITED_REASONING_DETECTED');
  });

  it('adds safe risk flag and uncertainty', () => {
    const r = { ...BASE_RESULT, explanation: 'Gender-based assessment.' };
    const result = applyProhibitedReasoningGuard(r);
    expect(result.uncertainties).toContain('Screening result flagged for prohibited reasoning');
    expect(result.riskFlags).toContain('PROHIBITED_REASONING_DETECTED');
  });

  it('replaces explanation with safe message', () => {
    const r = { ...BASE_RESULT, explanation: 'This race is not suitable.' };
    const result = applyProhibitedReasoningGuard(r);
    expect(result.explanation).not.toContain('race');
    expect(result.explanation).toContain('flagged for review');
  });

  it('preserves providerMetadata when forcing HUMAN_REVIEW', () => {
    const r = {
      ...BASE_RESULT,
      explanation: 'Pregnancy would be an issue.',
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
    const result = applyProhibitedReasoningGuard(r);
    expect(result.providerMetadata).toBeDefined();
    expect(result.providerMetadata?.provider).toBe('mock');
  });

  it('detects ethnicity in criteria score explanation', () => {
    const r = {
      ...BASE_RESULT,
      criteriaScores: [
        {
          criterion: 'fit',
          score: 50,
          maximumScore: 100,
          weight: 0.5,
          explanation: 'ethnicity concern',
        },
      ],
    };
    expect(isProhibitedReasoningDetected(r)).toBe(true);
    const result = applyProhibitedReasoningGuard(r);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });
});
