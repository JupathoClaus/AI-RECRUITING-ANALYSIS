import { MockAiInterviewEvaluationProvider } from '../../evaluation/mock-ai-interview-evaluation.provider';
import { AiInterviewAiProviderError } from '../../evaluation/ai-interview-ai-provider.interface';

const RESPONSE =
  'I led a Kubernetes migration at my last job and coordinated with stakeholders on Kubernetes deliverables.';

function input(overrides: Record<string, unknown> = {}) {
  return {
    jobTitle: 'DevOps Engineer',
    jobDescription: 'Run infrastructure.',
    competencies: [
      { competency: 'Kubernetes', description: null, guidance: null, maxScore: 100, weight: 1 },
      { competency: 'Networking', description: null, guidance: null, maxScore: 100, weight: 1 },
    ],
    transcript: [
      { role: 'assistant' as const, content: 'Tell me about your Kubernetes experience.' },
      { role: 'user' as const, content: RESPONSE },
    ],
    candidateResponseText: RESPONSE,
    ...overrides,
  };
}

describe('MockAiInterviewEvaluationProvider', () => {
  it('is a deterministic default scenario, quoting verbatim evidence', async () => {
    const provider = new MockAiInterviewEvaluationProvider();
    const result = await provider.evaluate(input());
    expect(result.metadata.provider).toBe('mock');
    const [kube] = result.output.competencyEvaluations.filter((c) => c.competency === 'Kubernetes');
    expect(kube.score).toBe(55);
    expect(kube.status).toBe('PARTIALLY_MET');
    expect(RESPONSE.includes(kube.evidence[0].quote)).toBe(true);
  });

  it('scores MET + full marks on the STRONG scenario', async () => {
    const provider = new MockAiInterviewEvaluationProvider({ scenario: 'strong' });
    const result = await provider.evaluate(input());
    const scores = result.output.competencyEvaluations.map((c) => c.score);
    expect(scores.every((s) => s === 100)).toBe(true);
    expect(result.output.competencyEvaluations.every((c) => c.status === 'MET')).toBe(true);
    expect(result.output.strengths.length).toBeGreaterThan(0);
  });

  it('scores NOT_MET on the WEAK scenario', async () => {
    const provider = new MockAiInterviewEvaluationProvider({ scenario: 'weak' });
    const result = await provider.evaluate(input());
    expect(result.output.competencyEvaluations.every((c) => c.status === 'NOT_MET')).toBe(true);
  });

  it('scores zero for an empty candidate response', async () => {
    const provider = new MockAiInterviewEvaluationProvider({ scenario: 'empty' });
    const result = await provider.evaluate(input({ candidateResponseText: '' }));
    expect(result.output.competencyEvaluations.every((c) => c.score === 0)).toBe(true);
  });

  it('detects embedded scenario tokens in the transcript', async () => {
    const provider = new MockAiInterviewEvaluationProvider();
    const weak = await provider.evaluate(
      input({ candidateResponseText: '__MOCK_INTERVIEW_SCENARIO:WEAK ' + RESPONSE }),
    );
    expect(weak.output.competencyEvaluations.every((c) => c.status === 'NOT_MET')).toBe(true);

    const fail = provider.evaluate(
      input({ candidateResponseText: '__MOCK_INTERVIEW_SCENARIO:FAILURE ' + RESPONSE }),
    );
    await expect(fail).rejects.toBeInstanceOf(AiInterviewAiProviderError);
    await expect(fail).rejects.toMatchObject({ retryable: true, code: 'PROVIDER_UNAVAILABLE' });
  });

  it('throws a retryable provider error on the provider_failure scenario', async () => {
    const provider = new MockAiInterviewEvaluationProvider({ scenario: 'provider_failure' });
    const promise = provider.evaluate(input());
    await expect(promise).rejects.toMatchObject({ retryable: true });
  });

  it('yields fabricated quotes on the fabricated_evidence scenario', async () => {
    const provider = new MockAiInterviewEvaluationProvider({ scenario: 'fabricated_evidence' });
    const result = await provider.evaluate(input());
    const quote = result.output.competencyEvaluations[0].evidence[0].quote;
    expect(RESPONSE.includes(quote)).toBe(false);
    expect(quote).toContain('fabricated');
  });
});
