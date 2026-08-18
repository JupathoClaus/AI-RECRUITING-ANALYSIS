import { buildResumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { ScreeningInput } from '../domain/screening-input.type';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build software.',
  jobResponsibilities: 'Design, develop, and maintain backend services.',
  jobQualifications: 'Degree in Computer Science or equivalent experience.',
  experienceLevel: 'Senior (5–8 years)',
  requiredSkills: ['TypeScript'],
  preferredSkills: ['React'],
  requiredExperience: '3+ years',
  preferredExperience: '5+ years',
  requiredEducation: 'Bachelors',
  preferredEducation: 'Masters',
  requiredCertifications: ['AWS Certified'],
  preferredCertifications: ['GCP Certified'],
  resumeText: 'TypeScript developer with 5 years experience.',
  screeningQuestions: [
    { question: 'Do you have team lead experience?', answer: 'Yes', isRequired: true },
  ],
};

const BASE_OPTIONS = { maxResumeChars: 15000, promptVersion: 'v1' };

describe('buildResumeScreeningPrompt', () => {
  it('includes job title and description', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('Software Engineer');
    expect(prompt.evaluationInput).toContain('Build software.');
  });

  it('includes required skills', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('TypeScript');
  });

  it('includes preferred skills', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('React');
  });

  it('includes resume text', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('TypeScript developer');
  });

  it('includes screening questions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('team lead');
  });

  it('includes required certifications', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('AWS Certified');
  });

  it('includes prompt version from options', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, {
      ...BASE_OPTIONS,
      promptVersion: 'v2',
    });
    expect(prompt.promptVersion).toBe('v2');
  });

  it('includes HUMAN_REVIEW safety rule in system instructions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.systemInstructions).toContain('HUMAN_REVIEW');
    expect(prompt.systemInstructions).toContain('incomplete, contradictory, or genuinely uncertain');
  });

  it('prohibits protected-characteristic reasoning in system instructions', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.systemInstructions).toContain('age');
    expect(prompt.systemInstructions).toContain('gender');
    expect(prompt.systemInstructions).toContain('race');
    expect(prompt.systemInstructions).toContain('religion');
  });

  it('prohibits inferring personality or cultural fit', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.systemInstructions).toContain('personality');
    expect(prompt.systemInstructions).toContain('cultural fit');
  });

  it('prohibits making a final employment decision', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.systemInstructions).toContain('Do NOT make a final employment decision');
  });

  it('configured resume limit is applied', () => {
    const longResume = 'A '.repeat(20000);
    const input: ScreeningInput = { ...BASE_INPUT, resumeText: longResume };
    const prompt = buildResumeScreeningPrompt(input, { maxResumeChars: 5000, promptVersion: 'v1' });
    expect(prompt.evaluationInput).toContain('resume truncated');
  });

  it('candidate/application/company IDs are not placed in the model prompt', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.evaluationInput).not.toContain('app-1');
    expect(prompt.evaluationInput).not.toContain('cand-1');
    expect(prompt.evaluationInput).not.toContain('job-1');
    expect(prompt.evaluationInput).not.toContain('company-1');
  });

  it('duplicate and blank array entries are normalized', () => {
    const input: ScreeningInput = {
      ...BASE_INPUT,
      resumeText: 'Developer with experience.',
      preferredSkills: [],
      requiredSkills: ['React', '', 'React', '  ', 'Node.js'],
    };
    const prompt = buildResumeScreeningPrompt(input, BASE_OPTIONS);
    const reactCount = (prompt.evaluationInput.match(/^  - React$/gm) || []).length;
    expect(reactCount).toBe(1);
    expect(prompt.evaluationInput).toContain('Node.js');
  });

  it('prompt remains deterministic', () => {
    const r1 = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    const r2 = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(r1.evaluationInput).toBe(r2.evaluationInput);
    expect(r1.systemInstructions).toBe(r2.systemInstructions);
  });

  it('protected-attribute safety rules are present', () => {
    const prompt = buildResumeScreeningPrompt(BASE_INPUT, BASE_OPTIONS);
    expect(prompt.systemInstructions).toContain('protected characteristics');
    expect(prompt.systemInstructions).toContain('Do NOT infer');
    expect(prompt.systemInstructions).toContain('prohibitedReasoningDetected');
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
    const prompt = buildResumeScreeningPrompt(input, BASE_OPTIONS);
    expect(prompt.evaluationInput).toContain('none specified');
  });
});
