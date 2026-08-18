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
 * Strategy: build word-boundary regexes from first name and last name separately
 * and replace each occurrence with [REDACTED - name].
 *
 * Only names longer than 1 character are redacted to avoid single-letter false
 * positives (e.g. "A" or "I"). Case-insensitive.
 *
 * This is applied in addition to redactResumeText(), not instead of it.
 */
export function redactCandidateName(
  text: string,
  firstName: string,
  lastName: string,
): string {
  let result = text;

  const parts = [firstName.trim(), lastName.trim()].filter((p) => p.length > 1);

  for (const part of parts) {
    // Escape special regex characters in the name part
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(pattern, '[REDACTED - name]');
  }

  return result;
}
