export const SCREENING_OUTPUT_SCHEMA_NAME = 'screening_result';

export const SCREENING_OUTPUT_SCHEMA_VERSION = 'v1';

export const SCREENING_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    recommendation: {
      type: 'string',
      enum: ['SHORTLIST', 'NOT_SHORTLIST', 'HUMAN_REVIEW'],
    },
    confidence: {
      type: 'string',
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    matchedQualifications: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 50,
    },
    missingQualifications: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 50,
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          sourceCategory: {
            type: 'string',
            enum: ['RESUME', 'APPLICATION', 'JOB_REQUIREMENT', 'SCREENING_ANSWER', 'UNKNOWN'],
          },
          sourceText: { type: 'string', maxLength: 5000 },
          assessment: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          weight: { type: 'number', minimum: 0, maximum: 1 },
          isRequired: { type: 'boolean' },
        },
        required: ['criterion', 'sourceCategory', 'assessment'],
        additionalProperties: false,
      },
      maxItems: 100,
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
    },
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
    },
    explanation: { type: 'string', maxLength: 5000 },
    criteriaScores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          maximumScore: { type: 'integer', minimum: 1, maximum: 100 },
          weight: { type: 'number', minimum: 0, maximum: 1 },
          explanation: { type: 'string' },
        },
        required: ['criterion', 'score', 'maximumScore', 'weight'],
        additionalProperties: false,
      },
      maxItems: 20,
    },
    prohibitedReasoningDetected: { type: 'boolean' },
  },
  required: [
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
  ],
  additionalProperties: false,
} as const;
