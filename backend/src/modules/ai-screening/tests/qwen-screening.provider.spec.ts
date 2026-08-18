/**
 * QwenScreeningProvider unit tests
 *
 * All network calls are mocked. No real Ollama/model required.
 */

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  })),
}));

import OpenAI from 'openai';
import { QwenScreeningProvider } from '../providers/qwen-screening.provider';
import { BackendScoringService } from '../services/backend-scoring.service';
import { EvidenceVerificationService } from '../services/evidence-verification.service';
import {
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningProviderError,
  AiScreeningMalformedResponseError,
} from '../providers/ai-screening-provider.errors';
import { ScreeningInput } from '../domain/screening-input.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProvider() {
  const client = new OpenAI({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' });
  const scorer = new BackendScoringService();
  const verifier = new EvidenceVerificationService();
  const config = {
    model: 'qwen2.5:latest',
    baseUrl: 'http://localhost:11434/v1',
    timeoutMs: 30000,
    maxResumeChars: 15000,
    promptVersion: 'v1',
  };
  return { provider: new QwenScreeningProvider(client, config, scorer, verifier), client };
}

function mockCreate(client: OpenAI, response: unknown): jest.Mock {
  const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
  mock.mockResolvedValue(response);
  return mock;
}

function makeCriterionEvaluation(overrides?: Record<string, unknown>) {
  return {
    criterionId: 'skill-1',
    criterion: 'TypeScript',
    requirementType: 'REQUIRED',
    status: 'FULLY_MET',
    reason: 'Candidate has demonstrated TypeScript production experience.',
    confidence: 'HIGH',
    evidence: [
      { sourceCategory: 'RESUME', sourceText: 'Built TypeScript applications at ABC Ltd.' },
    ],
    ...overrides,
  };
}

function makeValidQwenResponse(overrides?: Record<string, unknown>) {
  return {
    id: 'resp-1',
    model: 'qwen2.5:latest',
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            criterionEvaluations: [makeCriterionEvaluation()],
            summary: 'Strong TypeScript candidate with relevant experience.',
            warnings: [],
            prohibitedReasoningDetected: false,
            ...overrides,
          }),
        },
      },
    ],
  };
}

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build TypeScript backend services.',
  jobResponsibilities: 'Design and maintain APIs.',
  jobQualifications: 'TypeScript experience required.',
  experienceLevel: 'Mid-level (3–5 years)',
  requiredSkills: ['TypeScript'],
  preferredSkills: [],
  requiredExperience: '3+ years',
  preferredExperience: '',
  requiredEducation: '',
  preferredEducation: '',
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText: 'Built TypeScript applications at ABC Ltd. Jan 2021 – present.',
  screeningQuestions: [],
  promptVersion: 'v1',
  criteria: [
    {
      id: 'skill-1',
      name: 'TypeScript',
      description: 'Required skill: TypeScript.',
      requirementType: 'REQUIRED',
      category: 'SKILL',
      weight: 1.0,
      acceptedEvidence: ['TypeScript'],
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QwenScreeningProvider', () => {
  it('has providerName=qwen', () => {
    const { provider } = makeProvider();
    expect(provider.providerName).toBe('qwen');
  });

  it('calls chat.completions.create with json_object response_format', async () => {
    const { provider, client } = makeProvider();
    const mock = mockCreate(client, makeValidQwenResponse());
    await provider.screen(BASE_INPUT);
    expect(mock).toHaveBeenCalledTimes(1);
    const call = mock.mock.calls[0][0];
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.temperature).toBe(0.1);
    expect(call.model).toBe('qwen2.5:latest');
  });

  it('returns SHORTLIST when TypeScript is FULLY_MET', async () => {
    const { provider, client } = makeProvider();
    mockCreate(client, makeValidQwenResponse());
    const result = await provider.screen(BASE_INPUT);
    // With 1 criterion FULLY_MET and weight=1.0 → score=100 → SHORTLIST
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(100);
  });

  it('returns NOT_SHORTLIST when required criterion is NOT_MET with enough evidence', async () => {
    const { provider, client } = makeProvider();
    mockCreate(
      client,
      makeValidQwenResponse({
        criterionEvaluations: [
          makeCriterionEvaluation({
            status: 'NOT_MET',
            confidence: 'HIGH',
            // Empty sourceText — model correctly found no evidence (not a hallucination)
            evidence: [{ sourceCategory: 'RESUME', sourceText: '' }],
          }),
        ],
        warnings: [],
      }),
    );
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
    expect(result.overallScore).toBe(0);
    expect(result.missingQualifications).toContain('TypeScript');
  });

  it('returns HUMAN_REVIEW when criterion is UNCERTAIN', async () => {
    const { provider, client } = makeProvider();
    mockCreate(
      client,
      makeValidQwenResponse({
        criterionEvaluations: [
          makeCriterionEvaluation({
            status: 'UNCERTAIN',
            confidence: 'LOW',
            evidence: [{ sourceCategory: 'RESUME', sourceText: '' }],
          }),
        ],
        warnings: ['Evidence is ambiguous'],
      }),
    );
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
  });

  it('returns HUMAN_REVIEW for PARTIALLY_MET required criterion', async () => {
    const { provider, client } = makeProvider();
    mockCreate(
      client,
      makeValidQwenResponse({
        criterionEvaluations: [
          makeCriterionEvaluation({
            status: 'PARTIALLY_MET',
            confidence: 'MEDIUM',
            evidence: [{ sourceCategory: 'RESUME', sourceText: 'Some related experience.' }],
          }),
        ],
      }),
    );
    const result = await provider.screen(BASE_INPUT);
    // PARTIALLY_MET with score=50 → below SHORTLIST (72) → HUMAN_REVIEW
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.overallScore).toBe(50);
  });

  it('does NOT let the model directly set overallScore — backend computes it', async () => {
    const { provider, client } = makeProvider();
    // The model output has NO overallScore field — it's not in the Qwen schema
    // The backend must compute it from criterion statuses
    const rawResponse = makeValidQwenResponse();
    // Even if someone smuggles an overallScore into the JSON, the provider ignores it
    const parsed = JSON.parse(rawResponse.choices[0].message.content);
    (parsed as Record<string, number>)['overallScore'] = 99; // inject fake score
    rawResponse.choices[0].message.content = JSON.stringify(parsed);
    mockCreate(client, rawResponse);
    const result = await provider.screen(BASE_INPUT);
    // Score must be computed by BackendScoringService (100 for FULLY_MET with weight=1), not 99
    expect(result.overallScore).toBe(100);
  });

  it('does not expose resume text or API key in logs (no throw on normal run)', async () => {
    // Simply verify the provider runs without throwing when a valid response is given
    const { provider, client } = makeProvider();
    mockCreate(client, makeValidQwenResponse());
    await expect(provider.screen(BASE_INPUT)).resolves.toBeDefined();
  });

  it('maps prohibited reasoning detection to HUMAN_REVIEW with score 0', async () => {
    const { provider, client } = makeProvider();
    mockCreate(
      client,
      makeValidQwenResponse({
        prohibitedReasoningDetected: true,
        criterionEvaluations: [
          makeCriterionEvaluation({ reason: 'Candidate appears young in age.' }),
        ],
      }),
    );
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.overallScore).toBe(0);
    expect(result.prohibitedReasoningDetected).toBe(true);
    expect(result.riskFlags).toContain('PROHIBITED_REASONING_DETECTED');
  });

  it('throws AiScreeningMalformedResponseError on non-JSON response', async () => {
    const { provider, client } = makeProvider();
    mockCreate(client, {
      id: 'r1',
      model: 'qwen2.5:latest',
      choices: [{ finish_reason: 'stop', message: { content: 'not valid json' } }],
    });
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningMalformedResponseError on truncated response (length finish_reason)', async () => {
    const { provider, client } = makeProvider();
    mockCreate(client, {
      id: 'r1',
      model: 'qwen2.5:latest',
      choices: [{ finish_reason: 'length', message: { content: '{}' } }],
    });
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningMalformedResponseError when expected criterion IDs are missing', async () => {
    const { provider, client } = makeProvider();
    // Response has no evaluations at all
    mockCreate(
      client,
      makeValidQwenResponse({
        criterionEvaluations: [], // skill-1 is missing
      }),
    );
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningMalformedResponseError);
  });

  it('throws AiScreeningTimeoutError on timeout', async () => {
    const { provider, client } = makeProvider();
    const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
    mock.mockRejectedValue({ code: 'timeout', message: 'Request timed out' });
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningTimeoutError);
  });

  it('throws AiScreeningAuthenticationError on HTTP 401', async () => {
    const { provider, client } = makeProvider();
    const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
    mock.mockRejectedValue({ status: 401, message: 'Unauthorized' });
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningAuthenticationError);
  });

  it('throws AiScreeningRateLimitError on HTTP 429', async () => {
    const { provider, client } = makeProvider();
    const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
    mock.mockRejectedValue({ status: 429, message: 'Rate limited' });
    await expect(provider.screen(BASE_INPUT)).rejects.toBeInstanceOf(AiScreeningRateLimitError);
  });

  it('throws PROVIDER_UNAVAILABLE on ECONNREFUSED (Ollama not running)', async () => {
    const { provider, client } = makeProvider();
    const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
    mock.mockRejectedValue({ message: 'connect ECONNREFUSED 127.0.0.1:11434' });
    const err = await provider.screen(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(AiScreeningProviderError);
    expect((err as AiScreeningProviderError).safeCode).toBe('PROVIDER_UNAVAILABLE');
  });

  it('throws PROVIDER_SERVER_ERROR on HTTP 5xx', async () => {
    const { provider, client } = makeProvider();
    const mock = (client.chat.completions as unknown as { create: jest.Mock }).create;
    mock.mockRejectedValue({ status: 503, message: 'Service unavailable' });
    const err = await provider.screen(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(AiScreeningProviderError);
    expect((err as AiScreeningProviderError).safeCode).toBe('PROVIDER_SERVER_ERROR');
  });
});
