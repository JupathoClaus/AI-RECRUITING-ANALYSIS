import { Injectable } from '@nestjs/common';
import { AiInterviewEvidenceVerification } from '@prisma/client';

export interface VerifiableEvidence {
  quote: string;
}

export interface EvidenceSourceSegment {
  segmentIndex: number;
  textRaw?: string | null;
  textNormalized?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export interface EvidenceCheck {
  quote: string;
  verification: AiInterviewEvidenceVerification;
  excerpt: string | null;
  transcriptId: string | null;
  segmentIndexes: number[];
  startSeconds: number | null;
  endSeconds: number | null;
}

const MIN_WORD_LENGTH = 4;
const MAX_EXCERPT_CHARS = 600;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function significantWords(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= MIN_WORD_LENGTH);
}

function trimExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length <= MAX_EXCERPT_CHARS ? t : `${t.slice(0, MAX_EXCERPT_CHARS)}…`;
}

/**
 * Grounds AI-quoted evidence in the candidate's own transcript segments.
 *
 * Each check is resolved against the real transcript (never the model's word):
 * - VERBATIM  — the quote appears verbatim in the candidate's turns, possibly
 *   spanning several adjacent segments; the excerpt and segment indexes are
 *   extracted from those exact turns.
 * - SUPPORTED — close paraphrase found in a single candidate turn (≥80%
 *   significant-word overlap); the excerpt is that turn.
 * - INFERRED  — partial overlap (≥50%).
 * - UNVERIFIED — no supporting turn; treated as fabricated evidence.
 * The same semantics as the screening/assessment evidence verifiers, but over
 * per-interview transcript segments so evidence stays first-class and
 * deep-linkable.
 */
@Injectable()
export class AiInterviewEvidenceService {
  verifyAgainstSegments(
    evidence: VerifiableEvidence[],
    segments: EvidenceSourceSegment[],
    transcriptId: string | null,
  ): EvidenceCheck[] {
    return evidence.map((e) => this.verifyOne(e.quote, segments, transcriptId));
  }

  hasFabricatedEvidence(checks: EvidenceCheck[]): boolean {
    return checks.some((c) => c.verification === 'UNVERIFIED');
  }

  private verifyOne(
    quote: string,
    segments: EvidenceSourceSegment[],
    transcriptId: string | null,
  ): EvidenceCheck {
    const q = normalize(quote);
    if (!q) return emptyCheck(quote, 'INFERRED', transcriptId);
    if (segments.length === 0) return emptyCheck(quote, 'UNVERIFIED', transcriptId);

    const verbatim = this.locateVerbatim(quote, q, segments, transcriptId);
    if (verbatim) return verbatim;

    return this.locateByOverlap(quote, q, segments, transcriptId);
  }

  private locateVerbatim(
    quote: string,
    q: string,
    segments: EvidenceSourceSegment[],
    transcriptId: string | null,
  ): EvidenceCheck | null {
    const parts: { index: number; start: number; len: number }[] = [];
    let concat = '';
    for (const s of segments) {
      const t = normalize(s.textNormalized ?? '');
      if (!t) continue;
      parts.push({ index: s.segmentIndex, start: concat.length, len: t.length });
      concat = concat.length === 0 ? t : `${concat} ${t}`;
    }
    const at = concat.indexOf(q);
    if (at < 0) return null;

    const end = at + q.length;
    const covered = parts.filter((p) => {
      const pStart = p.start;
      const pEnd = p.start + p.len;
      return pEnd > at && pStart < end;
    });
    if (covered.length === 0) return null;

    const indexes = covered.map((p) => p.index);
    const touched = segments.filter((s) => indexes.includes(s.segmentIndex));
    const excerpt = trimExcerpt(
      touched
        .filter((s) => s.textRaw)
        .map((s) => s.textRaw as string)
        .join(' '),
    );
    const starts = touched.map((s) => s.startSeconds).filter((v): v is number => v != null);
    const ends = touched.map((s) => s.endSeconds).filter((v): v is number => v != null);
    return {
      quote,
      verification: 'VERBATIM',
      excerpt,
      transcriptId,
      segmentIndexes: indexes,
      startSeconds: starts.length ? Math.min(...starts) : null,
      endSeconds: ends.length ? Math.max(...ends) : null,
    };
  }

  private locateByOverlap(
    quote: string,
    q: string,
    segments: EvidenceSourceSegment[],
    transcriptId: string | null,
  ): EvidenceCheck {
    const quoteWords = significantWords(q);
    if (quoteWords.length === 0) return emptyCheck(quote, 'INFERRED', transcriptId);

    let best: { index: number; ratio: number; segment: EvidenceSourceSegment } | null = null;
    for (const s of segments) {
      const t = normalize(s.textNormalized ?? '');
      if (!t) continue;
      const set = new Set(significantWords(t));
      if (set.size === 0) continue;
      let overlap = 0;
      for (const w of quoteWords) if (set.has(w)) overlap++;
      const ratio = overlap / quoteWords.length;
      if (!best || ratio > best.ratio) best = { index: s.segmentIndex, ratio, segment: s };
    }

    if (!best) return emptyCheck(quote, 'UNVERIFIED', transcriptId);
    const verification: AiInterviewEvidenceVerification =
      best.ratio >= 0.8 ? 'SUPPORTED' : best.ratio >= 0.5 ? 'INFERRED' : 'UNVERIFIED';
    if (verification === 'UNVERIFIED') return emptyCheck(quote, 'UNVERIFIED', transcriptId);

    return {
      quote,
      verification,
      excerpt: trimExcerpt(best.segment.textRaw),
      transcriptId,
      segmentIndexes: [best.index],
      startSeconds: best.segment.startSeconds ?? null,
      endSeconds: best.segment.endSeconds ?? null,
    };
  }
}

function emptyCheck(
  quote: string,
  verification: AiInterviewEvidenceVerification,
  transcriptId: string | null,
): EvidenceCheck {
  return {
    quote,
    verification,
    excerpt: null,
    transcriptId,
    segmentIndexes: [],
    startSeconds: null,
    endSeconds: null,
  };
}
