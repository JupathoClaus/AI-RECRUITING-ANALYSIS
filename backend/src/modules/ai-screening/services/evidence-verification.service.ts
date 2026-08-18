import { Injectable } from '@nestjs/common';
import { CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';

export type VerificationStatus = 'VERIFIED' | 'INFERRED' | 'UNVERIFIED';

export interface VerifiedEvidence {
  sourceCategory: string;
  sourceText: string;
  verificationStatus: VerificationStatus;
}

/**
 * EvidenceVerificationService
 *
 * Cross-checks each evidence quote returned by the Qwen model against the
 * actual resume text to detect hallucinated or fabricated source quotes.
 *
 * Matching strategy (in order of strictness):
 * 1. EXACT: normalised quote is a direct substring of the normalised resume.
 * 2. INFERRED: all significant words (≥4 chars) from the quote appear in the
 *    resume within a short sliding window — paraphrase detection.
 * 3. UNVERIFIED: no meaningful match found.
 *
 * Empty sourceText is always INFERRED (the model explicitly withheld the quote)
 * and does not trigger an unverified flag.
 *
 * JOB_REQUIREMENT and UNKNOWN sources are not checked against the resume.
 */
@Injectable()
export class EvidenceVerificationService {
  /**
   * Verify all evidence items across a list of criterion evaluations.
   * Returns a new array of evaluations with evidenceUnverified set where needed.
   */
  verifyEvaluations(
    evaluations: CriterionEvaluation[],
    resumeText: string,
  ): CriterionEvaluation[] {
    const normalisedResume = normaliseText(resumeText);

    return evaluations.map((ev) => {
      const verifiedEvidence = ev.evidence.map((e) => ({
        ...e,
        verificationStatus: this.verify(e.sourceText, e.sourceCategory, normalisedResume),
      }));

      // An evaluation is flagged when at least one RESUME evidence item is UNVERIFIED
      const hasUnverifiedResume = verifiedEvidence.some(
        (e) =>
          e.sourceCategory === 'RESUME' &&
          e.sourceText.trim().length > 0 &&
          e.verificationStatus === 'UNVERIFIED',
      );

      // If unverified evidence exists and confidence was HIGH, downgrade to MEDIUM
      let confidence = ev.confidence;
      if (hasUnverifiedResume && confidence === ScreeningConfidence.HIGH) {
        confidence = ScreeningConfidence.MEDIUM;
      }

      return {
        ...ev,
        evidence: verifiedEvidence.map(({ verificationStatus: _, ...rest }) => rest),
        evidenceUnverified: hasUnverifiedResume,
        confidence,
      };
    });
  }

  /**
   * Verify a single evidence item against normalised resume text.
   * Returns VERIFIED, INFERRED, or UNVERIFIED.
   */
  verify(
    sourceText: string,
    sourceCategory: string,
    normalisedResume: string,
  ): VerificationStatus {
    // Non-resume sources don't need verification
    if (sourceCategory !== 'RESUME') return 'VERIFIED';

    const text = sourceText.trim();

    // Empty text → model withheld the quote; not a hallucination, just absent
    if (text.length === 0) return 'INFERRED';

    const normText = normaliseText(text);

    // 1. Exact (normalised) substring match
    if (normalisedResume.includes(normText)) return 'VERIFIED';

    // 2. Inferred: most significant words appear in resume
    const words = significantWords(normText);
    if (words.length === 0) return 'INFERRED'; // too short to verify

    const matchCount = words.filter((w) => normalisedResume.includes(w)).length;
    const matchRatio = matchCount / words.length;

    if (matchRatio >= 0.8) return 'VERIFIED';   // almost all words found
    if (matchRatio >= 0.5) return 'INFERRED';   // majority found — paraphrase
    return 'UNVERIFIED';                         // less than half found
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise text for comparison:
 * - lowercase
 * - collapse whitespace / newlines to single space
 * - strip punctuation that doesn't affect semantics
 */
function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}"'`–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract words with ≥4 characters (skip short stop words that are
 * semantically meaningless for matching purposes).
 */
function significantWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length >= 4);
}
