import { isValidDateOnly } from '../is-date-only.decorator';

describe('isValidDateOnly', () => {
  const accept: [string, string][] = [
    ['2024-02-29', 'leap year'],
    ['2026-01-31', 'month end Jan'],
    ['2026-04-30', 'month end Apr'],
    ['2026-12-31', 'year end'],
  ];
  for (const [date, label] of accept) {
    it(`accepts ${label}: ${date}`, () => {
      expect(isValidDateOnly(date)).toBe(true);
    });
  }

  const reject: [string, string][] = [
    ['2025-02-29', 'invalid leap (2025)'],
    ['2026-02-30', 'Feb 30'],
    ['2026-04-31', 'Apr 31'],
    ['2026-00-10', 'month 0'],
    ['2026-13-10', 'month 13'],
    ['2026-01-00', 'day 0'],
    ['2026-1-01', 'single digit month'],
    ['26-01-01', 'short year'],
    ['2026-07-24T00:00:00Z', 'ISO timestamp'],
    ['2026-07-24T00:00:00', 'timestamp without Z'],
    [' 2026-07-24', 'leading space'],
    ['2026-07-24 ', 'trailing space'],
    ['not-a-date', 'garbage'],
    ['', 'empty string'],
  ];
  for (const [date, label] of reject) {
    it(`rejects ${label}: ${date}`, () => {
      expect(isValidDateOnly(date)).toBe(false);
    });
  }

  it('rejects non-string types', () => {
    expect(isValidDateOnly(42)).toBe(false);
    expect(isValidDateOnly(null)).toBe(false);
    expect(isValidDateOnly(undefined)).toBe(false);
  });
});
