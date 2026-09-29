import { Injectable } from '@nestjs/common';
import {
  AiInterviewAiProvider,
  AiInterviewAiEvaluationInput,
  AiInterviewAiProviderOptions,
  AiInterviewAiProviderResult,
  AiInterviewAiProviderError,
} from './ai-interview-ai-provider.interface';
import { validateAiInterviewAiOutput } from './ai-interview-evaluation-output.schema';

export type MockAiInterviewEvaluationScenario =
  | 'default'
  | 'strong'
  | 'weak'
  | 'empty'
  | 'provider_failure'
  | 'malformed'
  | 'fabricated_evidence'
  | 'prompt_injection';

export interface MockAiInterviewEvaluationProviderOptions {
  scenario?: MockAiInterviewEvaluationScenario;
}

/**
 * Deterministic test double. No network, no randomness: the same input always
 * yields the same output. Scenarios cover failure modes (timeout/auth/
 * malformed/fabricated/injection) so the evaluation pipeline can prove it
 * fails safely. Quotes are verbatim substrings of the candidate response text
 * so evidence verification stays honest.
 */
@Injectable()
export class MockAiInterviewEvaluationProvider implements AiInterviewAiProvider {
  readonly providerName = 'mock';

  constructor(private readonly options: MockAiInterviewEvaluationProviderOptions = {}) {}

  async evaluate(
    input: AiInterviewAiEvaluationInput,
    _options?: AiInterviewAiProviderOptions,
  ): Promise<AiInterviewAiProviderResult> {
    const scenario = this.options.scenario ?? this.detectScenario(input);

    switch (scenario) {
      case 'provider_failure':
        throw new AiInterviewAiProviderError(
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
        return this.wrap(this.gradedOutput(input, 0.2));
      case 'empty':
        return this.wrap(this.gradedOutput(input, -1));
      case 'prompt_injection':
      case 'default':
      default:
        return this.wrap(this.gradedOutput(input, 0.55));
    }
  }

  private detectScenario(input: AiInterviewAiEvaluationInput): MockAiInterviewEvaluationScenario {
    const haystack = [input.candidateResponseText, ...input.transcript.map((t) => t.content)].join(
      '\n',
    );
    if (/__MOCK_INTERVIEW_SCENARIO:STRONG/.test(haystack)) return 'strong';
    if (/__MOCK_INTERVIEW_SCENARIO:WEAK/.test(haystack)) return 'weak';
    if (/__MOCK_INTERVIEW_SCENARIO:MALFORMED/.test(haystack)) return 'malformed';
    if (/__MOCK_INTERVIEW_SCENARIO:FABRICATED/.test(haystack)) return 'fabricated_evidence';
    if (/__MOCK_INTERVIEW_SCENARIO:FAILURE/.test(haystack)) return 'provider_failure';
    return 'default';
  }

  private gradedOutput(input: AiInterviewAiEvaluationInput, ratio: number) {
    const empty = input.candidateResponseText.trim().length === 0 || ratio < 0;
    return {
      schemaVersion: 'v1' as const,
      competencyEvaluations: input.competencies.map((c) => {
        const score = empty
          ? 0
          : Math.min(c.maxScore, Math.floor(c.maxScore * (ratio < 0 ? 0 : ratio)));
        const status: 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'UNCERTAIN' = empty
          ? 'NOT_MET'
          : ratio >= 1
            ? 'MET'
            : ratio >= 0.5
              ? 'PARTIALLY_MET'
              : 'NOT_MET';
        const quote = empty
          ? ''
          : input.candidateResponseText.slice(0, Math.min(140, 1 + Math.floor(score)));
        return {
          competency: c.competency,
          status,
          score,
          maxScore: c.maxScore,
          evidence: quote ? [{ quote, location: 'candidate_response' as const }] : [],
          rationale: empty
            ? 'No relevant candidate response in the transcript.'
            : 'Mock evaluation against the server-derived job competencies.',
          confidence: 'HIGH' as const,
        };
      }),
      summary: empty
        ? 'The candidate did not provide transcript responses to evaluate.'
        : `Mock summary: the candidate's responses were evaluated against ${input.competencies.length} job-derived competencies.`,
      strengths: ratio >= 1 ? ['Demonstrates the required competencies.'] : [],
      gaps: ratio >= 1 ? [] : ['Transcript responses lack depth against the competencies.'],
      uncertainties: [],
    };
  }

  private fabricatedOutput(input: AiInterviewAiEvaluationInput) {
    const out = this.gradedOutput(input, 1);
    for (const c of out.competencyEvaluations) {
      c.evidence = [
        {
          quote: 'zzzxqy fabricated kubernetes quantum evidence phrase',
          location: 'candidate_response' as const,
        },
      ];
    }
    return out;
  }

  private malformedOutput() {
    return {
      schemaVersion: 'v2',
      overallScore: 100,
      competencyEvaluations: [{ competency: 'nope', criteria: 'broken' }],
    };
  }

  private wrap(raw: unknown): AiInterviewAiProviderResult {
    // Route mock output through the same strict validator as real providers.
    const parsed = raw as {
      competencyEvaluations: { competency: string }[];
    };
    const expected = Array.isArray(parsed.competencyEvaluations)
      ? parsed.competencyEvaluations
          .filter((c) => c && typeof c.competency === 'string')
          .map((c) => c.competency)
      : [];
    const { output } = validateAiInterviewAiOutput(raw, expected);
    return {
      output,
      metadata: { provider: 'mock', promptVersion: 'v1', schemaVersion: 'v1' },
    };
  }
}
