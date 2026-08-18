// OpenAI structured output (strict: true) requires that every property defined
// in an object's "properties" also appears in "required". Truly optional fields
// must use a nullable type union (["string", "null"]) rather than being omitted
// from the required array.
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
    },
    missingQualifications: {
      type: 'array',
      items: { type: 'string' },
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
          // Nullable so OpenAI can omit the actual text when not relevant
          sourceText: { type: ['string', 'null'] },
          assessment: { type: 'string' },
          // Nullable — score is optional per evidence item
          score: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
          // Nullable — weight is optional
          weight: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          // Nullable — isRequired is optional
          isRequired: { type: ['boolean', 'null'] },
        },
        // All declared properties must be in required for strict mode
        required: [
          'criterion',
          'sourceCategory',
          'sourceText',
          'assessment',
          'score',
          'weight',
          'isRequired',
        ],
        additionalProperties: false,
      },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
    },
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
    },
    explanation: { type: 'string' },
    criteriaScores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          maximumScore: { type: 'integer', minimum: 1, maximum: 100 },
          weight: { type: 'number', minimum: 0, maximum: 1 },
          // Nullable — explanation is informational only
          explanation: { type: ['string', 'null'] },
        },
        // All declared properties must be in required for strict mode
        required: ['criterion', 'score', 'maximumScore', 'weight', 'explanation'],
        additionalProperties: false,
      },
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
