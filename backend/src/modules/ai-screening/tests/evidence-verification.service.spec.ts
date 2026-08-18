import { EvidenceVerificationService } from '../services/evidence-verification.service';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { CriterionEvaluation } from '../domain/criterion-evaluation.type';

const RESUME_TEXT = `
Software Engineer at ABC Ltd
Jan 2021 – Present
Built NestJS backend services exposing REST endpoints for mobile and web clients.
Designed PostgreSQL schemas and optimised SQL queries.
Administered Ubuntu production infrastructure.
Led a five-person development team and coordinated sprint delivery.
TypeScript, Node.js, Express, React, Docker.
`.trim();

function makeEval(sourceText: string, sourceCategory = 'RESUME'): CriterionEvaluation {
  return {
    criterionId: 'c-1',
    criterion: 'Test',
    requirementType: 'REQUIRED',
    status: 'FULLY_MET',
    reason: 'Test reason.',
    confidence: ScreeningConfidence.HIGH,
    evidence: [{ sourceCategory: sourceCategory as ScreeningSourceCategory, sourceText }],
  };
}

describe('EvidenceVerificationService', () => {
  let svc: EvidenceVerificationService;
  beforeEach(() => { svc = new EvidenceVerificationService(); });

  // ── verify() method ────────────────────────────────────────────────────────

  it('returns VERIFIED for exact normalised match', () => {
    const result = svc.verify('Built NestJS backend services', 'RESUME', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERIFIED');
  });

  it('returns VERIFIED when 80%+ significant words match', () => {
    // "NestJS backend services REST endpoints" — most words in resume
    const result = svc.verify('NestJS backend services REST endpoints', 'RESUME', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERIFIED');
  });

  it('returns INFERRED when empty sourceText (model withheld quote)', () => {
    const result = svc.verify('', 'RESUME', RESUME_TEXT.toLowerCase());
    expect(result).toBe('INFERRED');
  });

  it('returns UNVERIFIED for completely invented text', () => {
    const result = svc.verify(
      'Managed Kubernetes clusters at scale across 12 datacentres',
      'RESUME',
      RESUME_TEXT.toLowerCase(),
    );
    expect(result).toBe('UNVERIFIED');
  });

  it('does not verify JOB_REQUIREMENT source (always VERIFIED)', () => {
    const result = svc.verify('Invented job text that does not match', 'JOB_REQUIREMENT', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERIFIED');
  });

  it('does not verify UNKNOWN source (always VERIFIED)', () => {
    const result = svc.verify('Anything', 'UNKNOWN', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERIFIED');
  });

  // ── verifyEvaluations() method ─────────────────────────────────────────────

  it('does not flag evidenceUnverified when evidence is VERIFIED', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Built NestJS backend services')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBeFalsy();
    expect(result[0].confidence).toBe(ScreeningConfidence.HIGH);
  });

  it('flags evidenceUnverified and downgrades confidence when evidence is UNVERIFIED', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Deployed on AWS EKS with 50-node clusters')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBe(true);
    expect(result[0].confidence).toBe(ScreeningConfidence.MEDIUM); // downgraded from HIGH
  });

  it('does not flag evidenceUnverified for JOB_REQUIREMENT evidence', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Invented requirement text', 'JOB_REQUIREMENT')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBeFalsy();
  });

  it('does not flag when empty sourceText (model chose not to quote)', () => {
    const result = svc.verifyEvaluations(
      [makeEval('')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBeFalsy();
  });
});
