import type OpenAI from 'openai';
import { AiScreeningProvider, AiScreeningProviderOptions } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { buildResumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { validateScreeningOutput } from '../schemas/screening-output.schema';
import { applyProhibitedReasoningGuard } from './prohibited-reasoning.guard';
import {
  AiScreeningProviderError,
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningMalformedResponseError,
} from './ai-screening-provider.errors';

export interface DeepSeekScreeningConfig {
  model: string;
  timeoutMs: number;
  maxResumeChars: number;
  promptVersion: string;
}

// Inline JSON schema description embedded in the system prompt so DeepSeek
// knows exactly what structure to produce via json_object mode.
const JSON_SCHEMA_DESCRIPTION = `
You MUST respond with a single JSON object that exactly matches this schema:

{
  "overallScore": integer 0-100,
  "recommendation": "SHORTLIST" | "NOT_SHORTLIST" | "HUMAN_REVIEW",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "matchedQualifications": [string, ...],
  "missingQualifications": [string, ...],
  "evidence": [
    {
      "criterion": string,
      "sourceCategory": "RESUME" | "APPLICATION" | "JOB_REQUIREMENT" | "SCREENING_ANSWER" | "UNKNOWN",
      "sourceText": string | null,
      "assessment": string,
      "score": integer 0-100 | null,
      "weight": number 0-1 | null,
      "isRequired": boolean | null
    }
  ],
  "uncertainties": [string, ...],
  "riskFlags": [string, ...],
  "explanation": string (2-4 sentences summarising strengths and gaps),
  "criteriaScores": [
    {
      "criterion": string,
      "score": integer 0-100,
      "maximumScore": integer 1-100,
      "weight": number 0-1,
      "explanation": string | null
    }
  ],
  "prohibitedReasoningDetected": boolean
}

Rules:
- recommendation SHORTLIST requires at least one entry in matchedQualifications and evidence.
- recommendation NOT_SHORTLIST requires at least one entry in missingQualifications and evidence.
- recommendation HUMAN_REVIEW requires at least one entry in uncertainties or riskFlags.
- confidence HIGH requires at least one evidence item.
- criteriaScores MUST include entries for: technical_skills, experience, education.
- Do NOT add any text before or after the JSON object.
`;

export class DeepSeekScreeningProvider implements AiScreeningProvider {
  readonly providerName = 'deepseek';
  private readonly client: OpenAI;
  private readonly config: DeepSeekScreeningConfig;

  constructor(client: OpenAI, config: DeepSeekScreeningConfig) {
    this.client = client;
    this.config = config;
  }

  async screen(
    input: ScreeningInput,
    options?: AiScreeningProviderOptions,
  ): Promise<ProviderScreeningResult> {
    const prompt = buildResumeScreeningPrompt(input, {
      maxResumeChars: this.config.maxResumeChars,
      promptVersion: this.config.promptVersion,
    });

    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages: [
            {
              role: 'system',
              // Combine safety/evaluation instructions with JSON schema requirement
              content: `${prompt.systemInstructions}\n\n${JSON_SCHEMA_DESCRIPTION}`,
            },
            {
              role: 'user',
              content: prompt.evaluationInput,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 4000,
        },
        {
          timeout: timeoutMs,
          signal: options?.abortSignal,
        },
      );

      const elapsed = Date.now() - startTime;
      const choice = response.choices?.[0];

      if (!choice) {
        throw new AiScreeningMalformedResponseError('DeepSeek returned no choices', 'deepseek');
      }

      const finishReason: string = choice.finish_reason ?? 'unknown';

      if (finishReason === 'length') {
        throw new AiScreeningMalformedResponseError(
          'DeepSeek response truncated (max_tokens reached)',
          'deepseek',
        );
      }

      const content = choice.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new AiScreeningMalformedResponseError(
          'DeepSeek returned empty message content',
          'deepseek',
        );
      }

      let rawOutput: unknown;
      try {
        rawOutput = JSON.parse(content.trim());
      } catch {
        throw new AiScreeningMalformedResponseError(
          'DeepSeek returned non-JSON content',
          'deepseek',
        );
      }

      if (typeof rawOutput !== 'object' || rawOutput === null) {
        throw new AiScreeningMalformedResponseError(
          'DeepSeek returned non-object JSON',
          'deepseek',
        );
      }

      const validated = validateScreeningOutput(rawOutput);

      const result: ProviderScreeningResult = {
        ...validated,
        providerMetadata: {
          provider: 'deepseek',
          model: response.model ?? this.config.model,
          promptVersion: this.config.promptVersion,
          responseId: response.id ?? '',
          processingTimeMs: elapsed,
          finishReason,
          createdAt: new Date().toISOString(),
        },
      };

      return applyProhibitedReasoningGuard(result);
    } catch (err: unknown) {
      if (err instanceof AiScreeningProviderError) throw err;

      const sdkError = err as Record<string, unknown>;

      // Timeout / abort
      const isTimeout =
        sdkError['code'] === 'timeout' ||
        sdkError['name'] === 'AbortError' ||
        (typeof sdkError['message'] === 'string' &&
          (sdkError['message'] as string).toLowerCase().includes('timeout'));
      if (isTimeout) {
        throw new AiScreeningTimeoutError('deepseek');
      }

      const status = typeof sdkError['status'] === 'number' ? sdkError['status'] : 0;

      if (status === 401 || status === 403) {
        throw new AiScreeningAuthenticationError('deepseek');
      }

      if (status === 429) {
        const headers = sdkError['headers'] as Record<string, unknown> | undefined;
        const retryAfterMs =
          typeof headers?.['retry-after-ms'] === 'string'
            ? parseInt(headers['retry-after-ms'] as string, 10)
            : typeof headers?.['retry-after'] === 'string'
              ? parseInt(headers['retry-after'] as string, 10) * 1000
              : undefined;
        throw new AiScreeningRateLimitError(
          'deepseek',
          isNaN(retryAfterMs ?? NaN) ? undefined : retryAfterMs,
        );
      }

      if (status >= 500) {
        throw new AiScreeningProviderError({
          message: `DeepSeek server error (${status})`,
          safeMessage: 'The AI screening provider encountered an error. Please try again.',
          safeCode: 'PROVIDER_SERVER_ERROR',
          retryable: true,
          providerName: 'deepseek',
        });
      }

      const msg = typeof sdkError['message'] === 'string' ? (sdkError['message'] as string) : '';

      throw new AiScreeningProviderError({
        message: `DeepSeek provider error: ${msg || 'unknown'}`,
        safeMessage: 'The AI screening provider encountered an unexpected error. Please try again.',
        safeCode: 'PROVIDER_UNEXPECTED_ERROR',
        retryable: true,
        providerName: 'deepseek',
      });
    }
  }
}
