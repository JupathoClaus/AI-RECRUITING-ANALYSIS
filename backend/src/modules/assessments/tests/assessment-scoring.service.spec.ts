import { AssessmentScoringService } from '../services/assessment-scoring.service';
import { AssessmentQuestionType } from '@prisma/client';

const Q1 = {
  id: 'q1',
  type: AssessmentQuestionType.SINGLE_CHOICE,
  points: 10,
  competency: 'Linux',
  options: [
    { id: 'o1', isCorrect: true },
    { id: 'o2', isCorrect: false },
  ],
};
const Q2 = {
  id: 'q2',
  type: AssessmentQuestionType.MULTIPLE_CHOICE,
  points: 10,
  competency: 'Networking',
  options: [
    { id: 'a', isCorrect: true },
    { id: 'b', isCorrect: true },
    { id: 'c', isCorrect: false },
  ],
};
const Q3 = {
  id: 'q3',
  type: AssessmentQuestionType.LONG_TEXT,
  points: 0,
  competency: 'Troubleshooting',
  options: [],
};

describe('AssessmentScoringService', () => {
  let svc: AssessmentScoringService;
  beforeEach(() => {
    svc = new AssessmentScoringService();
  });

  it('scores all-correct as full marks', () => {
    const result = svc.scoreDeterministic(
      [Q1, Q2],
      [
        { questionId: 'q1', selectedOptionIds: ['o1'] },
        { questionId: 'q2', selectedOptionIds: ['a', 'b'] },
      ],
    );
    expect(result.totalScore).toBe(20);
    expect(result.totalMax).toBe(20);
  });

  it('scores all-wrong as zero', () => {
    const result = svc.scoreDeterministic(
      [Q1, Q2],
      [
        { questionId: 'q1', selectedOptionIds: ['o2'] },
        { questionId: 'q2', selectedOptionIds: ['c'] },
      ],
    );
    expect(result.totalScore).toBe(0);
  });

  it('gives zero for multiple selections on single-choice', () => {
    const result = svc.scoreDeterministic(
      [Q1],
      [{ questionId: 'q1', selectedOptionIds: ['o1', 'o2'] }],
    );
    expect(result.totalScore).toBe(0);
  });

  it('awards partial credit for multiple-choice coverage', () => {
    const result = svc.scoreDeterministic([Q2], [{ questionId: 'q2', selectedOptionIds: ['a'] }]);
    expect(result.totalScore).toBe(5);
  });

  it('penalizes incorrect selections in multiple-choice without going negative', () => {
    const partial = svc.scoreDeterministic(
      [Q2],
      [{ questionId: 'q2', selectedOptionIds: ['a', 'c'] }],
    );
    expect(partial.totalScore).toBe(0);
    const full = svc.scoreDeterministic(
      [Q2],
      [{ questionId: 'q2', selectedOptionIds: ['a', 'b', 'c'] }],
    );
    expect(full.totalScore).toBe(5);
  });

  it('scores unanswered questions as zero', () => {
    const result = svc.scoreDeterministic([Q1, Q2], []);
    expect(result.totalScore).toBe(0);
    expect(result.totalMax).toBe(20);
  });

  it('leaves open-text questions to AI evaluation (0 deterministic impact)', () => {
    const result = svc.scoreDeterministic(
      [Q1, Q3],
      [{ questionId: 'q1', selectedOptionIds: ['o1'] }],
    );
    const text = result.questions.find((q) => q.questionId === 'q3')!;
    expect(text.score).toBe(0);
    expect(text.max).toBe(0);
    expect(text.deterministic).toBe(false);
    expect(result.totalScore).toBe(10);
  });

  it('preserves competency attribution per question', () => {
    const result = svc.scoreDeterministic([Q1], [{ questionId: 'q1', selectedOptionIds: ['o1'] }]);
    expect(result.questions[0].competency).toBe('Linux');
  });
});
