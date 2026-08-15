jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: jest.fn() },
  })),
}));

import OpenAI from 'openai';
import { OpenAiScreeningProvider } from '../providers/openai-screening.provider';
import { AiScreeningProviderOptions } from '../providers/ai-screening-provider.interface';
import {
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningRefusalError,
  AiScreeningMalformedResponseError,
  AiScreeningProviderError,
} from '../providers/ai-screening-provider.errors';
import { ScreeningInput } from '../domain/screening-input.type';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Engineer',
  jobDescription: 'Build software.',
  jobResponsibilities: '',
  jobQualifications: '',
  experienceLevel: 'Mid-level (3–5 years)',
  requiredSkills: ['TypeScript'],
  preferredSkills: [],
  requiredExperience: '3+ years',
  preferredExperience: '',
  requiredEducation: 'Bachelors',
  preferredEducation: '',
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText: 'TypeScript developer.',
  screeningQuestions: [],
};

const BASE_CONFIG = {
  model: 'gpt-4o-mini',
  timeoutMs: 30000,
  maxResumeChars: 15000,
  promptVersion: 'v1',
};

const VALID_RESPONSE = JSON.stringify({
  overallScore: 85,
  recommendation: 'SHORTLIST',
  confidence: 'HIGH',
  matchedQualifications: ['TypeScript'],
  missingQualifications: [],
  evidence: [
    {
      criterion: 'skills',
      sourceCategory: 'RESUME',
      sourceText: 'TypeScript found',
      assessment: 'match',
      score: 90,
    },
  ],
  uncertainties: [],
  riskFlags: [],
  explanation: 'Good match.',
  criteriaScores: [
    { criterion: 'skills', score: 85, maximumScore: 100, weight: 0.5, explanation: 'Good' },
  ],
  prohibitedReasoningDetected: false,
});

function completedResponse(outputText: string, overrides?: Record<string, unknown>) {
  return {
    id: 'resp-1',
    output_text: outputText,
    status: 'completed',
    model: 'gpt-4o-mini',
    incomplete_details: null,
    error: null,
    output: [],
    ...overrides,
  };
}

function createMockClient(responsesCreate: jest.Mock): import('openai').default {
  const client = new OpenAI({ apiKey: 'sk-test' });
  (client.responses.create as jest.Mock) = responsesCreate;
  return client;
}

