import { Injectable } from '@nestjs/common';

export interface ParsedPeriod {
  start: string; // "YYYY-MM" or "YYYY"
  end: string; // "YYYY-MM" or "YYYY" or "present"
  months: number; // deterministic duration
  uncertain: boolean; // true when dates were estimated or partial
}

export interface ExperienceDurationResult {
  totalRelevantMonths: number;
  uncertain: boolean;
  periods: ParsedPeriod[];
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Month name maps
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  sept: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Tokens that indicate "current / ongoing" employment */
const PRESENT_TOKENS = new Set([
  'present',
  'current',
  'now',
  'ongoing',
  'till date',
  'to date',
  'till now',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Date parsing
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedDate {
  year: number;
  month: number; // 1-based
  uncertain: boolean;
}

/**
 * Parse a single date token such as:
 *   "Jan 2021", "2021-01", "2021", "January 2021", "01/2021", "2021/01"
 * Returns null when parsing fails.
 */
function parseSingleDate(token: string): ParsedDate | null {
  const t = token.trim().toLowerCase();

  // "YYYY-MM" or "YYYY/MM"
  const isoMatch = t.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    if (year >= 1950 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month, uncertain: false };
    }
  }

  // "MM/YYYY" or "MM-YYYY"
  const mmYyyy = t.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (mmYyyy) {
    const month = parseInt(mmYyyy[1], 10);
    const year = parseInt(mmYyyy[2], 10);
    if (year >= 1950 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month, uncertain: false };
    }
  }

  // "Jan 2021" or "January 2021" or "Jan, 2021"
  const monthNameMatch = t.match(/^([a-z]+)[\s,]+(\d{4})$/);
  if (monthNameMatch) {
    const monthNum = MONTH_NAME_MAP[monthNameMatch[1]];
    const year = parseInt(monthNameMatch[2], 10);
    if (monthNum && year >= 1950 && year <= 2100) {
      return { year, month: monthNum, uncertain: false };
    }
  }

  // "2021 Jan" or "2021 January"
  const yearMonthNameMatch = t.match(/^(\d{4})[\s,]+([a-z]+)$/);
  if (yearMonthNameMatch) {
    const year = parseInt(yearMonthNameMatch[1], 10);
    const monthNum = MONTH_NAME_MAP[yearMonthNameMatch[2]];
    if (year >= 1950 && year <= 2100 && monthNum) {
      return { year, month: monthNum, uncertain: false };
    }
  }

  // Bare year "2021" — treat as January (start) or December (end) depending
  // on context; caller must decide. Mark uncertain.
  const bareYear = t.match(/^(\d{4})$/);
  if (bareYear) {
    const year = parseInt(bareYear[1], 10);
    if (year >= 1950 && year <= 2100) {
      return { year, month: 1, uncertain: true };
    }
  }

  return null;
}

/**
 * Convert a ParsedDate to a fractional year+month offset for duration maths.
 * Returns months since year 0 (for subtraction).
 */
function toMonthOffset(d: ParsedDate): number {
  return d.year * 12 + (d.month - 1);
}

/**
 * Normalise a date to "YYYY-MM" string for display.
 */
