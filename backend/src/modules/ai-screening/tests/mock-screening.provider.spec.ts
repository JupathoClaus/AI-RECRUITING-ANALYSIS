import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { ScreeningInput } from '../domain/screening-input.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { AiScreeningProviderError } from '../providers/ai-screening-provider.errors';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build and maintain software applications.',
  jobResponsibilities: 'Design and implement features.',
  jobQualifications: 'Must have 5 years experience.',
  experienceLevel: 'Senior (5–8 years)',
  requiredSkills: ['TypeScript', 'Node.js', 'React'],
  preferredSkills: ['GraphQL', 'Docker'],
  requiredExperience: '5+ years software development',
  preferredExperience: '2+ years team lead',
  requiredEducation: "Bachelor's in Computer Science",
  preferredEducation: "Master's degree",
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText:
    'Experienced TypeScript and Node.js developer with React skills. 8 years of experience.',
  screeningQuestions: [],
};

describe('MockScreeningProvider', () => {
  it('uses explicit STRONG_MATCH scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'STRONG_MATCH' });
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(92);
  });

  it('uses explicit WEAK_MATCH scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'WEAK_MATCH' });
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
    expect(result.overallScore).toBe(25);
  });

  it('uses explicit INSUFFICIENT_EVIDENCE scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'INSUFFICIENT_EVIDENCE' });
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.overallScore).toBe(0);
  });

  it('uses explicit PROHIBITED_REASONING scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'PROHIBITED_REASONING' });
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.prohibitedReasoningDetected).toBe(true);
  });

  it('uses explicit PROVIDER_FAILURE scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'PROVIDER_FAILURE' });
    await expect(provider.screen(BASE_INPUT)).rejects.toThrow(AiScreeningProviderError);
  });

  it('uses explicit MALFORMED_RESULT scenario from constructor', async () => {
    const provider = new MockScreeningProvider({ scenario: 'MALFORMED_RESULT' });
    const result = await provider.screen(BASE_INPUT);
    expect(result.overallScore).toBe(-1);
  });

  it('returns deterministic result with no scenario', async () => {
    const provider = new MockScreeningProvider();
    const result = await provider.screen(BASE_INPUT);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(85);
    expect(result.confidence).toBe(ScreeningConfidence.HIGH);
    expect(result.matchedQualifications.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('same input produces same output', async () => {
    const provider = new MockScreeningProvider();
    const r1 = await provider.screen(BASE_INPUT);
    const r2 = await provider.screen(BASE_INPUT);
    expect(r1.overallScore).toBe(r2.overallScore);
    expect(r1.recommendation).toBe(r2.recommendation);
  });

  it('returns NOT_SHORTLIST for weak skill match', async () => {
    const provider = new MockScreeningProvider();
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
    const provider = new MockScreeningProvider();
    const input: ScreeningInput = { ...BASE_INPUT, resumeText: '' };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.HUMAN_REVIEW);
    expect(result.confidence).toBe(ScreeningConfidence.LOW);
    expect(result.uncertainties.length).toBeGreaterThan(0);
  });

  it('scenario marker in job description still works for backward compat', async () => {
    const provider = new MockScreeningProvider();
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:STRONG_MATCH',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(result.overallScore).toBe(92);
  });

  it('constructor scenario takes precedence over marker', async () => {
    const provider = new MockScreeningProvider({ scenario: 'STRONG_MATCH' });
    const input: ScreeningInput = {
      ...BASE_INPUT,
      jobDescription: '__MOCK_SCENARIO:WEAK_MATCH',
    };
    const result = await provider.screen(input);
    expect(result.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
  });
});
