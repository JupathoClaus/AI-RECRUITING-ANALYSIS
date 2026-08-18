/**
 * Semantic Reasoning Benchmark
 *
 * These tests validate the overall screening pipeline logic using controlled
 * synthetic criterion evaluations. They prove that the scoring engine and
 * recommendation logic produce the correct outputs for each case.
 *
 * Note: The AI reasoning quality (whether Qwen actually understands semantics)
 * is verified separately via live Ollama runs (task 15).
 * These tests prove the INFRASTRUCTURE handles the outputs correctly.
 */

import { BackendScoringService } from '../services/backend-scoring.service';
import { EvidenceVerificationService } from '../services/evidence-verification.service';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { ScreeningCriterion } from '../domain/screening-criterion.type';

const scorer = new BackendScoringService();
const verifier = new EvidenceVerificationService();

function bench(
  caseName: string,
  jobCriteria: string,
  resumeText: string,
  simulatedEvalStatus: CriterionEvaluation['status'],
  simulatedConfidence: ScreeningConfidence,
  simulatedEvidence: string,
  expectedRecommendation: ScreeningRecommendation,
  requirementType: CriterionEvaluation['requirementType'] = 'REQUIRED',
) {
  it(`Case: ${caseName}`, () => {
    const criterion: ScreeningCriterion = {
      id: 'c-1',
      name: jobCriteria,
      description: jobCriteria,
      requirementType,
      category: 'SKILL',
      weight: 1.0,
    };

    const evaluation: CriterionEvaluation = {
      criterionId: 'c-1',
      criterion: jobCriteria,
      requirementType,
      status: simulatedEvalStatus,
      reason: `Evaluation reason for: ${jobCriteria}`,
      confidence: simulatedConfidence,
      evidence: [
        {
          sourceCategory: ScreeningSourceCategory.RESUME,
          sourceText: simulatedEvidence,
        },
      ],
    };

    // Run evidence verification
    const verified = verifier.verifyEvaluations([evaluation], resumeText);

    // Run backend scoring
    const result = scorer.score({
      evaluations: verified,
      criteria: [criterion],
      hasUnverifiedCriticalEvidence: verified.some((e) => e.evidenceUnverified && e.requirementType !== 'PREFERRED'),
    });

    expect(result.recommendation).toBe(expectedRecommendation);
  });
}

