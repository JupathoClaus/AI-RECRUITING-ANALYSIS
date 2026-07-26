import { buildResumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { ScreeningInput } from '../domain/screening-input.type';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build software.',
  requiredSkills: ['TypeScript'],
  preferredSkills: ['React'],
  requiredExperience: '3+ years',
  preferredExperience: '5+ years',
  requiredEducation: 'Bachelors',
  preferredEducation: 'Masters',
  requiredCertifications: ['AWS Certified'],
  preferredCertifications: ['GCP Certified'],
  resumeText: 'TypeScript developer with 5 years experience.',
  screeningQuestions: [{ question: 'Do you have team lead experience?', answer: 'Yes', isRequired: true }],
};

describe('buildResumeScreeningPrompt', () => {
  it('includes job title and description', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('Software Engineer');
    expect(prompt.evaluationInput).toContain('Build software.');
  });

  it('includes required skills', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('TypeScript');
  });

  it('includes preferred skills', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('React');
  });

  it('includes resume text', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('TypeScript developer');
  });

  it('includes screening questions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('team lead');
  });

  it('includes required certifications', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.evaluationInput).toContain('AWS Certified');
  });

  it('includes prompt version', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.promptVersion).toBe('v1');
  });

  it('includes HUMAN_REVIEW safety rule in system instructions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.systemInstructions).toContain('HUMAN_REVIEW');
    expect(prompt.systemInstructions).toContain('incomplete, contradictory, or uncertain');
  });

  it('prohibits protected-characteristic reasoning in system instructions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.systemInstructions).toContain('age');
    expect(prompt.systemInstructions).toContain('gender');
    expect(prompt.systemInstructions).toContain('race');
    expect(prompt.systemInstructions).toContain('religion');
  });

  it('prohibits inferring personality or cultural fit', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.systemInstructions).toContain('personality');
    expect(prompt.systemInstructions).toContain('cultural fit');
  });

  it('prohibits making a final employment decision', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT);
    expect(prompt.systemInstructions).toContain('Do NOT make a final employment decision');
  });

  it('handles oversized resume by truncating', () => {
    const longResume = 'A '.repeat(20000);
    const input: ScreeningInput = { ...BASE_INPUT, resumeText: longResume };
    const prompt = buildResumeScreeningPrompt(input);
    expect(prompt.evaluationInput).toContain('resume truncated');
    expect(prompt.evaluationInput.length).toBeLessThan(longResume.length + 2000);
  });

  it('handles empty optional fields gracefully', () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      requiredSkills: [],
      preferredSkills: [],
      screeningQuestions: [],
      requiredCertifications: [],
      preferredCertifications: [],
    };
    const prompt = buildResumeScreeningPrompt(input);
    expect(prompt.evaluationInput).toContain('none specified');
  });

  it('uses the provided prompt version', () => {
    const input: ScreeningInput = { ...BASE_INPUT, promptVersion: 'v2-custom' };
    const prompt = buildResumeScreeningPrompt(input);
    expect(prompt.promptVersion).toBe('v2-custom');
  });
});
