import { ExperienceDurationService } from '../services/experience-duration.service';

describe('ExperienceDurationService', () => {
  let svc: ExperienceDurationService;
  beforeEach(() => {
    svc = new ExperienceDurationService();
  });

  describe('calculateFromResumeText', () => {
    it('parses "Jan 2021 – Jun 2024"', () => {
      const result = svc.calculateFromResumeText('Software Engineer, ABC Ltd\nJan 2021 – Jun 2024');
      expect(result.totalRelevantMonths).toBe(41);
      expect(result.uncertain).toBe(false);
    });

    it('parses "January 2021 - Present" as an ongoing role', () => {
      const result = svc.calculateFromResumeText('January 2021 - Present, Engineer');
      const now = new Date();
      const expectedMonths = now.getFullYear() * 12 + now.getMonth() - (2021 * 12 + 0);
      expect(result.totalRelevantMonths).toBe(expectedMonths);
      expect(result.uncertain).toBe(false);
    });

    it('parses "2021-01 – 2024-06" (ISO month format)', () => {
      const result = svc.calculateFromResumeText('2021-01 – 2024-06, Backend Engineer');
      expect(result.totalRelevantMonths).toBe(41);
      expect(result.uncertain).toBe(false);
    });

    it('parses "03/2021 – 06/2024" (month/year format)', () => {
      const result = svc.calculateFromResumeText('03/2021 – 06/2024, Backend Engineer');
      expect(result.totalRelevantMonths).toBe(39);
      expect(result.uncertain).toBe(false);
    });

    it('parses bare-year "2021 – 2024" and marks the estimate uncertain', () => {
      const result = svc.calculateFromResumeText('2021 – 2024, Engineer');
      expect(result.totalRelevantMonths).toBe(47); // Jan 2021 – Dec 2024
      expect(result.uncertain).toBe(true);
    });

    it('parses "2021 to Present"', () => {
      const result = svc.calculateFromResumeText('Engineer\n2021 to Present');
      expect(result.totalRelevantMonths).toBeGreaterThan(0);
      expect(result.periods[0].end).toBe('present');
    });

    it('does not double-count overlapping periods', () => {
      // Job A: Jan 2020 – Dec 2022 (36 months)
      // Job B: Jun 2021 – Jun 2023 (24 months)
      // Unique span: Jan 2020 – Jun 2023 = 41 months
      const result = svc.calculateFromResumeText(
        ['Job A: Jan 2020 – Dec 2022', 'Job B: Jun 2021 – Jun 2023'].join('\n'),
      );
      expect(result.totalRelevantMonths).toBe(41);
      expect(result.periods.length).toBe(1); // merged
    });

    it('sums non-overlapping periods', () => {
      const result = svc.calculateFromResumeText(
        ['Job A: Jan 2019 – Dec 2020', 'Job B: Jan 2022 – Dec 2023'].join('\n'),
      );
      expect(result.totalRelevantMonths).toBe(46); // 23 + 23
    });

    it('ignores malformed ranges', () => {
      const result = svc.calculateFromResumeText('Some text without dates. 99 – 01.');
      expect(result.totalRelevantMonths).toBe(0);
      expect(result.periods.length).toBe(0);
    });

    it('returns zero months when no ranges are found', () => {
      const result = svc.calculateFromResumeText('Just a plain resume without dates');
      expect(result.totalRelevantMonths).toBe(0);
    });

    it('handles contract/freelance entries with parseable ranges', () => {
      const result = svc.calculateFromResumeText(
        ['Freelance contractor, Mar 2021 – Nov 2021', 'Consultant, Jan 2023 – Aug 2023'].join('\n'),
      );
      expect(result.totalRelevantMonths).toBe(8 + 7);
      expect(result.uncertain).toBe(false);
    });
  });

  describe('meetsMinimumYears', () => {
    it('returns MET when duration covers the minimum', () => {
      const result = svc.calculateFromResumeText('Jan 2019 – Dec 2024');
      expect(svc.meetsMinimumYears(result, 5)).toBe('MET');
    });

    it('returns NOT_MET when duration is below the minimum', () => {
      const result = svc.calculateFromResumeText('Jan 2023 – Dec 2024');
      expect(svc.meetsMinimumYears(result, 5)).toBe('NOT_MET');
    });

    it('returns UNCERTAIN when dates were estimated', () => {
      const result = svc.calculateFromResumeText('2021 – 2024');
      expect(result.uncertain).toBe(true);
      expect(svc.meetsMinimumYears(result, 2)).toBe('UNCERTAIN');
    });
  });
});
