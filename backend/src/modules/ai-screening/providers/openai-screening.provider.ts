import type OpenAI from 'openai';
import { AiScreeningProvider, AiScreeningProviderOptions } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { buildResumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { validateScreeningOutput } from '../schemas/screening-output.schema';
import {
  SCREENING_OUTPUT_JSON_SCHEMA,
  SCREENING_OUTPUT_SCHEMA_NAME,
} from '../schemas/screening-output-json-schema';
import { applyProhibitedReasoningGuard } from './prohibited-reasoning.guard';
import {
  AiScreeningProviderError,
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningMalformedResponseError,
  AiScreeningRefusalError,
} from './ai-screening-provider.errors';

export interface OpenAiScreeningConfig {
  model: string;
  timeoutMs: number;
  maxResumeChars: number;
  promptVersion: string;
}

interface ParsedResponseShape {
  outputText: string;
  responseId: string;
  finishReason: string;
  processingTimeMs: number;
  model: string;
}

export class OpenAiScreeningProvider implements AiScreeningProvider {
  readonly providerName = 'openai';
  private readonly client: OpenAI;
  private readonly config: OpenAiScreeningConfig;

  constructor(client: OpenAI, config: OpenAiScreeningConfig) {
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

    const parsed = await this.callOpenAi(prompt, timeoutMs, options?.abortSignal);
    const validated = validateScreeningOutput(parsed.rawOutput);

    const result: ProviderScreeningResult = {
      ...validated,
      providerMetadata: {
        provider: 'openai',
        model: parsed.model,
        promptVersion: this.config.promptVersion,
        responseId: parsed.responseId,
        processingTimeMs: parsed.processingTimeMs,
        finishReason: parsed.finishReason,
        createdAt: new Date().toISOString(),
      },
    };

    return applyProhibitedReasoningGuard(result);
  }

  private async callOpenAi(
    prompt: ReturnType<typeof buildResumeScreeningPrompt>,
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<ParsedResponseShape & { rawOutput: unknown }> {
    const startTime = Date.now();

    try {
      const response = await this.client.responses.create(
        {
          model: this.config.model,
          input: [
            { role: 'system', content: prompt.systemInstructions },
            { role: 'user', content: prompt.evaluationInput },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: SCREENING_OUTPUT_SCHEMA_NAME,
              strict: true,
              schema: SCREENING_OUTPUT_JSON_SCHEMA,
            },
          },
          temperature: 0.1,
          max_output_tokens: 4000,
        },
        { timeout: timeoutMs, signal: abortSignal },
      );

      const elapsed = Date.now() - startTime;

      if (response.status === 'failed' && response.error) {
        const err = response.error;
        if (err.code === 'rate_limit_exceeded') {
          throw new AiScreeningRateLimitError('openai');
        }
        throw new AiScreeningProviderError({
          message: `OpenAI response error: ${err.code} - ${err.message}`,
          safeMessage:
            'The AI screening provider encountered an unexpected error. Please try again.',
          safeCode: 'PROVIDER_UNEXPECTED_ERROR',
          retryable: true,
          providerName: 'openai',
        });
      }

      if (response.status === 'incomplete') {
        const reason = response.incomplete_details?.reason ?? 'unknown';
        if (reason === 'max_output_tokens') {
          throw new AiScreeningMalformedResponseError(
            `OpenAI response incomplete: max output tokens reached`,
            'openai',
          );
        }
        throw new AiScreeningMalformedResponseError(
          `OpenAI response incomplete: ${reason}`,
          'openai',
        );
      }

      const refusal = this.findRefusal(response);
      if (refusal) {
        throw new AiScreeningRefusalError('openai');
      }

      const outputText = response.output_text;
      if (typeof outputText !== 'string' || outputText.trim().length === 0) {
        throw new AiScreeningMalformedResponseError('OpenAI returned no output_text', 'openai');
      }

      const trimmed = outputText.trim();
      let rawOutput: unknown;
      try {
        rawOutput = JSON.parse(trimmed);
      } catch {
        throw new AiScreeningMalformedResponseError('OpenAI returned invalid JSON', 'openai');
      }

      if (typeof rawOutput !== 'object' || rawOutput === null) {
        throw new AiScreeningMalformedResponseError('OpenAI returned non-object JSON', 'openai');
      }

      return {
        rawOutput,
        outputText,
        responseId: response.id ?? '',
        finishReason: response.status === 'completed' ? 'stop' : (response.status ?? 'unknown'),
        processingTimeMs: elapsed,
        model: this.config.model,
      };
    } catch (err: unknown) {
      if (err instanceof AiScreeningProviderError) throw err;

      const sdkError = err as Record<string, unknown>;

      if (
        (sdkError['code'] === 'timeout' || sdkError['name'] === 'AbortError') &&
        typeof sdkError['message'] === 'string' &&
        (sdkError['message'] as string).includes('timeout')
      ) {
        throw new AiScreeningTimeoutError('openai');
      }

      const status = typeof sdkError['status'] === 'number' ? sdkError['status'] : 0;

      if (status === 401 || status === 403) {
        throw new AiScreeningAuthenticationError('openai');
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
          'openai',
          isNaN(retryAfterMs ?? NaN) ? undefined : retryAfterMs,
        );
      }
      if (status >= 500) {
        throw new AiScreeningProviderError({
          message: `OpenAI server error (${status})`,
          safeMessage: 'The AI screening provider encountered an error. Please try again.',
          safeCode: 'PROVIDER_SERVER_ERROR',
          retryable: true,
          providerName: 'openai',
        });
      }

      const msg = typeof sdkError['message'] === 'string' ? (sdkError['message'] as string) : '';
      if (msg.includes('API key')) {
        throw new AiScreeningAuthenticationError('openai');
      }

      throw new AiScreeningProviderError({
        message: `OpenAI provider error: ${msg || 'unknown'}`,
        safeMessage: 'The AI screening provider encountered an unexpected error. Please try again.',
        safeCode: 'PROVIDER_UNEXPECTED_ERROR',
        retryable: true,
        providerName: 'openai',
      });
    }
  }

  private findRefusal(response: { output?: Array<unknown> }): string | null {
    if (!Array.isArray(response.output)) return null;
    for (const item of response.output) {
      if (typeof item !== 'object' || item === null) continue;
      if (item['type'] === 'refusal') {
        return typeof item['refusal'] === 'string' ? item['refusal'] : 'Model refused to respond';
      }
      const content = item['content'];
      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === 'object' && part !== null && part['type'] === 'refusal') {
            return typeof part['refusal'] === 'string'
              ? part['refusal']
              : 'Model refused to respond';
          }
        }
      }
    }
    return null;
  }
}
