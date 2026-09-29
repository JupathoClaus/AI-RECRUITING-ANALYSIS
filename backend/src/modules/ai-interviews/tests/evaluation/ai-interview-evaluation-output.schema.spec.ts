import { validateAiInterviewAiOutput } from '../../evaluation/ai-interview-evaluation-output.schema';

const COMPETENCIES = ['Kubernetes', 'Communication'];

function validPayload() {
  return {
    schemaVersion: 'v1',
    competencyEvaluations: [
      {
        competency: 'Kubernetes',
        status: 'MET',
        score: 80,
        maxScore: 100,
        evidence: [
          { quote: 'led a Kubernetes migration initiative', location: 'candidate_response' },
        ],
        rationale: 'Consistent with the candidate transcript.',
        confidence: 'HIGH',
      },
      {
        competency: 'Communication',
        status: 'PARTIALLY_MET',
        score: 55,
        maxScore: 100,
        evidence: [],
        rationale: 'Partial evidence in the transcript.',
        confidence: 'MEDIUM',
      },
    ],
    summary: 'Solid overall performance.',
    strengths: ['Clear on technical detail'],
    gaps: ['Depth on communication'],
    uncertainties: [],
  };
}

describe('validateAiInterviewAiOutput', () => {
  it('accepts a valid v1 payload', () => {
    const { output, validation } = validateAiInterviewAiOutput(validPayload(), COMPETENCIES);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(output.competencyEvaluations).toHaveLength(2);
  });

  it('drops any model-supplied overall score (backend is score authority)', () => {
    const payload = { ...validPayload(), overallScore: 99, totalScore: 42 };
    const { output, validation } = validateAiInterviewAiOutput(payload, COMPETENCIES);
    expect(validation.valid).toBe(true);
    expect(validation.ignoredOverallScore).toBe(99);
    expect('overallScore' in output).toBe(false);
  });

  it('rejects unknown competencies not in the server-derived set', () => {
    const payload = {
      ...validPayload(),
      competencyEvaluations: [
        ...validPayload().competencyEvaluations,
        {
          competency: 'Empire-building',
          status: 'MET',
          score: 10,
          maxScore: 100,
          evidence: [],
          rationale: 'x',
          confidence: 'HIGH',
        },
      ],
    };
    const { validation } = validateAiInterviewAiOutput(payload, COMPETENCIES);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('Unknown competency');
  });

  it('rejects a score above maxScore and a negative score', () => {
    const over = {
      ...validPayload(),
      competencyEvaluations: [{ ...validPayload().competencyEvaluations[0], score: 150 }],
    };
    const under = {
      ...validPayload(),
      competencyEvaluations: [{ ...validPayload().competencyEvaluations[0], score: -3 }],
    };
    expect(validateAiInterviewAiOutput(over, COMPETENCIES).validation.valid).toBe(false);
    expect(validateAiInterviewAiOutput(under, COMPETENCIES).validation.valid).toBe(false);
  });

  it('rejects wrong schemaVersion, invalid status, and missing summary', () => {
    const v2 = { ...validPayload(), schemaVersion: 'v2' };
    expect(validateAiInterviewAiOutput(v2, COMPETENCIES).validation.valid).toBe(false);

    const badStatus = {
      ...validPayload(),
      competencyEvaluations: [{ ...validPayload().competencyEvaluations[0], status: 'KINDA' }],
    };
    expect(validateAiInterviewAiOutput(badStatus, COMPETENCIES).validation.valid).toBe(false);

    const noSummary = Object.fromEntries(
      Object.entries(validPayload()).filter(([key]) => key !== 'summary'),
    );
    const r = validateAiInterviewAiOutput(noSummary, COMPETENCIES);
    expect(r.validation.valid).toBe(false);
    expect(r.validation.errors.join(' ')).toContain('summary is required');
  });

  it('rejects duplicate evaluations for the same competency', () => {
    const dup = {
      ...validPayload(),
      competencyEvaluations: [
        validPayload().competencyEvaluations[0],
        validPayload().competencyEvaluations[0],
      ],
    };
    const { validation } = validateAiInterviewAiOutput(dup, COMPETENCIES);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('Duplicate evaluation');
  });

  it('fails safely on a non-object payload', () => {
    const { validation } = validateAiInterviewAiOutput('boom', COMPETENCIES);
    expect(validation.valid).toBe(false);
  });
});
