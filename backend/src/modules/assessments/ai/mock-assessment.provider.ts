import { Injectable } from '@nestjs/common';
import {
  AssessmentAiProvider,
  AssessmentAiEvaluationInput,
  AssessmentAiProviderOptions,
  AssessmentAiProviderResult,
  AssessmentAiProviderError,
} from './assessment-ai-provider.interface';
import { validateAssessmentAiOutput } from './assessment-output.schema';

export type MockAssessmentScenario =
  | 'default'
  | 'strong'
  | 'weak'
  | 'empty'
  | 'provider_failure'
  | 'malformed'
  | 'fabricated_evidence'
  | 'prompt_injection';

export interface MockAssessmentProviderOptions {
  scenario?: MockAssessmentScenario;
}

/**
 * Deterministic test double. No network, no randomness: the same input
 * always yields the same output. Scenarios cover failure modes
 * (timeout/auth/malformed/fabricated/injection) so the evaluation pipeline
 * can prove it fails safely.
 */
@Injectable()
export class MockAssessmentProvider implements AssessmentAiProvider {
  readonly providerName = 'mock';

  constructor(private readonly options: MockAssessmentProviderOptions = {}) {}

  async evaluate(
    input: AssessmentAiEvaluationInput,
    _options?: AssessmentAiProviderOptions,
  ): Promise<AssessmentAiProviderResult> {
    const scenario = this.options.scenario ?? this.detectScenario(input);

    switch (scenario) {
      case 'provider_failure':
        throw new AssessmentAiProviderError(
          'PROVIDER_UNAVAILABLE',
          'Mock provider failure (retryable).',
          true,
        );
      case 'malformed':
        return this.wrap(this.malformedOutput());
      case 'fabricated_evidence':
        return this.wrap(this.fabricatedOutput(input));
      case 'strong':
        return this.wrap(this.gradedOutput(input, 1));
      case 'weak':
        return this.wrap(this.gradedOutput(input, 0));
      case 'empty':
        return this.wrap(this.gradedOutput(input, -1));
      case 'prompt_injection':
      case 'default':
      default:
        return this.wrap(this.gradedOutput(input, 0.5));
    }
  }

  private detectScenario(input: AssessmentAiEvaluationInput): MockAssessmentScenario {
    const haystack = input.questions.map((q) => q.responseText).join('\n');
    if (/__MOCK_SCENARIO:STRONG/.test(haystack)) return 'strong';
    if (/__MOCK_SCENARIO:WEAK/.test(haystack)) return 'weak';
    if (/__MOCK_SCENARIO:MALFORMED/.test(haystack)) return 'malformed';
    if (/__MOCK_SCENARIO:FABRICATED/.test(haystack)) return 'fabricated_evidence';
    if (/__MOCK_SCENARIO:FAILURE/.test(haystack)) return 'provider_failure';
    return 'default';
  }

  private gradedOutput(input: AssessmentAiEvaluationInput, ratio: number) {
    return {
      schemaVersion: 'v1' as const,
      questionEvaluations: input.questions.map((q) => ({
        questionId: q.questionId,
        criteria: q.rubric.map((c) => {
          const empty = q.responseText.trim().length === 0 || ratio < 0;
          const score = empty ? 0 : Math.floor(c.maxScore * (ratio < 0 ? 0 : ratio));
          const status = empty
            ? 'NOT_MET'
            : ratio >= 1
              ? 'MET'
              : ratio >= 0.5
                ? 'PARTIALLY_MET'
                : 'NOT_MET';
          const quote = empty ? '' : q.responseText.slice(0, 120);
          return {
            criterionId: c.criterionId,
            status: status as 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'UNCERTAIN',
            score,
            maxScore: c.maxScore,
            evidence: quote ? [{ quote, location: 'candidate_response' as const }] : [],
            rationale: empty
              ? 'No relevant evidence in the candidate response.'
              : 'Mock evaluation against the approved rubric.',
            confidence: 'HIGH' as const,
          };
        }),
      })),
      strengths: ratio >= 1 ? ['Demonstrates the required competency.'] : [],
      gaps: ratio >= 1 ? [] : ['Response lacks depth against the rubric.'],
      uncertainties: [],
    };
  }

  private fabricatedOutput(input: AssessmentAiEvaluationInput) {
    const out = this.gradedOutput(input, 1);
    for (const qe of out.questionEvaluations) {
      for (const c of qe.criteria) {
        c.evidence = [
          {
            quote: 'zzzxqy fabricated kubernetes quantum evidence phrase',
            location: 'candidate_response' as const,
          },
        ];
      }
    }
    return out;
  }

  private malformedOutput() {
    return {
      schemaVersion: 'v2',
      overallScore: 100,
      questionEvaluations: [{ questionId: 'nope', criteria: 'broken' }],
    };
  }

  private wrap(raw: unknown): AssessmentAiProviderResult {
    // Route mock output through the same strict validator as real providers.
    const parsed = raw as {
      schemaVersion: string;
      questionEvaluations: { questionId: string; criteria: { criterionId: string }[] }[];
    };
    const expected = Array.isArray(parsed.questionEvaluations)
      ? parsed.questionEvaluations
          .filter((q) => q && typeof q.questionId === 'string' && Array.isArray(q.criteria))
          .map((q) => ({
            questionId: q.questionId,
            criterionIds: q.criteria
              .filter((c) => c && typeof c.criterionId === 'string')
              .map((c) => c.criterionId),
          }))
      : [];
    const { output } = validateAssessmentAiOutput(raw, expected);
    return {
      output,
      metadata: { provider: 'mock', promptVersion: 'v1', schemaVersion: 'v1' },
    };
  }
}
