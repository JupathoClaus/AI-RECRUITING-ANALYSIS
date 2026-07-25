import { calculateTimeToHire } from '../services/time-to-hire';

describe('calculateTimeToHire', () => {
  function t(dateStr: string): Date { return new Date(dateStr); }

  it('0 hours → 0 / 0', () => {
    const d = t('2026-07-24T10:00:00Z');
    const r = calculateTimeToHire(d, d);
    expect(r.durationHours).toBe(0);
    expect(r.daysToHire).toBe(0);
  });

  it('6 hours', () => {
    const r = calculateTimeToHire(t('2026-07-24T08:00:00Z'), t('2026-07-24T14:00:00Z'));
    expect(r.durationHours).toBe(6);
    expect(r.daysToHire).toBe(0.25);
  });

  it('23.5 hours', () => {
    const r = calculateTimeToHire(t('2026-07-24T08:00:00Z'), t('2026-07-25T07:30:00Z'));
    expect(r.durationHours).toBe(23.5);
    expect(r.daysToHire).toBe(0.98);
  });

  it('24 hours', () => {
    const r = calculateTimeToHire(t('2026-07-24T08:00:00Z'), t('2026-07-25T08:00:00Z'));
    expect(r.durationHours).toBe(24);
    expect(r.daysToHire).toBe(1);
  });

  it('36 hours', () => {
    const r = calculateTimeToHire(t('2026-07-24T00:00:00Z'), t('2026-07-25T12:00:00Z'));
    expect(r.durationHours).toBe(36);
    expect(r.daysToHire).toBe(1.5);
  });

  it('72.25 hours → rounded to 72.25 / 3.01', () => {
    const r = calculateTimeToHire(t('2026-07-24T00:00:00Z'), t('2026-07-27T00:15:00Z'));
    expect(r.durationHours).toBe(72.25);
    expect(r.daysToHire).toBe(3.01);
  });

  it('negative interval → null/null', () => {
    const r = calculateTimeToHire(t('2026-07-25T00:00:00Z'), t('2026-07-24T00:00:00Z'));
    expect(r.durationHours).toBeNull();
    expect(r.daysToHire).toBeNull();
  });

  it('missing submittedAt → null/null', () => {
    const r = calculateTimeToHire(null, t('2026-07-25T00:00:00Z'));
    expect(r.durationHours).toBeNull();
    expect(r.daysToHire).toBeNull();
  });

  it('missing hiredAt → null/null', () => {
    const r = calculateTimeToHire(t('2026-07-24T00:00:00Z'), null);
    expect(r.durationHours).toBeNull();
    expect(r.daysToHire).toBeNull();
  });
});
