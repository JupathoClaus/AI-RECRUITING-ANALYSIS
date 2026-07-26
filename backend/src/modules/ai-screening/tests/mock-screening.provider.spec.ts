import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { ScreeningInput } from '../domain/screening-input.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build and maintain software applications.',
  requiredSkills: ['TypeScript', 'Node.js', 'React'],
  preferredSkills: ['GraphQL', 'Docker'],
  requiredExperience: '5+ years software development',
  preferredExperience: '2+ years team lead',
  requiredEducation: "Bachelor's in Computer Science",
  preferredEducation: "Master's degree",
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText: 'Experienced TypeScript and Node.js developer with React skills. 8 years of experience.',
  screeningQuestions: [],
};

describe('MockScreeningProvider', () => {
  let provider: MockScreeningProvider;

  beforeEach(() => {
    provider = new MockScreeningProvider();
  });

  it('returns SHORTLIST for strong skill match', async () => {
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(85);
    expect(result.confidence).toBe(ScreeningConfidence.HIGH);
    expect(result.matchedQualifications.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns NOT_SHORTLIST for weak skill match', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      resumeText: 'Sales and marketing professional with no technical background.',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
    expect(result.missingQualifications.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns HUMAN_REVIEW for insufficient resume text', async () => {
    const input: ScreeningInput = { ...BASE_INPUT, resumeText: '' };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.confidence).toBe(ScreeningConfidence.LOW);
    expect(result.uncertainties.length).toBeGreaterThan(0);
  });

  it('returns HUMAN_REVIEW for insufficient job description', async () => {
    const input: ScreeningInput = { ...BASE_INPUT, jobDescription: 'Job' };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.confidence).toBe(ScreeningConfidence.LOW);
  });

  it('supports STRONG_MATCH scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:STRONG_MATCH',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(92);
  });

  it('supports WEAK_MATCH scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:WEAK_MATCH',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
    expect(result.overallScore).toBe(25);
  });

  it('supports INSUFFICIENT_EVIDENCE scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:INSUFFICIENT_EVIDENCE',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.overallScore).toBe(0);
  });

  it('supports PROHIBITED_REASONING scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:PROHIBITED_REASONING',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.prohibitedReasoningDetected).toBe(true);
  });

  it('supports PROVIDER_FAILURE scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:PROVIDER_FAILURE',
    };
    await expect(provider.screen(input)).rejects.toThrow('Mock provider failure');
  });

  it('supports MALFORMED_RESULT scenario marker', async () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:MALFORMED_RESULT',
    };
    const result = await provider.screen(input);
    expect(result.overallScore).toBe(-1);
  });

  it('is deterministic: same input same output', async () => {
    const r1 = await provider.screen(BASE_INPUT);
    const r2 = await provider.screen(BASE_INPUT);
    expect(r1.overallScore).toBe(r2.overallScore);
    expect(r1.recommendation).toBe(r2.recommendation);
  });

  it('does not use candidate personal attributes', async () => {
    const result = await provider.screen(BASE_INPUT);
    expect(result.explanation).not.toContain(BASE_INPUT.candidateId);
  });
});
