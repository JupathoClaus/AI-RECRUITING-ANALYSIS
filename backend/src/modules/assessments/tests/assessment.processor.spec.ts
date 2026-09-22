import { parseAssessmentWorkerConcurrency } from '../queue/assessment.processor';

describe('parseAssessmentWorkerConcurrency', () => {
  it('defaults to 3 when unset or invalid', () => {
    expect(parseAssessmentWorkerConcurrency(undefined)).toBe(3);
    expect(parseAssessmentWorkerConcurrency('abc')).toBe(3);
    expect(parseAssessmentWorkerConcurrency(null)).toBe(3);
  });

  it('reads the configured value', () => {
    expect(parseAssessmentWorkerConcurrency('5')).toBe(5);
    expect(parseAssessmentWorkerConcurrency(8)).toBe(8);
  });

  it('clamps to the supported range [1, 20]', () => {
    expect(parseAssessmentWorkerConcurrency('0')).toBe(1);
    expect(parseAssessmentWorkerConcurrency('-3')).toBe(1);
    expect(parseAssessmentWorkerConcurrency('500')).toBe(20);
  });
});