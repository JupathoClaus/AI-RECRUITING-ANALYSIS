import { AiScreeningProvider, AiScreeningProviderOptions } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { buildResumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { validateScreeningOutput } from '../schemas/screening-output.schema';
import {
  AiScreeningProviderError,
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningMalformedResponseError,
  AiScreeningRefusalError,
} from './ai-screening-provider.errors';

export class OpenAiScreeningProvider implements AiScreeningProvider {
  readonly providerName = 'openai';
  private readonly client: import('openai').default;
  private readonly model: string;
  private readonly defaultTimeoutMs: number;

  constructor(client: import('openai').default, config?: { model?: string; timeoutMs?: number }) {
    this.client = client;
    this.model = config?.model || 'gpt-4o-mini';
    this.defaultTimeoutMs = config?.timeoutMs || 60000;
  }

  async screen(
    input: ScreeningInput,
    options?: AiScreeningProviderOptions,
  ): Promise<ProviderScreeningResult> {
    const prompt = buildResumeScreeningPrompt(input);
    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;

    const response = await this.callOpenAi(prompt, timeoutMs);
    const parsed = this.parseResponse(response);

    return validateScreeningOutput(parsed);
  }

  private async callOpenAi(
    prompt: ReturnType<typeof buildResumeScreeningPrompt>,
    timeoutMs: number,
  ) {
    const startTime = Date.now();

    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          input: [
            { role: 'system', content: prompt.systemInstructions },
            { role: 'user', content: prompt.evaluationInput },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'screening_result',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  overallScore: { type: 'integer', minimum: 0, maximum: 100 },
                  recommendation: { type: 'string', enum: ['SHORTLIST', 'NOT_SHORTLIST', 'HUMAN_REVIEW'] },
                  confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                  matchedQualifications: { type: 'array', items: { type: 'string' }, maxItems: 50 },
                  missingQualifications: { type: 'array', items: { type: 'string' }, maxItems: 50 },
                  evidence: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        criterion: { type: 'string' },
                        sourceCategory: { type: 'string' },
                        sourceText: { type: 'string' },
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
                  uncertainties: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  riskFlags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  explanation: { type: 'string', maxLength: 5000 },
                  criteriaScores: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        criterion: { type: 'string' },
                        score: { type: 'integer', minimum: 0, maximum: 100 },
                        maximumScore: { type: 'integer', minimum: 0, maximum: 100 },
                        weight: { type: 'number', minimum: 0, maximum: 1 },
                        explanation: { type: 'string' },
                      },
                      required: ['criterion', 'score', 'maximumScore', 'weight'],
                      additionalProperties: false,
                    },
                    maxItems: 20,
                  },
                  prohibitedReasoningDetected: { type: 'boolean' },
                  providerMetadata: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string' },
                      model: { type: 'string' },
                      promptVersion: { type: 'string' },
                      responseId: { type: 'string' },
                      processingTimeMs: { type: 'number' },
                      finishReason: { type: 'string' },
                      createdAt: { type: 'string' },
                    },
                    required: [],
                    additionalProperties: false,
                  },
                },
                required: [
                  'overallScore', 'recommendation', 'confidence',
                  'matchedQualifications', 'missingQualifications',
                  'evidence', 'uncertainties', 'riskFlags',
                  'explanation', 'criteriaScores', 'prohibitedReasoningDetected',
                ],
                additionalProperties: false,
              },
            },
          },
          temperature: 0.1,
          max_output_tokens: 4000,
        },
        { timeout: timeoutMs },
      );

      const elapsed = Date.now() - startTime;

      if (response?.output_text === undefined || response.output_text === null) {
        throw new AiScreeningMalformedResponseError('OpenAI returned no output_text', 'openai');
      }

      const responseId = response.id || '';
      const finishReason = (response as any)?.usage ? 'stop' : 'unknown';

      return {
        outputText: response.output_text,
        responseId,
        finishReason,
        processingTimeMs: elapsed,
        model: this.model,
      };
    } catch (err: unknown) {
      if (err instanceof AiScreeningProviderError) throw err;

      const error = err as any;

      if (error?.code === 'timeout' || error?.name === 'AbortError' || error?.message?.includes('timeout')) {
        throw new AiScreeningTimeoutError('openai');
      }
      if (error?.status === 401 || error?.status === 403) {
        throw new AiScreeningAuthenticationError('openai');
      }
      if (error?.status === 429) {
        const retryAfter = error?.headers?.['retry-after-ms']
          ? parseInt(error.headers['retry-after-ms'], 10)
          : error?.headers?.['retry-after']
            ? parseInt(error.headers['retry-after'], 10) * 1000
            : undefined;
        throw new AiScreeningRateLimitError('openai', retryAfter);
      }
      if (error?.status === 400 && error?.message?.includes('refusal')) {
        throw new AiScreeningRefusalError('openai');
      }
      if (error?.type === 'invalid_response_error' || error?.message?.includes('parse')) {
        throw new AiScreeningMalformedResponseError('OpenAI returned an unparseable response', 'openai');
      }
      if (error?.message?.includes('API key')) {
        throw new AiScreeningAuthenticationError('openai');
      }

      throw new AiScreeningProviderError({
        message: `OpenAI provider error: ${error?.message || 'unknown'}`,
        safeMessage: 'The AI screening provider encountered an unexpected error. Please try again.',
        safeCode: 'PROVIDER_UNEXPECTED_ERROR',
        retryable: true,
        providerName: 'openai',
      });
    }
  }

  private parseResponse(response: {
    outputText: string;
    responseId: string;
    finishReason: string;
    processingTimeMs: number;
    model: string;
  }): unknown {
    const trimmed = response.outputText.trim();

    if (trimmed.length === 0) {
      throw new AiScreeningMalformedResponseError('Provider returned empty output', 'openai');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new AiScreeningMalformedResponseError('Provider returned invalid JSON', 'openai');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new AiScreeningMalformedResponseError('Provider returned non-object JSON', 'openai');
    }

    const result = parsed as Record<string, unknown>;

    result.providerMetadata = {
      provider: 'openai',
      model: response.model,
      responseId: response.responseId,
      processingTimeMs: response.processingTimeMs,
      finishReason: response.finishReason,
      createdAt: new Date().toISOString(),
    };

    return result;
  }
}