describe('OpenAiScreeningProvider', () => {
  let provider: OpenAiScreeningProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses configured model', async () => {
    let capturedModel = '';
    const mockCreate = jest.fn().mockImplementation((params: unknown) => {
      const p = params as Record<string, unknown>;
      capturedModel = p.model as string;
      return completedResponse(VALID_RESPONSE);
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, { ...BASE_CONFIG, model: 'gpt-4o-mini' });

    await provider.screen(BASE_INPUT);
    expect(capturedModel).toBe('gpt-4o-mini');
  });

  it('uses configured timeout', async () => {
    let capturedTimeout = 0;
    const mockCreate = jest.fn().mockImplementation((_params: unknown, options: unknown) => {
      const opts = options as Record<string, unknown>;
      capturedTimeout = opts.timeout as number;
      return completedResponse(VALID_RESPONSE);
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, { ...BASE_CONFIG, timeoutMs: 15000 });

    await provider.screen(BASE_INPUT);
    expect(capturedTimeout).toBe(15000);
  });

  it('uses stable JSON schema', async () => {
    const mockCreate = jest.fn().mockImplementation((params: unknown) => {
      const p = params as Record<string, unknown>;
      const text = p.text as Record<string, unknown>;
      const format = text.format as Record<string, unknown>;
      expect(format.name).toBe('screening_result');
      expect(format.strict).toBe(true);
      expect(format.schema).toBeDefined();
      return completedResponse(VALID_RESPONSE);
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await provider.screen(BASE_INPUT);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('parses valid output and returns validated result', async () => {
    const mockCreate = jest.fn().mockResolvedValue(completedResponse(VALID_RESPONSE));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    const result = await provider.screen(BASE_INPUT);
    expect(result.overallScore).toBe(85);
    expect(result.recommendation).toBe('SHORTLIST');
  });

  it('adapter adds provider metadata', async () => {
    const mockCreate = jest.fn().mockResolvedValue(completedResponse(VALID_RESPONSE));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    const result = await provider.screen(BASE_INPUT);
    expect(result.providerMetadata).toBeDefined();
    expect(result.providerMetadata?.provider).toBe('openai');
    expect(result.providerMetadata?.model).toBe('gpt-4o-mini');
    expect(result.providerMetadata?.promptVersion).toBe('v1');
  });

  it('model is not asked to generate provider metadata', async () => {
    const mockCreate = jest.fn().mockImplementation((params: unknown) => {
      const p = params as Record<string, unknown>;
      const text = p.text as Record<string, unknown>;
      const format = text.format as Record<string, unknown>;
      const schema = format.schema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props.providerMetadata).toBeUndefined();
      return completedResponse(VALID_RESPONSE);
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await provider.screen(BASE_INPUT);
  });

  it('handles refusal from response output structure', async () => {
    const mockCreate = jest.fn().mockResolvedValue(
      completedResponse('', {
        output: [{ type: 'refusal', refusal: 'I cannot answer that.' }],
      }),
    );
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningRefusalError);
  });

  it('rejects incomplete response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      id: 'resp-1',
      output_text: '{"overallScore":50}',
      status: 'incomplete',
      model: 'gpt-4o-mini',
      incomplete_details: { reason: 'max_output_tokens' },
      error: null,
      output: [],
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningMalformedResponseError);
  });

  it('rejects empty output', async () => {
    const mockCreate = jest.fn().mockResolvedValue(completedResponse(''));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningMalformedResponseError);
  });

  it('handles failed response with error', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      id: 'resp-1',
      output_text: '',
      status: 'failed',
      model: 'gpt-4o-mini',
      incomplete_details: null,
      error: { code: 'server_error', message: 'Internal server error' },
      output: [],
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningProviderError);
  });

  it('throws AiScreeningTimeoutError on timeout', async () => {
    const mockCreate = jest.fn().mockRejectedValue({
      code: 'timeout',
      name: 'AbortError',
      message: 'timeout of 30000ms exceeded',
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, { ...BASE_CONFIG, timeoutMs: 1 });

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningTimeoutError);
  });

  it('throws AiScreeningAuthenticationError on 401', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 401, message: 'Incorrect API key' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningAuthenticationError);
  });

  it('throws AiScreeningRateLimitError on 429', async () => {
    const mockCreate = jest
      .fn()
      .mockRejectedValue({ status: 429, message: 'Rate limit', headers: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningRateLimitError);
  });

  it('throws retryable error on 5xx', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 502, message: 'Bad Gateway' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    try {
      await provider.screen(BASE_INPUT);
    } catch (err: unknown) {
      const e = err as AiScreeningProviderError;
      expect(e.retryable).toBe(true);
      expect(e.providerName).toBe('openai');
    }
  });

  it('does not leak API key in thrown errors', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 401, message: 'Incorrect API key' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    try {
      await provider.screen(BASE_INPUT);
    } catch (err: unknown) {
      const e = err as Error;
      expect(e.message).not.toContain('sk-');
    }
  });

  it('does not leak resume text in thrown errors', async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error('Network failure'));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    try {
      await provider.screen(BASE_INPUT);
    } catch (err: unknown) {
      const e = err as Error;
      expect(e.message).not.toContain(BASE_INPUT.resumeText);
    }
  });

  it('does not make real network request', async () => {
    const mockCreate = jest.fn().mockResolvedValue(completedResponse(VALID_RESPONSE));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);

    await provider.screen(BASE_INPUT);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe('gpt-4o-mini');
  });

  it('providerName is openai', () => {
    const client = createMockClient(jest.fn());
    provider = new OpenAiScreeningProvider(client, BASE_CONFIG);
    expect(provider.providerName).toBe('openai');
  });
});
