import { parseAiInterviewEvaluationWorkerConcurrency } from '../../evaluation/queue/ai-interview-evaluation.processor';

describe('parseAiInterviewEvaluationWorkerConcurrency', () => {
  it('defaults to 3 when unset or invalid', () => {
    expect(parseAiInterviewEvaluationWorkerConcurrency(undefined)).toBe(3);
    expect(parseAiInterviewEvaluationWorkerConcurrency('abc')).toBe(3);
    expect(parseAiInterviewEvaluationWorkerConcurrency(null)).toBe(3);
  });

  it('reads the configured value', () => {
    expect(parseAiInterviewEvaluationWorkerConcurrency('5')).toBe(5);
    expect(parseAiInterviewEvaluationWorkerConcurrency(8)).toBe(8);
  });

  it('clamps to the supported range [1, 20]', () => {
    expect(parseAiInterviewEvaluationWorkerConcurrency('0')).toBe(1);
    expect(parseAiInterviewEvaluationWorkerConcurrency('-3')).toBe(1);
    expect(parseAiInterviewEvaluationWorkerConcurrency('500')).toBe(20);
  });
});
