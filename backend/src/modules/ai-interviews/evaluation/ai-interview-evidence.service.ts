import { Injectable } from '@nestjs/common';
import { AiInterviewEvidenceVerification } from '@prisma/client';

export interface VerifiableEvidence {
  quote: string;
}

export interface EvidenceCheck {
  quote: string;
  verification: AiInterviewEvidenceVerification;
}

const MIN_WORD_LENGTH = 4;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function significantWords(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= MIN_WORD_LENGTH);
}

/**
 * Grounds AI-quoted evidence in the candidate's actual transcript responses.
 * Same verification semantics as the screening/assessment evidence verifiers
 * (VERBATIM / SUPPORTED / INFERRED / UNVERIFIED); kept as a separate
 * implementation because the evidence source differs (interview transcript
 * vs resume text vs assessment response) and the other modules must not be
 * destabilized.
 */
@Injectable()
export class AiInterviewEvidenceService {
  verify(quote: string, responseText: string): AiInterviewEvidenceVerification {
    const q = normalize(quote);
    const r = normalize(responseText);
    if (!q) return 'INFERRED';
    if (!r) return 'UNVERIFIED';
    if (r.includes(q)) return 'VERBATIM';

    const quoteWords = significantWords(q);
    if (quoteWords.length === 0) return 'INFERRED';
    const responseSet = new Set(significantWords(r));
    let overlap = 0;
    for (const w of quoteWords) {
      if (responseSet.has(w)) overlap++;
    }
    const ratio = overlap / quoteWords.length;
    if (ratio >= 0.8) return 'SUPPORTED';
    if (ratio >= 0.5) return 'INFERRED';
    return 'UNVERIFIED';
  }

  verifyAll(evidence: VerifiableEvidence[], responseText: string): EvidenceCheck[] {
    return evidence.map((e) => ({
      quote: e.quote,
      verification: this.verify(e.quote, responseText),
    }));
  }

  /** Fabricated evidence on an evaluated competency fails the evaluation. */
  hasFabricatedEvidence(checks: EvidenceCheck[]): boolean {
    return checks.some((c) => c.verification === 'UNVERIFIED');
  }
}
