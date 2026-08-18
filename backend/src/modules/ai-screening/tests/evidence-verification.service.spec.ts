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
Assisted a team that deployed Kubernetes.
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
  beforeEach(() => {
    svc = new EvidenceVerificationService();
  });

  // ── verify() method ────────────────────────────────────────────────────────

  it('returns VERBATIM for exact normalised match', () => {
    const result = svc.verify('Built NestJS backend services', 'RESUME', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERBATIM');
  });

  it('returns SUPPORTED (not VERBATIM) when 80%+ significant words match but the quote is not contiguous', () => {
    // "NestJS backend services REST endpoints" — words all present but not a
    // verbatim quote (resume: "...services exposing REST endpoints")
    const result = svc.verify(
      'NestJS backend services REST endpoints',
      'RESUME',
      RESUME_TEXT.toLowerCase(),
    );
    expect(result).toBe('SUPPORTED');
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

  it('ADVERSARIAL: paraphrase that upgrades the claim ("Led" vs "Assisted") is NOT verified', () => {
    // Resume: "Assisted a team that deployed Kubernetes."
    // Model:  "Led Kubernetes cluster deployments."
    // Only "Kubernetes" overlaps — "led", "cluster", "deployments" are not in
    // the resume (or share no vocabulary with it). A fabrication that merely
    // shares vocabulary must not be treated as verified.
    const result = svc.verify(
      'Led Kubernetes cluster deployments',
      'RESUME',
      RESUME_TEXT.toLowerCase(),
    );
    expect(result).toBe('UNVERIFIED');
  });

  it('ADVERSARIAL: high-overlap paraphrase is SUPPORTED but never VERBATIM', () => {
    // Resume: "Designed PostgreSQL schemas and optimised SQL queries."
    // Model:  "optimised SQL queries and designed PostgreSQL schemas"
    const result = svc.verify(
      'optimised SQL queries and designed PostgreSQL schemas',
      'RESUME',
      RESUME_TEXT.toLowerCase(),
    );
    expect(result).toBe('SUPPORTED');
    expect(result).not.toBe('VERBATIM');
  });

  it('does not verify JOB_REQUIREMENT source (always VERBATIM)', () => {
    const result = svc.verify(
      'Invented job text that does not match',
      'JOB_REQUIREMENT',
      RESUME_TEXT.toLowerCase(),
    );
    expect(result).toBe('VERBATIM');
  });

  it('does not verify UNKNOWN source (always VERBATIM)', () => {
    const result = svc.verify('Anything', 'UNKNOWN', RESUME_TEXT.toLowerCase());
    expect(result).toBe('VERBATIM');
  });

  // ── verifyEvaluations() method ─────────────────────────────────────────────

  it('does not flag evidenceUnverified when evidence is VERBATIM', () => {
    const result = svc.verifyEvaluations([makeEval('Built NestJS backend services')], RESUME_TEXT);
    expect(result[0].evidenceUnverified).toBeFalsy();
    expect(result[0].confidence).toBe(ScreeningConfidence.HIGH);
  });

  it('does not flag evidenceUnverified for SUPPORTED paraphrases', () => {
    const result = svc.verifyEvaluations(
      [makeEval('NestJS backend services REST endpoints')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBeFalsy();
  });

  it('flags evidenceUnverified and downgrades confidence when evidence is UNVERIFIED', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Deployed on AWS EKS with 50-node clusters')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBe(true);
    expect(result[0].confidence).toBe(ScreeningConfidence.MEDIUM); // downgraded from HIGH
  });

  it('ADVERSARIAL: upgraded paraphrase ("Led Kubernetes cluster deployments") flags UNVERIFIED', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Led Kubernetes cluster deployments')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBe(true);
  });

  it('does not flag evidenceUnverified for JOB_REQUIREMENT evidence', () => {
    const result = svc.verifyEvaluations(
      [makeEval('Invented requirement text', 'JOB_REQUIREMENT')],
      RESUME_TEXT,
    );
    expect(result[0].evidenceUnverified).toBeFalsy();
  });

  it('does not flag when empty sourceText (model chose not to quote)', () => {
    const result = svc.verifyEvaluations([makeEval('')], RESUME_TEXT);
    expect(result[0].evidenceUnverified).toBeFalsy();
  });
});
