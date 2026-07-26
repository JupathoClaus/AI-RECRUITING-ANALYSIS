import { ConfigService } from '@nestjs/config';
import { OpenAiScreeningProvider } from '../providers/openai-screening.provider';
import { ScreeningInput } from '../domain/screening-input.type';

const mockResponsesCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: mockResponsesCreate },
  })),
}));

describe('OpenAiScreeningProvider', () => {
  let config: any;

  beforeEach(() => {
    mockResponsesCreate.mockReset();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'app.openAiApiKey') return 'sk-test-key';
        if (key === 'app.openAiModel') return 'gpt-4o-mini';
        if (key === 'app.aiScreeningTimeoutMs') return 30000;
        if (key === 'app.aiScreeningMaxResumeChars') return 15000;
        return undefined;
      }),
    };
  });

  it('should reject missing API key at construction', () => {
    config.get.mockReturnValue(undefined);
    expect(() => new OpenAiScreeningProvider(config as unknown as ConfigService)).toThrow('OPENAI_API_KEY');
  });

  describe('screen method', () => {
    it('should throw provider error on network failure', async () => {
      mockResponsesCreate.mockRejectedValue(new Error('Network failure'));
      const provider = new OpenAiScreeningProvider(config as unknown as ConfigService);

      const input: ScreeningInput = {
        applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1', companyId: 'company-1',
        jobTitle: 'Engineer', jobDescription: 'Build software',
        requiredSkills: ['TypeScript'], preferredSkills: [],
        requiredExperience: '3 years', preferredExperience: '', requiredEducation: 'Bachelors',
        resumeText: 'Experienced TypeScript developer.',
      };

      await expect(provider.screen(input)).rejects.toThrow('Network failure');
    });

    it('should use configured model', async () => {
      let capturedModel = '';
      mockResponsesCreate.mockImplementation((params: any) => {
        capturedModel = params.model;
        return { output_text: JSON.stringify({
          overallScore: 85, recommendation: 'SHORTLIST', confidence: 'HIGH',
          matchedQualifications: ['TypeScript'], missingQualifications: [],
          evidence: [{ criterion: 'skills', evidence: 'TypeScript found', sourceCategory: 'resume', assessment: 'match' }],
          criteriaScores: [], uncertainties: [], riskFlags: [], explanation: 'Good match',
          prohibitedReasoningDetected: false,
        }) };
      });

      const provider = new OpenAiScreeningProvider(config as unknown as ConfigService);
      const input: ScreeningInput = {
        applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1', companyId: 'company-1',
        jobTitle: 'Engineer', jobDescription: 'Build software',
        requiredSkills: ['TypeScript'], preferredSkills: [],
        requiredExperience: '3 years', preferredExperience: '', requiredEducation: 'Bachelors',
        resumeText: 'TypeScript developer.',
      };

      await provider.screen(input);
      expect(capturedModel).toBe('gpt-4o-mini');
    });
  });
});
