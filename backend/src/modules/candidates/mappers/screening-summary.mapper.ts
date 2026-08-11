// Latest-result semantics for candidate screening summaries.
//
// Rules (documented contract):
// - The LATEST COMPLETED result (by createdAt) supplies overallScore,
//   recommendation, confidence, resultId and completedAt.
// - `status` always reflects the NEWEST result overall (any status), so a
//   newer PENDING/RUNNING rerun is represented separately while the previous
//   valid score remains visible.
// - `pendingRerun` is true when a result NEWER than the latest COMPLETED one
//   exists in PENDING/RUNNING. `failedRerun` is true when a newer result is
//   FAILED. A newer FAILED/PENDING run never erases a previous valid score.
// - overallScore is nullable: `null` means never screened (or a completed
//   run produced no score); `0` is a real score and is preserved as-is.

export interface CandidateScreeningSummary {
  status: string | null;
  overallScore: number | null;
  recommendation: string | null;
  confidence: string | null;
  resultId: string | null;
  completedAt: string | null;
  pendingRerun: boolean;
  failedRerun: boolean;
}

export function buildScreeningSummaryMap(
  results: {
    id: string;
    candidateId: string;
    status: string;
    overallScore: number | null;
    recommendation: string | null;
    confidence: string | null;
    completedAt: Date | null;
    createdAt: Date;
  }[],
): Map<string, CandidateScreeningSummary> {
  const map = new Map<string, CandidateScreeningSummary>();

  // Results arrive newest-first (createdAt desc). For each candidate the
  // first row seen is the newest overall; the first COMPLETED row seen is
  // the latest completed result. Every row after that COMPLETED anchor is
  // older and irrelevant.
  for (const r of results) {
    const current = map.get(r.candidateId);
    if (!current) {
      // Newest result for this candidate: it anchors `status`. A non-completed
      // newest result also marks the rerun flag because any completed score
      // found later is necessarily older than it.
      map.set(r.candidateId, {
        status: r.status,
        overallScore: null,
        recommendation: null,
        confidence: null,
        resultId: null,
        completedAt: null,
        pendingRerun: r.status === 'PENDING' || r.status === 'RUNNING',
        failedRerun: r.status === 'FAILED',
      });
      if (r.status === 'COMPLETED') {
        const entry = map.get(r.candidateId)!;
        entry.overallScore = r.overallScore;
        entry.recommendation = r.recommendation;
        entry.confidence = r.confidence;
        entry.resultId = r.id;
        entry.completedAt = r.completedAt ? r.completedAt.toISOString() : null;
      }
      continue;
    }

    // The latest COMPLETED anchor was already found; anything older is
    // ignored so pending/failed rerun flags only cover rows NEWER than it.
    if (current.resultId !== null) continue;

    if (r.status === 'COMPLETED') {
      current.overallScore = r.overallScore;
      current.recommendation = r.recommendation;
      current.confidence = r.confidence;
      current.resultId = r.id;
      current.completedAt = r.completedAt ? r.completedAt.toISOString() : null;
      continue;
    }

    if (r.status === 'PENDING' || r.status === 'RUNNING') current.pendingRerun = true;
    else if (r.status === 'FAILED') current.failedRerun = true;
  }

  return map;
}
