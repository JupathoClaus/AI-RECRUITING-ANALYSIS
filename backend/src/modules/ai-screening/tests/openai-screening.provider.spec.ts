jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: jest.fn() },
  })),
}));

import { OpenAiScreeningProvider } from '../providers/openai-screening.provider';
import { AiScreeningProviderOptions } from '../providers/ai-screening-provider.interface';
import {
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningRefusalError,
  AiScreeningMalformedResponseError,
} from '../providers/ai-screening-provider.errors';
import { ScreeningInput } from '../domain/screening-input.type';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Engineer',
  jobDescription: 'Build software.',
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

const VALID_RESPONSE = JSON.stringify({
  overallScore: 85,
  recommendation: 'SHORTLIST',
  confidence: 'HIGH',
  matchedQualifications: ['TypeScript'],
  missingQualifications: [],
  evidence: [{ criterion: 'skills', sourceCategory: 'RESUME', sourceText: 'TypeScript found', assessment: 'match', score: 90 }],
  uncertainties: [],
  riskFlags: [],
  explanation: 'Good match.',
  criteriaScores: [{ criterion: 'skills', score: 85, maximumScore: 100, weight: 0.5, explanation: 'Good' }],
  prohibitedReasoningDetected: false,
});

function createMockClient(responsesCreate: jest.Mock): import('openai').default {
  const OpenAI = require('openai').default;
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
    const mockCreate = jest.fn().mockImplementation((params: any) => {
      capturedModel = params.model;
      return { id: 'resp-1', output_text: VALID_RESPONSE, usage: {} };
    });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, { model: 'gpt-4o-mini', timeoutMs: 30000 });

    await provider.screen(BASE_INPUT);
    expect(capturedModel).toBe('gpt-4o-mini');
  });

  it('calls prompt builder and sends structured output request', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: 'resp-1', output_text: VALID_RESPONSE, usage: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await provider.screen(BASE_INPUT);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.text.format.type).toBe('json_schema');
    expect(callArg.text.format.name).toBe('screening_result');
    expect(callArg.text.format.strict).toBe(true);
  });

  it('parses valid response and returns validated result', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: 'resp-1', output_text: VALID_RESPONSE, usage: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    const result = await provider.screen(BASE_INPUT);
    expect(result.overallScore).toBe(85);
    expect(result.recommendation).toBe('SHORTLIST');
  });

  it('throws AiScreeningMalformedResponseError on empty output', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: 'resp-1', output_text: '', usage: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningMalformedResponseError on invalid JSON', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: 'resp-1', output_text: 'not json', usage: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningMalformedResponseError on overallScore mismatch', async () => {
    const badResponse = JSON.stringify({ ...JSON.parse(VALID_RESPONSE), overallScore: -5 });
    const mockCreate = jest.fn().mockResolvedValue({ id: 'resp-1', output_text: badResponse, usage: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningTimeoutError on timeout', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ code: 'timeout', message: 'timeout of 30000ms exceeded' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client, { timeoutMs: 1 });

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningTimeoutError);
  });

  it('throws AiScreeningAuthenticationError on 401', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 401, message: 'Incorrect API key' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningAuthenticationError);
  });

  it('throws AiScreeningRateLimitError on 429', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 429, message: 'Rate limit', headers: {} });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningRateLimitError);
  });

  it('throws AiScreeningRefusalError on refusal', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 400, message: 'refusal' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningRefusalError);
  });

  it('does not leak API key in thrown errors', async () => {
    const mockCreate = jest.fn().mockRejectedValue({ status: 401, message: 'Incorrect API key' });
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    try {
      await provider.screen(BASE_INPUT);
    } catch (err: any) {
      expect(err.message).not.toContain('sk-');
    }
  });

  it('does not leak resume text in thrown errors', async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error('Network failure'));
    const client = createMockClient(mockCreate);
    provider = new OpenAiScreeningProvider(client);

    try {
      await provider.screen(BASE_INPUT);
    } catch (err: any) {
      expect(err.message).not.toContain(BASE_INPUT.resumeText);
    }
  });

  it('providerName is openai', () => {
    const client = createMockClient(jest.fn());
    provider = new OpenAiScreeningProvider(client);
    expect(provider.providerName).toBe('openai');
  });
});
