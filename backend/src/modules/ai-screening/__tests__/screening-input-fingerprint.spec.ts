import {
  computeScreeningFingerprint,
  FingerprintContext,
} from '../utils/screening-input-fingerprint';
import { ScreeningInput } from '../domain/screening-input.type';

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  companyId: 'company-1',
  jobTitle: 'Engineer',
  jobDescription: 'Build software.',
  jobResponsibilities: '',
  jobQualifications: '',
  experienceLevel: 'Senior (5–8 years)',
  requiredSkills: ['TypeScript'],
  preferredSkills: [],
  requiredExperience: '3+ years',
  preferredExperience: '',
  requiredEducation: 'Bachelors',
  preferredEducation: '',
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText: 'TypeScript developer.',
  screeningQuestions: [],
  promptVersion: 'v1',
};

function createContext(overrides?: Partial<FingerprintContext>): FingerprintContext {
  return {
    applicationId: 'app-1',
    input: BASE_INPUT,
    jobUpdatedAt: '2025-01-01T00:00:00.000Z',
    resumeChecksumSha256: 'abc123',
    resumeUpdatedAt: '2025-01-01T00:00:00.000Z',
    provider: 'mock',
    model: 'gpt-4o-mini',
    promptVersion: 'v1',
    schemaVersion: 'v1',
    ...overrides,
  };
}

describe('computeScreeningFingerprint', () => {
  it('produces a deterministic SHA-256 hex string', () => {
    const fp = computeScreeningFingerprint(createContext());
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('identical input produces identical fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext());
    expect(fp1).toBe(fp2);
  });

  it('property order does not change fingerprint', () => {
    const ctx = createContext();
    const input1: ScreeningInput = { ...BASE_INPUT };
    const input2: ScreeningInput = { ...BASE_INPUT };

    const fp1 = computeScreeningFingerprint({ ...ctx, input: input1 });
    const fp2 = computeScreeningFingerprint({ ...ctx, input: input2 });
    expect(fp1).toBe(fp2);
  });

  it('changed resume text changes fingerprint', () => {
    const ctx = createContext();
    const fp1 = computeScreeningFingerprint(ctx);
    const fp2 = computeScreeningFingerprint({
      ...ctx,
      input: { ...BASE_INPUT, resumeText: 'Different resume content.' },
    });
    expect(fp1).not.toBe(fp2);
  });

  it('changed job description changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint({
      ...createContext(),
      input: { ...BASE_INPUT, jobDescription: 'Different job.' },
    });
    expect(fp1).not.toBe(fp2);
  });

  it('changed model changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext({ model: 'gpt-4' }));
    expect(fp1).not.toBe(fp2);
  });

  it('changed promptVersion changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext({ promptVersion: 'v2' }));
    expect(fp1).not.toBe(fp2);
  });

  it('changed schemaVersion changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext({ schemaVersion: 'v2' }));
    expect(fp1).not.toBe(fp2);
  });

  it('changed resumeChecksumSha256 changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext({ resumeChecksumSha256: 'def456' }));
    expect(fp1).not.toBe(fp2);
  });

  it('changed jobUpdatedAt changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(
      createContext({ jobUpdatedAt: '2025-02-01T00:00:00.000Z' }),
    );
    expect(fp1).not.toBe(fp2);
  });

  it('changed provider changes fingerprint', () => {
    const fp1 = computeScreeningFingerprint(createContext());
    const fp2 = computeScreeningFingerprint(createContext({ provider: 'openai' }));
    expect(fp1).not.toBe(fp2);
  });
});
