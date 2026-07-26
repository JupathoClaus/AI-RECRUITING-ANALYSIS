import { ConfigService } from '@nestjs/config';
import { ScreeningInputBuilderService, ApplicationData, ResumeTextData } from '../services/screening-input-builder.service';
import { ScreeningInput } from '../domain/screening-input.type';

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'aiScreening.maxResumeChars') return 15000;
    return undefined;
  }),
};

function createMockApplication(overrides?: Partial<ApplicationData>): ApplicationData {
  return {
    id: 'app-1',
    companyId: 'company-1',
    job: {
      id: 'job-1',
      title: 'Software Engineer',
      description: 'Build software.',
      qualifications: null,
      updatedAt: new Date(),
      skills: [
        { skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' },
        { skill: { displayName: 'React' }, importance: 'REQUIRED' },
        { skill: { displayName: 'GraphQL' }, importance: 'PREFERRED' },
      ],
      screeningQuestions: [
        { id: 'q1', question: 'Years of experience?', required: true },
      ],
    },
    candidate: { id: 'cand-1' },
    screeningAnswers: [
      { questionId: 'q1', question: { question: 'Years of experience?', required: true }, textAnswer: '5 years' },
    ],
    ...overrides,
  };
}

const MOCK_RESUME_TEXT: ResumeTextData = {
  parsedText: 'Experienced TypeScript developer with React skills. 5 years of experience.',
  checksumSha256: 'abc123',
};

describe('ScreeningInputBuilderService', () => {
  let builder: ScreeningInputBuilderService;

  beforeEach(() => {
    builder = new ScreeningInputBuilderService(mockConfigService as unknown as ConfigService);
  });

  it('creates valid ScreeningInput from authoritative data', () => {
    const app = createMockApplication();
    const input = builder.build(app, MOCK_RESUME_TEXT);

    expect(input).toBeDefined();
    expect(input.applicationId).toBe('app-1');
    expect(input.candidateId).toBe('cand-1');
    expect(input.jobId).toBe('job-1');
    expect(input.companyId).toBe('company-1');
    expect(input.jobTitle).toBe('Software Engineer');
    expect(input.jobDescription).toBe('Build software.');
  });

  it('includes required skills', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.requiredSkills).toContain('TypeScript');
    expect(input.requiredSkills).toContain('React');
    expect(input.requiredSkills).not.toContain('GraphQL');
  });

  it('includes preferred skills', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.preferredSkills).toContain('GraphQL');
    expect(input.preferredSkills).not.toContain('TypeScript');
  });

  it('includes resume text', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.resumeText).toContain('TypeScript');
  });

  it('includes screening answers', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.screeningQuestions).toHaveLength(1);
    expect(input.screeningQuestions[0].question).toBe('Years of experience?');
    expect(input.screeningQuestions[0].answer).toBe('5 years');
  });

  it('excludes candidate contact details from input', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input).not.toHaveProperty('candidateEmail');
    expect(input).not.toHaveProperty('candidatePhone');
  });

  it('excludes date of birth', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input).not.toHaveProperty('dateOfBirth');
  });

  it('excludes gender', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input).not.toHaveProperty('gender');
  });

  it('excludes address', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input).not.toHaveProperty('address');
  });

  it('enforces text limits on resume', () => {
    const longResume = 'A'.repeat(20000);
    const input = builder.build(createMockApplication(), { ...MOCK_RESUME_TEXT, parsedText: longResume });
    expect(input.resumeText.length).toBeLessThanOrEqual(15000 + 25); // 15000 + truncation suffix
  });

  it('freezes the returned object (immutable)', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(Object.isFrozen(input)).toBe(true);
  });

  it('uses job qualifications when description is missing', () => {
    const app = createMockApplication({
      job: {
        ...createMockApplication().job,
        description: '',
        qualifications: 'Qual: Must know TypeScript',
      },
    });
    const input = builder.build(app, MOCK_RESUME_TEXT);
    expect(input.jobDescription).toBe('Qual: Must know TypeScript');
  });

  it('returns empty screening answers when none exist', () => {
    const app = createMockApplication({ screeningAnswers: [] });
    const input = builder.build(app, MOCK_RESUME_TEXT);
    expect(input.screeningQuestions[0].answer).toBe('');
  });

  it('handles empty required skills', () => {
    const app = createMockApplication({
      job: { ...createMockApplication().job, skills: [] },
    });
    const input = builder.build(app, MOCK_RESUME_TEXT);
    expect(input.requiredSkills).toEqual([]);
    expect(input.preferredSkills).toEqual([]);
  });
});
