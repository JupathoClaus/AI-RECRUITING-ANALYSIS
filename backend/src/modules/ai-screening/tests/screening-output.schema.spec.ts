import { validateScreeningOutput } from '../schemas/screening-output.schema';
import { SCREENING_OUTPUT_JSON_SCHEMA } from '../schemas/screening-output-json-schema';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';

const VALID_SHORTLIST = {
  overallScore: 85,
  recommendation: 'SHORTLIST',
  confidence: 'HIGH',
  matchedQualifications: ['TypeScript', 'React', 'Node.js'],
  missingQualifications: [],
  evidence: [
    {
      criterion: 'skills',
      sourceCategory: 'RESUME',
      sourceText: 'TypeScript experience',
      assessment: 'match',
      score: 90,
      weight: 0.5,
      isRequired: true,
    },
  ],
  uncertainties: [],
  riskFlags: [],
  explanation: 'Strong match for all required skills.',
  criteriaScores: [
    { criterion: 'skills', score: 90, maximumScore: 100, weight: 0.5, explanation: 'Good skills match' },
  ],
  prohibitedReasoningDetected: false,
};

const VALID_NOT_SHORTLIST = {
  overallScore: 25,
  recommendation: 'NOT_SHORTLIST',
  confidence: 'LOW',
  matchedQualifications: [],
  missingQualifications: ['TypeScript', 'React', 'Node.js'],
  evidence: [
    {
      criterion: 'skills',
      sourceCategory: 'JOB_REQUIREMENT',
      sourceText: 'Required: TypeScript',
      assessment: 'missing',
      isRequired: true,
    },
  ],
  uncertainties: [],
  riskFlags: ['MISSING_REQUIRED_SKILLS'],
  explanation: 'Candidate does not meet minimum requirements.',
  criteriaScores: [
    { criterion: 'skills', score: 10, maximumScore: 100, weight: 0.5, explanation: 'Skills not found' },
  ],
  prohibitedReasoningDetected: false,
};

const VALID_HUMAN_REVIEW = {
  overallScore: 0,
  recommendation: 'HUMAN_REVIEW',
  confidence: 'LOW',
  matchedQualifications: [],
  missingQualifications: [],
  evidence: [
    {
      criterion: 'evidence',
      sourceCategory: 'UNKNOWN',
      sourceText: 'Insufficient evidence',
      assessment: 'insufficient',
    },
  ],
  uncertainties: ['Insufficient resume text'],
  riskFlags: [],
  explanation: 'Cannot evaluate due to insufficient data.',
  criteriaScores: [
    { criterion: 'overall', score: 0, maximumScore: 100, weight: 1, explanation: 'Cannot evaluate' },
  ],
  prohibitedReasoningDetected: false,
};

