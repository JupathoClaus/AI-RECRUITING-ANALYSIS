import { Injectable } from '@nestjs/common';
import { CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';

export type VerificationStatus = 'VERBATIM' | 'SUPPORTED' | 'INFERRED' | 'UNVERIFIED';

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
 * 1. VERBATIM: normalised quote is a direct substring of the normalised resume.
 * 2. SUPPORTED: ≥80% of significant words (≥4 chars) appear in the resume —
 *    a close paraphrase. NOT treated as a verbatim quote.
 * 3. INFERRED: 50–79% of significant words appear in the resume — a loose
 *    paraphrase or partial overlap.
 * 4. UNVERIFIED: less than half of the significant words found, or the quote
 *    contains fabricated claims.
 *
 * Only UNVERIFIED marks evidence as unverified. SUPPORTED/INFERRED are
 * paraphrases and are never displayed as exact quotes by the UI.
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
  verifyEvaluations(evaluations: CriterionEvaluation[], resumeText: string): CriterionEvaluation[] {
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
        evidence: verifiedEvidence,
        evidenceUnverified: hasUnverifiedResume,
        confidence,
      };
    });
  }

  /**
   * Verify a single evidence item against normalised resume text.
   * Returns VERBATIM, SUPPORTED, INFERRED, or UNVERIFIED.
   */
  verify(sourceText: string, sourceCategory: string, normalisedResume: string): VerificationStatus {
    // Non-resume sources don't need verification
    if (sourceCategory !== 'RESUME') return 'VERBATIM';

    const text = sourceText.trim();

    // Empty text → model withheld the quote; not a hallucination, just absent
    if (text.length === 0) return 'INFERRED';

    const normText = normaliseText(text);

    // 1. Verbatim (normalised) substring match — the resume actually contains
    //    this exact quote.
    if (normalisedResume.includes(normText)) return 'VERBATIM';

    // 2. Overlap-based paraphrase detection. A high overlap is NOT treated as
    //    a verbatim quote — the claim's framing (e.g. "Led" vs "Assisted") may
    //    still be fabricated.
    const words = significantWords(normText);
    if (words.length === 0) return 'INFERRED'; // too short to verify

    const matchCount = words.filter((w) => normalisedResume.includes(w)).length;
    const matchRatio = matchCount / words.length;

    if (matchRatio >= 0.8) return 'SUPPORTED'; // close paraphrase — vocabulary mostly present
    if (matchRatio >= 0.5) return 'INFERRED'; // loose paraphrase — majority of words present
    return 'UNVERIFIED'; // less than half of the claim's words appear in the resume
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