describe('Semantic Reasoning Benchmark — 8 Cases', () => {
  /**
   * Case 1: REST API development — semantic match
   * Job: "Experience developing REST APIs"
   * Resume: "Designed and maintained NestJS services exposing HTTP endpoints"
   * Expected: Model returns FULLY_MET → SHORTLIST
   */
  bench(
    'Case 1 — REST API semantic equivalence',
    'Experience developing REST APIs',
    'Designed and maintained NestJS services exposing HTTP endpoints for mobile and web clients.',
    'FULLY_MET',
    ScreeningConfidence.HIGH,
    'Designed and maintained NestJS services exposing HTTP endpoints',
    ScreeningRecommendation.SHORTLIST,
  );

  /**
   * Case 2: Relational databases — semantic match
   * Job: "Experience with relational databases"
   * Resume: "Designed PostgreSQL schemas and optimized SQL queries."
   * Expected: FULLY_MET → SHORTLIST
   */
  bench(
    'Case 2 — Relational database semantic equivalence',
    'Experience with relational databases',
    'Designed PostgreSQL schemas and optimized SQL queries.',
    'FULLY_MET',
    ScreeningConfidence.HIGH,
    'Designed PostgreSQL schemas and optimized SQL queries.',
    ScreeningRecommendation.SHORTLIST,
  );

  /**
   * Case 3: Linux server administration — semantic match
   * Job: "Experience managing Linux servers"
   * Resume: "Administered Ubuntu production infrastructure and automated deployments."
   * Expected: FULLY_MET → SHORTLIST
   */
  bench(
    'Case 3 — Linux server semantic match',
    'Experience managing Linux servers',
    'Administered Ubuntu production infrastructure and automated deployments using shell scripts.',
    'FULLY_MET',
    ScreeningConfidence.HIGH,
    'Administered Ubuntu production infrastructure',
    ScreeningRecommendation.SHORTLIST,
  );

  /**
   * Case 4: Leadership experience — semantic match
   * Job: "Leadership experience"
   * Resume: "Led a five-person development team and coordinated sprint delivery."
   * Expected: FULLY_MET → SHORTLIST
   */
  bench(
    'Case 4 — Leadership semantic match',
    'Leadership experience',
    'Led a five-person development team and coordinated sprint delivery.',
    'FULLY_MET',
    ScreeningConfidence.HIGH,
    'Led a five-person development team',
    ScreeningRecommendation.SHORTLIST,
  );

  /**
   * Case 5: Culinary experience — semantic match
   * Job: "Culinary experience"
   * Resume: "Prepared meals for a hotel restaurant and managed kitchen prep operations."
   * Expected: FULLY_MET → SHORTLIST
   */
  bench(
    'Case 5 — Culinary semantic match',
    'Culinary experience',
    'Prepared meals for a 120-seat hotel restaurant and managed kitchen prep operations.',
    'FULLY_MET',
    ScreeningConfidence.HIGH,
    'Prepared meals for a hotel restaurant and managed kitchen prep operations',
    ScreeningRecommendation.SHORTLIST,
  );

  /**
   * Case 6: NestJS — transferable skill (Node.js + Express → PARTIALLY_MET)
   * Job: "NestJS experience"
   * Resume: "Built Node.js and Express REST APIs using TypeScript."
   * Expected: PARTIALLY_MET → HUMAN_REVIEW (score=50, between 38–72)
   */
  bench(
    'Case 6 — NestJS transferable (Node.js + Express → PARTIALLY_MET)',
    'NestJS experience',
    'Built Node.js and Express REST APIs using TypeScript.',
    'PARTIALLY_MET',
    ScreeningConfidence.MEDIUM,
    'Built Node.js and Express REST APIs using TypeScript.',
    ScreeningRecommendation.HUMAN_REVIEW,
  );

  /**
   * Case 7: NEGATION — "I have never worked with TypeScript"
   * This is the critical false-positive prevention test.
   * The keyword "TypeScript" appears in the resume text but in a negative context.
   * The model must return NOT_MET (not FULLY_MET).
   * Expected: NOT_MET → NOT_SHORTLIST
   */
  bench(
    'Case 7 — Negation: TypeScript explicitly denied',
    'TypeScript',
    'I have never worked with TypeScript and do not have experience with it.',
    'NOT_MET',  // Model must detect negation and return NOT_MET
    ScreeningConfidence.HIGH,
    'I have never worked with TypeScript',
    ScreeningRecommendation.NOT_SHORTLIST,
  );

  /**
   * Case 8: Skills list only — ambiguous evidence
   * Resume only lists "Kubernetes" in a skills section with no work evidence.
   * Expected: PARTIALLY_MET or UNCERTAIN → HUMAN_REVIEW
   */
  bench(
    'Case 8 — Skills list without evidence → UNCERTAIN → HUMAN_REVIEW',
    'Kubernetes production experience',
    'Skills: Python, JavaScript, Docker, Kubernetes, AWS.',
    'UNCERTAIN',
    ScreeningConfidence.LOW,
    '',  // empty sourceText — model has no direct evidence to quote
    ScreeningRecommendation.HUMAN_REVIEW,
  );
});

