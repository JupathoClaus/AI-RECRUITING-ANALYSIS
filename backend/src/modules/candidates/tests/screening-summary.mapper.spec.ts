import { buildScreeningSummaryMap } from '../mappers/screening-summary.mapper';

interface ResultInput {
  id: string;
  candidateId: string;
  status: string;
  overallScore: number | null;
  recommendation: string | null;
  confidence: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

function result(
  id: string,
  candidateId: string,
  status: string,
  overallScore: number | null,
  hoursAgo: number,
  extra: Partial<ResultInput> = {},
): ResultInput {
  return {
    id,
    candidateId,
    status,
    overallScore,
    recommendation: overallScore === null ? null : 'SHORTLIST',
    confidence: overallScore === null ? null : 'HIGH',
    completedAt: status === 'COMPLETED' ? new Date(Date.now() - hoursAgo * 3600000) : null,
    createdAt: new Date(Date.now() - hoursAgo * 3600000),
    ...extra,
  };
}

describe('buildScreeningSummaryMap', () => {
  it('returns empty map for no results', () => {
    const map = buildScreeningSummaryMap([]);
    expect(map.size).toBe(0);
  });

  it('returns null score when the candidate was never screened', () => {
    const map = buildScreeningSummaryMap([result('r1', 'c1', 'PENDING', null, 1)]);
    expect(map.get('c1')).toEqual({
      status: 'PENDING',
      overallScore: null,
      recommendation: null,
      confidence: null,
      resultId: null,
      completedAt: null,
      pendingRerun: true,
      failedRerun: false,
    });
  });

  it('returns a null summary equivalent for a candidate with no results at all', () => {
    const map = buildScreeningSummaryMap([]);
    expect(map.get('never-screened')).toBeUndefined();
  });

  it('preserves a real score of 0 as distinct from null', () => {
    const map = buildScreeningSummaryMap([result('r1', 'c1', 'COMPLETED', 0, 1)]);
    expect(map.get('c1')!.overallScore).toBe(0);
    expect(map.get('c1')!.resultId).toBe('r1');
  });

  it('uses the latest COMPLETED result as the score source', () => {
    const map = buildScreeningSummaryMap([
      result('r2', 'c1', 'COMPLETED', 88, 2),
      result('r1', 'c1', 'COMPLETED', 55, 10),
    ]);
    expect(map.get('c1')).toEqual({
      status: 'COMPLETED',
      overallScore: 88,
      recommendation: 'SHORTLIST',
      confidence: 'HIGH',
      resultId: 'r2',
      completedAt: expect.any(String),
      pendingRerun: false,
      failedRerun: false,
    });
  });

  it('keeps the valid score when a newer PENDING rerun exists', () => {
    const map = buildScreeningSummaryMap([
      result('r2', 'c1', 'PENDING', null, 1),
      result('r1', 'c1', 'COMPLETED', 77, 10),
    ]);
    const s = map.get('c1')!;
    expect(s.overallScore).toBe(77);
    expect(s.resultId).toBe('r1');
    expect(s.status).toBe('PENDING');
    expect(s.pendingRerun).toBe(true);
    expect(s.failedRerun).toBe(false);
  });

  it('keeps the valid score when a newer FAILED rerun exists', () => {
    const map = buildScreeningSummaryMap([
      result('r2', 'c1', 'FAILED', null, 1),
      result('r1', 'c1', 'COMPLETED', 66, 10),
    ]);
    const s = map.get('c1')!;
    expect(s.overallScore).toBe(66);
    expect(s.resultId).toBe('r1');
    expect(s.status).toBe('FAILED');
    expect(s.pendingRerun).toBe(false);
    expect(s.failedRerun).toBe(true);
  });

  it('does not overwrite a valid score with an older COMPLETED result', () => {
    const map = buildScreeningSummaryMap([
      result('r2', 'c1', 'COMPLETED', 84, 10),
      result('r1', 'c1', 'COMPLETED', 91, 20),
    ]);
    expect(map.get('c1')!.overallScore).toBe(84);
    expect(map.get('c1')!.resultId).toBe('r2');
  });

  it('returns null score when only FAILED/PENDING results exist', () => {
    const map = buildScreeningSummaryMap([
      result('r2', 'c1', 'PENDING', null, 1),
      result('r1', 'c1', 'FAILED', null, 5),
    ]);
    const s = map.get('c1')!;
    expect(s.overallScore).toBeNull();
    expect(s.resultId).toBeNull();
    expect(s.status).toBe('PENDING');
  });

  it('groups multiple candidates independently', () => {
    const map = buildScreeningSummaryMap([
      result('r3', 'c2', 'PENDING', null, 1),
      result('r2', 'c2', 'COMPLETED', 50, 4),
      result('r1', 'c1', 'COMPLETED', 80, 5),
    ]);
    expect(map.get('c1')!.overallScore).toBe(80);
    expect(map.get('c2')!.overallScore).toBe(50);
    expect(map.get('c2')!.pendingRerun).toBe(true);
  });
});
