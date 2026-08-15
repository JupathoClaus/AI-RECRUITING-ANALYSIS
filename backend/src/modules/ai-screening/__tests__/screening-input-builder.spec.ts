import { ConfigService } from '@nestjs/config';
import {
  ScreeningInputBuilderService,
  ApplicationData,
} from '../services/screening-input-builder.service';
import { CompletedExtraction } from '../services/resume-text-loader.service';
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
      responsibilities: 'Design and implement features.',
      qualifications: null,
      experienceLevel: 'SENIOR',
      updatedAt: new Date(),
      skills: [
        { skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' },
        { skill: { displayName: 'React' }, importance: 'REQUIRED' },
        { skill: { displayName: 'GraphQL' }, importance: 'PREFERRED' },
      ],
      screeningQuestions: [{ id: 'q1', question: 'Years of experience?', required: true }],
      educationRequirements: [
        { level: 'BACHELORS', fieldOfStudy: 'Computer Science', importance: 'REQUIRED', notes: null },
      ],
      experienceRequirements: [
        { title: 'Software Engineer', domain: 'Backend', minimumYears: 5, maximumYears: null, importance: 'REQUIRED', description: null },
      ],
    },
    candidate: { id: 'cand-1' },
    screeningAnswers: [
      {
        questionId: 'q1',
        question: { question: 'Years of experience?', required: true },
        textAnswer: '5 years',
      },
    ],
    ...overrides,
  };
}

const MOCK_RESUME_TEXT: CompletedExtraction = {
  parsedText: 'Experienced TypeScript developer with React skills. 5 years of experience.',
  extractedTextSha256: 'abc123',
  sourceFileSha256: 'def456',
  parserName: 'pdf-parse',
  parserVersion: '1.1.1',
  completedAt: new Date(),
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
    const input = builder.build(createMockApplication(), {
      ...MOCK_RESUME_TEXT,
      parsedText: longResume,
    });
    expect(input.resumeText.length).toBeLessThanOrEqual(15000 + 25); // 15000 + truncation suffix
  });

  it('freezes the returned object (immutable)', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(Object.isFrozen(input)).toBe(true);
  });

  it('includes responsibilities in jobResponsibilities field', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.jobResponsibilities).toBe('Design and implement features.');
  });

  it('includes experienceLevel label', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.experienceLevel).toContain('Senior');
  });

  it('formats experience requirements into requiredExperience string', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.requiredExperience).toContain('5+');
    expect(input.requiredExperience).toContain('Backend');
  });

  it('formats education requirements into requiredEducation string', () => {
    const input = builder.build(createMockApplication(), MOCK_RESUME_TEXT);
    expect(input.requiredEducation).toContain("Bachelor");
    expect(input.requiredEducation).toContain("Computer Science");
  });

  it('falls back to experienceLevel label when no experience requirements', () => {
    const app = createMockApplication({
      job: { ...createMockApplication().job, experienceRequirements: [] },
    });
    const input = builder.build(app, MOCK_RESUME_TEXT);
    expect(input.requiredExperience).toContain('Senior');
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
