import { CriterionBuilderService } from '../services/criterion-builder.service';
import { ApplicationData } from '../services/screening-input-builder.service';

function makeApp(overrides: Partial<ApplicationData['job']> = {}): ApplicationData {
  return {
    id: 'app-1',
    companyId: 'co-1',
    job: {
      id: 'job-1',
      title: 'Software Engineer',
      description: 'Build software.',
      responsibilities: null,
      qualifications: null,
      experienceLevel: 'SENIOR',
      updatedAt: new Date('2026-01-01'),
      skills: [],
      screeningQuestions: [],
      educationRequirements: [],
      experienceRequirements: [],
      ...overrides,
    },
    candidate: { id: 'cand-1', firstName: 'John', lastName: 'Doe' },
    screeningAnswers: [],
  };
}

describe('CriterionBuilderService', () => {
  let svc: CriterionBuilderService;
  beforeEach(() => {
    svc = new CriterionBuilderService();
  });

  it('builds skill criteria from job skills', () => {
    const app = makeApp({
      skills: [
        { skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' },
        { skill: { displayName: 'React' }, importance: 'PREFERRED' },
      ],
    });
    const criteria = svc.build(app);
    expect(criteria.some((c) => c.name === 'TypeScript' && c.requirementType === 'REQUIRED')).toBe(
      true,
    );
    expect(criteria.some((c) => c.name === 'React' && c.requirementType === 'PREFERRED')).toBe(
      true,
    );
  });

  it('builds experience criteria from experienceRequirements', () => {
    const app = makeApp({
      experienceRequirements: [
        {
          title: 'Backend Engineer',
          domain: 'Node.js',
          minimumYears: 3,
          maximumYears: null,
          importance: 'REQUIRED',
          description: null,
        },
      ],
    });
    const criteria = svc.build(app);
    const expCrit = criteria.find((c) => c.category === 'EXPERIENCE');
    expect(expCrit).toBeDefined();
    expect(expCrit?.minimumYears).toBe(3);
    expect(expCrit?.requirementType).toBe('REQUIRED');
  });

  it('builds education criteria from educationRequirements', () => {
    const app = makeApp({
      educationRequirements: [
        {
          level: 'BACHELORS',
          fieldOfStudy: 'Computer Science',
          importance: 'REQUIRED',
          notes: null,
        },
      ],
    });
    const criteria = svc.build(app);
    const eduCrit = criteria.find((c) => c.category === 'EDUCATION');
    expect(eduCrit).toBeDefined();
    expect(eduCrit?.requirementType).toBe('REQUIRED');
    expect(eduCrit?.name).toContain('Bachelor');
  });

  it('synthesises fallback experience criterion from experienceLevel when no explicit reqs', () => {
    const app = makeApp({ experienceRequirements: [] });
    const criteria = svc.build(app);
    // SENIOR level should produce a fallback experience criterion
    const expCrit = criteria.find((c) => c.category === 'EXPERIENCE');
    expect(expCrit).toBeDefined();
    expect(expCrit?.requirementType).toBe('REQUIRED');
  });

  it('normalises weights to sum to 1.0', () => {
    const app = makeApp({
      skills: [
        { skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' },
        { skill: { displayName: 'React' }, importance: 'REQUIRED' },
        { skill: { displayName: 'GraphQL' }, importance: 'PREFERRED' },
      ],
    });
    const criteria = svc.build(app);
    const total = criteria.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1.0, 3);
  });

  it('all criteria have unique IDs', () => {
    const app = makeApp({
      skills: [
        { skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' },
        { skill: { displayName: 'React' }, importance: 'PREFERRED' },
      ],
      educationRequirements: [
        { level: 'BACHELORS', fieldOfStudy: 'CS', importance: 'REQUIRED', notes: null },
      ],
    });
    const criteria = svc.build(app);
    const ids = criteria.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('returns empty array when job has no data', () => {
    const app = makeApp({
      skills: [],
      educationRequirements: [],
      experienceRequirements: [],
      experienceLevel: 'NOT_SPECIFIED',
    });
    const criteria = svc.build(app);
    expect(criteria).toHaveLength(0);
  });

  it('hasSufficientCriteria returns true when skills exist', () => {
    const app = makeApp({
      skills: [{ skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' }],
    });
    expect(svc.hasSufficientCriteria(app)).toBe(true);
  });

  it('hasSufficientCriteria returns false when nothing configured', () => {
    const app = makeApp({
      skills: [],
      educationRequirements: [],
      experienceRequirements: [],
      experienceLevel: 'NOT_SPECIFIED',
    });
    expect(svc.hasSufficientCriteria(app)).toBe(false);
  });
});