function toDisplayDate(d: ParsedDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Range extraction from resume text
// ─────────────────────────────────────────────────────────────────────────────

// Date tokens: "Jan 2021", "2021-06", "06/2021", "2021/06", or bare "2021"
const MONTH_NAME =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const DATE_TOKEN =
  `(?:(?:${MONTH_NAME})[\\s,]+\\d{4}` + // Jan 2021 / January 2021
  `|\\d{4}-\\d{1,2}` + // 2021-06
  `|\\d{4}\\/\\d{1,2}` + // 2021/06
  `|\\d{1,2}\\/\\d{4}` + // 06/2021
  `|\\d{4})`; // 2021

// Regex to find date range patterns in resume text. Supports:
//   "Jan 2021 – Jun 2024", "January 2021 - Present", "2021-01 – 2024-06",
//   "03/2021 – 06/2024", "2021 – 2024", "2021 to Present"
// Group 1 = start token, group 2 = end token (or "present").
const RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN})\\s*(?:[-–—]|to)\\s*(present|current|now|ongoing|till\\s+date|to\\s+date|till\\s+now|${DATE_TOKEN})`,
  'gi',
);

// ─────────────────────────────────────────────────────────────────────────────
// Public service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ExperienceDurationService {
  /**
   * Extract and calculate total experience months from raw resume text.
   *
   * Approach:
   * 1. Find all date range patterns in the text using RANGE_PATTERN.
   * 2. Parse start/end dates for each range.
   * 3. Sum months without double-counting overlapping periods.
   * 4. Mark result as uncertain when any date required estimation.
   *
   * This is used to provide deterministic duration context to the BackendScoringService.
   * The Qwen model is shown the result but does not perform date arithmetic itself.
   */
  calculateFromResumeText(resumeText: string): ExperienceDurationResult {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based

    const periods: ParsedPeriod[] = [];
    let uncertain = false;

    for (const match of resumeText.matchAll(RANGE_PATTERN)) {
      const startToken = match[1];
      const endToken = match[2];
      if (!startToken || !endToken) continue;

      const startDate = parseSingleDate(startToken);
      if (!startDate) continue;

      let endDate: ParsedDate;
      const endLower = endToken.trim().toLowerCase();
      const isPresent = PRESENT_TOKENS.has(endLower);

      if (isPresent) {
        endDate = { year: currentYear, month: currentMonth, uncertain: false };
      } else {
        const parsed = parseSingleDate(endToken);
        if (!parsed) continue;
        // Bare year for end date → assume December
        if (parsed.uncertain) {
          parsed.month = 12;
        }
        endDate = parsed;
      }

      // Bare year for start date → assume January (already done in parseSingleDate)
      if (startDate.uncertain) uncertain = true;
      if (endDate.uncertain) uncertain = true;

      const startOffset = toMonthOffset(startDate);
      const endOffset = toMonthOffset(endDate);
      const months = Math.max(0, endOffset - startOffset);

      if (months === 0) continue;

      periods.push({
        start: toDisplayDate(startDate),
        end: isPresent ? 'present' : toDisplayDate(endDate),
        months,
        uncertain: startDate.uncertain || endDate.uncertain,
      });
    }

    // Merge overlapping periods to avoid double-counting
    const merged = this.mergeOverlappingPeriods(periods, currentYear, currentMonth);

    const totalRelevantMonths = merged.reduce((sum, p) => sum + p.months, 0);

    return {
      totalRelevantMonths,
      uncertain: uncertain || merged.some((p) => p.uncertain),
      periods: merged,
      note: uncertain ? 'Some dates were estimated; duration may be approximate.' : undefined,
    };
  }

  /**
   * Check whether a candidate meets a minimum years requirement.
   * Returns 'MET', 'NOT_MET', or 'UNCERTAIN'.
   */
  meetsMinimumYears(
    result: ExperienceDurationResult,
    minimumYears: number,
  ): 'MET' | 'NOT_MET' | 'UNCERTAIN' {
    if (result.uncertain) return 'UNCERTAIN';
    const totalYears = result.totalRelevantMonths / 12;
    return totalYears >= minimumYears ? 'MET' : 'NOT_MET';
  }

  /**
   * Merge overlapping date ranges to avoid double-counting.
   * Operates on month offsets from year 0.
   */
  private mergeOverlappingPeriods(
    periods: ParsedPeriod[],
    _currentYear: number,
    _currentMonth: number,
  ): ParsedPeriod[] {
    if (periods.length === 0) return [];

    // Convert periods to [startOffset, endOffset] pairs
    const spans = periods.map((p) => {
      const start = this.parseDisplayDateOffset(p.start);
      const endStr =
        p.end === 'present' ? `${_currentYear}-${String(_currentMonth).padStart(2, '0')}` : p.end;
      const end = this.parseDisplayDateOffset(endStr);
      return { start, end, original: p };
    });

    spans.sort((a, b) => a.start - b.start);

    const merged: typeof spans = [];
    let current = spans[0];

    for (let i = 1; i < spans.length; i++) {
      const next = spans[i];
      if (next.start <= current.end) {
        // Overlapping — extend end if needed, propagate uncertainty
        current = {
          start: current.start,
          end: Math.max(current.end, next.end),
          original: {
            ...current.original,
            uncertain: current.original.uncertain || next.original.uncertain,
          },
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged.map((s) => ({
      start: s.original.start,
      end: s.original.end,
      months: Math.max(0, s.end - s.start),
      uncertain: s.original.uncertain,
    }));
  }

  private parseDisplayDateOffset(dateStr: string): number {
    const m = dateStr.match(/^(\d{4})-(\d{2})$/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 12 + parseInt(m[2], 10) - 1;
  }
}
