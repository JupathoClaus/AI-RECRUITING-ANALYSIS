const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const PHONE_REGEX = /\b(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{3,5}\b/g;

const DOB_LABEL_REGEX = /^(date\s*of\s*birth|dob|birth\s*date|born)\s*[::\-]?\s*.+/gim;

const GENDER_LABEL_REGEX = /^(gender|sex)\s*[::\-]?\s*.+/gim;

const MARITAL_LABEL_REGEX = /^(marital\s*status|marital\s*condition)\s*[::\-]?\s*.+/gim;

const NATIONALITY_LABEL_REGEX = /^(nationality|citizenship)\s*[::\-]?\s*.+/gim;

const SOCIAL_URL_REGEX =
  /https?:\/\/(?:www\.)?(linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com)\/[A-Za-z0-9._\/%+-]+/gi;

const ADDRESS_LABEL_REGEX =
  /^(address|residential\s*address|current\s*address|permanent\s*address|home\s*address)\s*[::\-]?\s*.+/gim;

export function redactResumeText(raw: string): string {
  let result = raw;

  result = result.replace(DOB_LABEL_REGEX, '[REDACTED - date of birth]');
  result = result.replace(GENDER_LABEL_REGEX, '[REDACTED - gender]');
  result = result.replace(MARITAL_LABEL_REGEX, '[REDACTED - marital status]');
  result = result.replace(NATIONALITY_LABEL_REGEX, '[REDACTED - nationality]');
  result = result.replace(ADDRESS_LABEL_REGEX, '[REDACTED - address]');

  result = result.replace(SOCIAL_URL_REGEX, '[REDACTED - social profile URL]');

  result = result.replace(EMAIL_REGEX, '[REDACTED - email]');
  result = result.replace(PHONE_REGEX, '[REDACTED - phone]');

  return result;
}

/**
 * Redact the candidate's name from resume text before passing to the AI model.
 *
 * Strategy:
 * 1. Redact exact full-name occurrences first ("First Last", "Last, First") —
 *    these are unambiguous regardless of the words involved.
 * 2. Redact individual first/last name parts only when they are NOT common
 *    English words (e.g. "Will", "May", "Mark", "Rose", "Hope", "Grace"),
 *    otherwise the redaction destroys unrelated resume sentences
 *    ("I will...", "May 2021 – Present", "trademark").
 *
 * Boundaries are unicode-safe lookarounds (word chars = ASCII letters/digits)
 * rather than \b, so non-Latin names (e.g. Cyrillic) are still redacted.
 * Case-insensitive. Parts shorter than 2 characters are never redacted.
 *
 * This is applied in addition to redactResumeText(), not instead of it.
 */

// Names that collide with ordinary English words are only redacted as part of
// the full name. Keeping this list small avoids both over-redaction and
// leaking the candidate's name.
const COMMON_WORDS = new Set([
  'a',
  'an',
  'am',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'for',
  'from',
  'he',
  'her',
  'him',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'may',
  'me',
  'my',
  'no',
  'of',
  'on',
  'or',
  'out',
  'she',
  'so',
  'the',
  'this',
  'to',
  'up',
  'us',
  'was',
  'we',
  'will',
  'you',
  'your',
  'mark',
  'marks',
  'rose',
  'hope',
  'grace',
  'summer',
  'winter',
  'cloud',
  'light',
  'short',
  'long',
  'rich',
  'wise',
  'faith',
  'joy',
  'heaven',
  'blessing',
]);

const REDACTED = '[REDACTED - name]';

/** Unicode-safe word boundaries for a pattern: `(?<![a-z0-9])P(?![a-z0-9])`. */
function bounded(pattern: string): string {
  return `(?<![a-z0-9])${pattern}(?![a-z0-9])`;
}

function escapeRegex(part: string): string {
  return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpacing(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function redactCandidateName(text: string, firstName: string, lastName: string): string {
  let result = text;

  const first = normalizeSpacing(firstName);
  const last = normalizeSpacing(lastName);

  const fullParts: string[] = [];
  if (first.length > 1 && last.length > 1) {
    const escFirst = escapeRegex(first);
    const escLast = escapeRegex(last);
    // "First Last" and "Last, First"
    fullParts.push(`${escFirst}[\\s\\-]+${escLast}`);
    fullParts.push(`${escLast}[\\s]*,[\\s]*${escFirst}`);
  }

  // 1. Full-name redaction — unambiguous, always safe
  for (const pattern of fullParts) {
    result = result.replace(new RegExp(bounded(pattern), 'gi'), REDACTED);
  }

  // 2. Individual parts — skip ordinary English words
  const parts = [first, last].filter((p) => p.length > 1 && !COMMON_WORDS.has(p.toLowerCase()));
  for (const part of parts) {
    result = result.replace(new RegExp(bounded(escapeRegex(part)), 'gi'), REDACTED);
  }

  return result;
}
