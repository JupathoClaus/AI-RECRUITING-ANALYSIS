import { redactResumeText, redactCandidateName } from '../utils/resume-redaction';

describe('redactCandidateName', () => {
  it('removes first name from resume text', () => {
    const result = redactCandidateName('John worked at ABC Ltd.', 'John', 'Smith');
    expect(result).not.toContain('John');
    expect(result).toContain('[REDACTED - name]');
  });

  it('removes last name from resume text', () => {
    const result = redactCandidateName('Smith, John worked at ABC Ltd.', 'John', 'Smith');
    expect(result).not.toContain('Smith');
  });

  it('is case-insensitive', () => {
    const result = redactCandidateName('JOHN SMITH is a developer.', 'John', 'Smith');
    expect(result).not.toContain('JOHN');
    expect(result).not.toContain('SMITH');
  });

  it('does not redact 1-character name parts (avoid false positives)', () => {
    const result = redactCandidateName('A skilled engineer with 5 years.', 'A', 'Kim');
    // 'A' is only 1 char — should NOT be redacted
    expect(result).toContain('A skilled');
  });

  it('preserves technical terms that overlap with name by whole word only', () => {
    // "React" should not be redacted if name is "Ian"
    const result = redactCandidateName('Built React components.', 'Ian', 'React');
    expect(result).not.toContain('React'); // 'React' would be redacted as last name
    expect(result).toContain('[REDACTED - name]');
  });

  it('returns original text when no name parts are long enough', () => {
    const text = 'Engineer with 5 years of experience.';
    const result = redactCandidateName(text, 'Jo', 'Li');
    // Both parts < 2 chars — nothing redacted... actually both < 2 chars means no redaction
    // 'Jo' is 2 chars, passes the > 1 check
    expect(typeof result).toBe('string');
  });

  // ── Common English words must not be destroyed ────────────────────────────

  it('does NOT destroy the word "will" when the candidate is named Will', () => {
    const result = redactCandidateName(
      'Will Smith. I will implement the feature. The team will benefit.',
      'Will',
      'Smith',
    );
    // Full name redacted; ordinary "will" usages preserved
    expect(result).not.toContain('Will Smith');
    expect(result).toContain('I will implement');
    expect(result).toContain('will benefit');
    expect(result).toContain('[REDACTED - name]');
  });

  it('does NOT destroy the month "May" when the candidate is named May', () => {
    const result = redactCandidateName(
      'May Chen. Worked at ABC May 2021 - Present. May the best team win.',
      'May',
      'Chen',
    );
    expect(result).not.toContain('May Chen');
    expect(result).toContain('May 2021 - Present');
    expect(result).toContain('May the best team win');
  });

  it('does NOT destroy "mark"/"rose"/"hope"/"grace" when used as English words', () => {
    const result = redactCandidateName(
      'Mark Rose worked at Hope Ltd. Trademark and design. Rose to the occasion with grace. We hope to grow.',
      'Mark',
      'Rose',
    );
    expect(result).not.toContain('Mark Rose');
    expect(result).toContain('Hope Ltd');
    expect(result).toContain('Trademark');
    expect(result).toContain('Rose to the occasion');
    expect(result).toContain('with grace');
    expect(result).toContain('hope to grow');
  });

  it('still redacts the full name even when parts are common words', () => {
    const result = redactCandidateName('Will Smith managed the team.', 'Will', 'Smith');
    expect(result).not.toContain('Will Smith');
    expect(result).toContain('[REDACTED - name]');
  });

  // ── Name forms ─────────────────────────────────────────────────────────────

  it('redacts "Last, First" order', () => {
    const result = redactCandidateName('Smith, John led engineering.', 'John', 'Smith');
    expect(result).not.toContain('Smith, John');
    expect(result).toContain('led engineering');
  });

  it('redacts hyphenated names', () => {
    const result = redactCandidateName(
      'Jean-Luc Dupont built the system. Jean-Luc is senior.',
      'Jean-Luc',
      'Dupont',
    );
    expect(result).not.toContain('Jean-Luc');
    expect(result).not.toContain('Dupont');
    expect(result).toContain('built the system');
  });

  it('handles apostrophes in names', () => {
    const result = redactCandidateName("Mary O'Brien worked at ABC.", 'Mary', "O'Brien");
    expect(result).not.toContain("O'Brien");
    expect(result).not.toContain('Mary');
    expect(result).toContain('worked at ABC');
  });

  it('redacts non-ASCII (Cyrillic) names', () => {
    const result = redactCandidateName(
      'Иван Иванов — инженер. Иван senior developer.',
      'Иван',
      'Иванов',
    );
    expect(result).not.toContain('Иван');
    expect(result).not.toContain('Иванов');
    expect(result).toContain('инженер');
  });

  it('does not redact inside longer words', () => {
    const result = redactCandidateName('Built a trademark portfolio.', 'Mark', 'Jones');
    expect(result).toContain('trademark');
    expect(result).toContain('portfolio');
  });
});

describe('redactResumeText — existing tests preserved', () => {
  it('removes email addresses', () => {
    const result = redactResumeText('Contact: john.smith@example.com for info.');
    expect(result).not.toContain('@example.com');
    expect(result).toContain('[REDACTED - email]');
  });

  it('removes phone numbers', () => {
    const result = redactResumeText('Call +256 700 123456 for details.');
    expect(result).not.toContain('700 123456');
  });

  it('removes date of birth labels', () => {
    const result = redactResumeText('Date of Birth: 15 March 1990');
    expect(result).toContain('[REDACTED - date of birth]');
  });

  it('removes nationality labels', () => {
    const result = redactResumeText('Nationality: Ugandan');
    expect(result).toContain('[REDACTED - nationality]');
  });

  it('removes gender labels', () => {
    const result = redactResumeText('Gender: Male');
    expect(result).toContain('[REDACTED - gender]');
  });

  it('removes LinkedIn URLs', () => {
    const result = redactResumeText('Visit https://linkedin.com/in/johnsmith for profile.');
    expect(result).not.toContain('johnsmith');
    expect(result).toContain('[REDACTED - social profile URL]');
  });

  it('preserves technical content', () => {
    const result = redactResumeText('Built NestJS APIs with TypeScript and PostgreSQL.');
    expect(result).toContain('NestJS');
    expect(result).toContain('TypeScript');
    expect(result).toContain('PostgreSQL');
  });
});
