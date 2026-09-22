import { AssessmentValidationService } from '../services/assessment-validation.service';
import { AssessmentQuestionType } from '@prisma/client';

function choice(sortOrder: number, overrides = {}) {
  return {
    type: AssessmentQuestionType.SINGLE_CHOICE,
    prompt: 'What command shows disk usage on Linux?',
    sortOrder,
    points: 10,
    options: [
      { label: 'df -h', sortOrder: 0, isCorrect: true },
      { label: 'ls -la', sortOrder: 1, isCorrect: false },
    ],
    ...overrides,
  };
}

function longText(sortOrder: number, overrides = {}) {
  return {
    type: AssessmentQuestionType.LONG_TEXT,
    prompt: 'Describe a production outage you resolved.',
    sortOrder,
    aiEvaluated: true,
    rubricCriteria: [{ name: 'Troubleshooting', maxScore: 4, weight: 1, sortOrder: 0 }],
    ...overrides,
  };
}

describe('AssessmentValidationService', () => {
  let svc: AssessmentValidationService;
  beforeEach(() => {
    svc = new AssessmentValidationService();
  });

  it('rejects an empty assessment', () => {
    const issues = svc.validateForPublish({ questions: [] });
    expect(issues.some((i) => i.code === 'EMPTY_ASSESSMENT')).toBe(true);
  });

  it('rejects choice questions without options', () => {
    const issues = svc.validateForPublish({ questions: [choice(0, { options: [] })] });
    expect(issues.some((i) => i.code === 'MISSING_OPTIONS')).toBe(true);
  });

  it('rejects duplicate options (case-insensitive)', () => {
    const issues = svc.validateForPublish({
      questions: [
        choice(0, {
          options: [
            { label: 'df -h', sortOrder: 0, isCorrect: true },
            { label: 'DF -H', sortOrder: 1, isCorrect: false },
          ],
        }),
      ],
    });
    expect(issues.some((i) => i.code === 'DUPLICATE_OPTIONS')).toBe(true);
  });

  it('rejects single-choice with multiple correct answers', () => {
    const issues = svc.validateForPublish({
      questions: [
        choice(0, {
          options: [
            { label: 'a', sortOrder: 0, isCorrect: true },
            { label: 'b', sortOrder: 1, isCorrect: true },
          ],
        }),
      ],
    });
    expect(issues.some((i) => i.code === 'AMBIGUOUS_CORRECT_ANSWER')).toBe(true);
  });

  it('rejects deterministic questions with no correct answer', () => {
    const issues = svc.validateForPublish({
      questions: [
        choice(0, {
          options: [
            { label: 'a', sortOrder: 0, isCorrect: false },
            { label: 'b', sortOrder: 1, isCorrect: false },
          ],
        }),
      ],
    });
    expect(issues.some((i) => i.code === 'MISSING_CORRECT_ANSWER')).toBe(true);
  });

  it('rejects AI-evaluated text without a rubric', () => {
    const issues = svc.validateForPublish({ questions: [longText(0, { rubricCriteria: [] })] });
    expect(issues.some((i) => i.code === 'MISSING_RUBRIC')).toBe(true);
  });

  it('rejects invalid duration and passing score', () => {
    const issues = svc.validateForPublish({
      durationMinutes: 0,
      passingScore: 101,
      questions: [choice(0)],
    });
    expect(issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
    expect(issues.some((i) => i.code === 'INVALID_PASSING_SCORE')).toBe(true);
  });

  it('rejects duplicate question ordering', () => {
    const issues = svc.validateForPublish({ questions: [choice(0), choice(0)] });
    expect(issues.some((i) => i.code === 'DUPLICATE_ORDER')).toBe(true);
  });

  it('blocks publishing when AI content is unapproved', () => {
    const issues = svc.validateForPublish({
      questions: [choice(0, { aiGenerated: true, aiApproved: false })],
    });
    expect(issues.some((i) => i.code === 'AI_CONTENT_UNAPPROVED')).toBe(true);
  });

  it('flags non-job-related criteria', () => {
    const issues = svc.validateForPublish({
      questions: [choice(0, { prompt: 'What is your marital status and religion?' })],
    });
    expect(issues.some((i) => i.code === 'PROHIBITED_CRITERION')).toBe(true);
  });

  it('requires at least one scored question', () => {
    const issues = svc.validateForPublish({
      questions: [
        {
          type: AssessmentQuestionType.SHORT_TEXT,
          prompt: 'Any comments?',
          sortOrder: 0,
          aiEvaluated: false,
        },
      ],
    });
    expect(issues.some((i) => i.code === 'NO_SCORED_QUESTION')).toBe(true);
  });

  it('accepts a valid mixed assessment', () => {
    const issues = svc.validateForPublish({
      durationMinutes: 20,
      passingScore: 70,
      questions: [
        choice(0),
        {
          type: AssessmentQuestionType.MULTIPLE_CHOICE,
          prompt: 'Select valid backup tools.',
          sortOrder: 1,
          points: 10,
          options: [
            { label: 'rsync', sortOrder: 0, isCorrect: true },
            { label: 'borg', sortOrder: 1, isCorrect: true },
            { label: 'solitaire', sortOrder: 2, isCorrect: false },
          ],
        },
        {
          type: AssessmentQuestionType.TRUE_FALSE,
          prompt: 'DNS resolves names.',
          sortOrder: 2,
          points: 5,
          options: [
            { label: 'True', sortOrder: 0, isCorrect: true },
            { label: 'False', sortOrder: 1, isCorrect: false },
          ],
        },
        longText(3),
      ],
    });
    expect(issues).toEqual([]);
  });

  it('assertPublishable throws with issue list', () => {
    expect(() => svc.assertPublishable({ questions: [] })).toThrow(/not publishable/);
    try {
      svc.assertPublishable({ questions: [] });
      fail('expected throw');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ASSESSMENT_NOT_PUBLISHABLE');
      expect((error as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    }
  });
});