describe('SCREENING_OUTPUT_JSON_SCHEMA', () => {
  it('is imported from a separate file', () => {
    expect(SCREENING_OUTPUT_JSON_SCHEMA).toBeDefined();
    expect(SCREENING_OUTPUT_JSON_SCHEMA.type).toBe('object');
  });

  it('has additionalProperties=false at top level', () => {
    expect(SCREENING_OUTPUT_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it('does not request providerMetadata from the model', () => {
    const props = SCREENING_OUTPUT_JSON_SCHEMA.properties as Record<string, unknown>;
    expect(props.providerMetadata).toBeUndefined();
  });

  it('required fields match the runtime contract', () => {
    const required = SCREENING_OUTPUT_JSON_SCHEMA.required as unknown as string[];
    expect(required).toContain('overallScore');
    expect(required).toContain('recommendation');
    expect(required).toContain('confidence');
    expect(required).toContain('matchedQualifications');
    expect(required).toContain('missingQualifications');
    expect(required).toContain('evidence');
    expect(required).toContain('uncertainties');
    expect(required).toContain('riskFlags');
    expect(required).toContain('explanation');
    expect(required).toContain('criteriaScores');
    expect(required).toContain('prohibitedReasoningDetected');
  });
});

describe('validateScreeningOutput', () => {
  it('accepts valid SHORTLIST', () => {
    const result = validateScreeningOutput(VALID_SHORTLIST);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });

  it('accepts valid NOT_SHORTLIST', () => {
    const result = validateScreeningOutput(VALID_NOT_SHORTLIST);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
  });

  it('accepts valid HUMAN_REVIEW', () => {
    const result = validateScreeningOutput(VALID_HUMAN_REVIEW);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('rejects unknown top-level property', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, unknownField: 'test' }),
    ).toThrow('Unknown property');
  });

  it('rejects unknown nested evidence property', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        evidence: [
          {
            criterion: 'x',
            sourceCategory: 'RESUME',
            assessment: 'y',
            unknownEvidenceField: true,
          },
        ],
      }),
    ).toThrow('Unknown property');
  });

  it('rejects unknown criteria score property', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        criteriaScores: [
          {
            criterion: 'x',
            score: 50,
            maximumScore: 100,
            weight: 0.5,
            explanation: 'test',
            unknownScoreField: true,
          },
        ],
      }),
    ).toThrow('Unknown property');
  });

  it('rejects malformed criteria score (non-object)', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        criteriaScores: ['string_instead_of_object'],
      }),
    ).toThrow('Each criteriaScore must be a non-null object');
  });

  it('rejects invalid source category', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        evidence: [{ criterion: 'x', sourceCategory: 'INVALID_CAT', assessment: 'y' }],
      }),
    ).toThrow('valid sourceCategory');
  });

  it('rejects invalid weight', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        criteriaScores: [
          { criterion: 'x', score: 50, maximumScore: 100, weight: 99, explanation: 'test' },
        ],
      }),
    ).toThrow('weight must be a number between 0 and 1');
  });

  it('rejects prohibited reasoning with SHORTLIST', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, prohibitedReasoningDetected: true }),
    ).toThrow('prohibitedReasoningDetected forces HUMAN_REVIEW');
  });

  it('rejects prohibited reasoning with NOT_SHORTLIST', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_NOT_SHORTLIST, prohibitedReasoningDetected: true }),
    ).toThrow('prohibitedReasoningDetected forces HUMAN_REVIEW');
  });

  it('rejects null', () => {
    expect(() => validateScreeningOutput(null)).toThrow('non-null object');
  });

  it('rejects score below 0', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, overallScore: -1 }),
    ).toThrow('overallScore');
  });

  it('rejects score above 100', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, overallScore: 101 }),
    ).toThrow('overallScore');
  });

  it('rejects unknown enum values', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, recommendation: 'MAYBE' }),
    ).toThrow('recommendation');
  });

  it('rejects missing evidence', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, evidence: [] }),
    ).toThrow('evidence');
  });

  it('rejects SHORTLIST without qualifications', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_SHORTLIST, matchedQualifications: [] }),
    ).toThrow('SHORTLIST requires at least one matched qualification');
  });

  it('rejects NOT_SHORTLIST without missing qualifications', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_NOT_SHORTLIST, missingQualifications: [] }),
    ).toThrow('NOT_SHORTLIST requires at least one missing');
  });

  it('rejects HUMAN_REVIEW without uncertainties or risk flags', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_HUMAN_REVIEW,
        uncertainties: [],
        riskFlags: [],
      }),
    ).toThrow('HUMAN_REVIEW requires at least one uncertainty');
  });

  it('rejects HIGH confidence without evidence', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_HUMAN_REVIEW, confidence: 'HIGH', evidence: [] }),
    ).toThrow('HIGH confidence requires supporting evidence');
  });

  it('rejects empty explanation', () => {
    expect(() =>
      validateScreeningOutput({ ...VALID_HUMAN_REVIEW, explanation: '' }),
    ).toThrow('explanation must be a non-empty string');
  });

  it('rejects criteriaScore with score > maximumScore', () => {
    expect(() =>
      validateScreeningOutput({
        ...VALID_SHORTLIST,
        criteriaScores: [
          { criterion: 'x', score: 95, maximumScore: 50, weight: 0.5, explanation: 'test' },
        ],
      }),
    ).toThrow('score must be between 0 and maximumScore');
  });
});
