import { validateAssessmentAiOutput } from '../ai/assessment-output.schema';

const EXPECTED = [{ questionId: 'q1', criterionIds: ['c1', 'c2'] }];

function validOutput() {
  return {
    schemaVersion: 'v1',
    questionEvaluations: [
      {
        questionId: 'q1',
        criteria: [
          {
            criterionId: 'c1',
            status: 'MET',
            score: 4,
            maxScore: 4,
            evidence: [{ quote: 'I fixed DNS', location: 'candidate_response' }],
            rationale: 'Clear evidence.',
            confidence: 'HIGH',
          },
          {
            criterionId: 'c2',
            status: 'PARTIALLY_MET',
            score: 2,
            maxScore: 4,
            evidence: [],
            rationale: 'Partial.',
            confidence: 'MEDIUM',
          },
        ],
      },
    ],
    strengths: ['Strong DNS knowledge'],
    gaps: [],
    uncertainties: [],
  };
}

describe('validateAssessmentAiOutput', () => {
  it('accepts valid output', () => {
    const { output, validation } = validateAssessmentAiOutput(validOutput(), EXPECTED);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(output.questionEvaluations).toHaveLength(1);
  });

  it('ignores (never trusts) a model-supplied overall score', () => {
    const { validation, output } = validateAssessmentAiOutput(
      { ...validOutput(), overallScore: 100 },
      EXPECTED,
    );
    expect(validation.valid).toBe(true);
    expect(validation.ignoredOverallScore).toBe(100);
    expect(output).not.toHaveProperty('overallScore');
  });

  it('rejects unknown criterion ids', () => {
    const raw = validOutput();
    raw.questionEvaluations[0].criteria.push({
      criterionId: 'attacker-criterion',
      status: 'MET',
      score: 100,
      maxScore: 100,
      evidence: [],
      rationale: 'x',
      confidence: 'HIGH',
    });
    const { validation } = validateAssessmentAiOutput(raw, EXPECTED);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/Unknown criterionId/);
  });

  it('rejects unknown question ids', () => {
    const raw = validOutput();
    raw.questionEvaluations.push({ questionId: 'q-evil', criteria: [] });
    const { validation } = validateAssessmentAiOutput(raw, EXPECTED);
    expect(validation.valid).toBe(false);
  });

  it('rejects incomplete criteria coverage', () => {
    const raw = validOutput();
    raw.questionEvaluations[0].criteria = [raw.questionEvaluations[0].criteria[0]];
    const { validation } = validateAssessmentAiOutput(raw, EXPECTED);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/Incomplete criteria/);
  });

  it('rejects malformed output', () => {
    for (const bad of [null, 'text', 42, { schemaVersion: 'v2' }, { schemaVersion: 'v1' }]) {
      const { validation } = validateAssessmentAiOutput(bad, EXPECTED);
      expect(validation.valid).toBe(false);
    }
  });

  it('rejects invalid enums and non-finite scores', () => {
    const raw = validOutput();
    raw.questionEvaluations[0].criteria[0].status = 'PERFECT';
    raw.questionEvaluations[0].criteria[1].score = Number.NaN;
    const { validation } = validateAssessmentAiOutput(raw, EXPECTED);
    expect(validation.valid).toBe(false);
  });
});