describe('Multi-Job Isolation — candidate results never mix', () => {
  /**
   * Prove that scoring two different candidates with different criteria
   * produces completely independent results with no cross-contamination.
   */
  it('candidate A (React engineer) and candidate B (Chef) produce separate results', () => {
    // Candidate A: React + TypeScript job
    const reactCriteria: ScreeningCriterion[] = [
      { id: 'r-1', name: 'React', description: 'React experience', requirementType: 'REQUIRED', category: 'SKILL', weight: 0.5 },
      { id: 'r-2', name: 'TypeScript', description: 'TypeScript', requirementType: 'REQUIRED', category: 'SKILL', weight: 0.5 },
    ];
    const reactEvaluations: CriterionEvaluation[] = [
      { criterionId: 'r-1', criterion: 'React', requirementType: 'REQUIRED', status: 'FULLY_MET', reason: 'Strong React experience.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: 'Built React dashboards at ABC Ltd.' }] },
      { criterionId: 'r-2', criterion: 'TypeScript', requirementType: 'REQUIRED', status: 'FULLY_MET', reason: 'TypeScript developer.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: 'TypeScript production experience.' }] },
    ];

    // Candidate B: Chef job
    const chefCriteria: ScreeningCriterion[] = [
      { id: 'ch-1', name: 'Kitchen management', description: 'Kitchen experience', requirementType: 'REQUIRED', category: 'EXPERIENCE', weight: 0.6 },
      { id: 'ch-2', name: 'Food safety certification', description: 'Food safety', requirementType: 'HARD_REQUIREMENT', category: 'CERTIFICATION', weight: 0.4 },
    ];
    const chefEvaluations: CriterionEvaluation[] = [
      { criterionId: 'ch-1', criterion: 'Kitchen management', requirementType: 'REQUIRED', status: 'FULLY_MET', reason: 'Hotel kitchen experience.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: 'Managed hotel kitchen for 200 covers.' }] },
      { criterionId: 'ch-2', criterion: 'Food safety certification', requirementType: 'HARD_REQUIREMENT', status: 'NOT_MET', reason: 'No certification mentioned.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: '' }] },
    ];

    const resultA = scorer.score({ evaluations: reactEvaluations, criteria: reactCriteria, hasUnverifiedCriticalEvidence: false });
    const resultB = scorer.score({ evaluations: chefEvaluations, criteria: chefCriteria, hasUnverifiedCriticalEvidence: false });

    // A: both FULLY_MET → score 100 → SHORTLIST
    expect(resultA.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(resultA.overallScore).toBe(100);

    // B: HARD_REQUIREMENT NOT_MET → NOT_SHORTLIST regardless of kitchen score
    expect(resultB.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);

    // Criterion points are completely separate
    expect(resultA.criterionPoints.has('r-1')).toBe(true);
    expect(resultA.criterionPoints.has('ch-1')).toBe(false);
    expect(resultB.criterionPoints.has('ch-1')).toBe(true);
    expect(resultB.criterionPoints.has('r-1')).toBe(false);
  });

  it('finance officer and software developer produce separate independent scores', () => {
    const finCriteria: ScreeningCriterion[] = [
      { id: 'f-1', name: 'Financial reporting', description: 'Accounting', requirementType: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    ];
    const finEvals: CriterionEvaluation[] = [
      { criterionId: 'f-1', criterion: 'Financial reporting', requirementType: 'REQUIRED', status: 'FULLY_MET', reason: 'CPA with financial reporting background.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: 'Produced monthly financial reports for Board.' }] },
    ];

    const devCriteria: ScreeningCriterion[] = [
      { id: 'd-1', name: 'Node.js', description: 'Node.js development', requirementType: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    ];
    const devEvals: CriterionEvaluation[] = [
      { criterionId: 'd-1', criterion: 'Node.js', requirementType: 'REQUIRED', status: 'NOT_MET', reason: 'No Node.js evidence.', confidence: ScreeningConfidence.HIGH, evidence: [{ sourceCategory: ScreeningSourceCategory.RESUME, sourceText: '' }] },
    ];

    const finResult = scorer.score({ evaluations: finEvals, criteria: finCriteria, hasUnverifiedCriticalEvidence: false });
    const devResult = scorer.score({ evaluations: devEvals, criteria: devCriteria, hasUnverifiedCriticalEvidence: false });

    expect(finResult.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
    expect(finResult.overallScore).toBe(100);
    expect(devResult.recommendation).toBe(ScreeningRecommendation.NOT_SHORTLIST);
    expect(devResult.overallScore).toBe(0);

    // Absolutely no shared state
    expect(finResult.criterionPoints.get('f-1')).toBe(1.0);
    expect(devResult.criterionPoints.get('d-1')).toBe(0);
    expect(finResult.criterionPoints.has('d-1')).toBe(false);
    expect(devResult.criterionPoints.has('f-1')).toBe(false);
  });
});
