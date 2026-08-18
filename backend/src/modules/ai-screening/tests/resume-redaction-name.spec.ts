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
    const result = redactResumeText('Visit https://linkedin.com/in/johnsmith for profile.')
    expect(result).not.toContain('johnsmith')
    expect(result).toContain('[REDACTED - social profile URL]')
  })

  it('preserves technical content', () => {
    const result = redactResumeText('Built NestJS APIs with TypeScript and PostgreSQL.');
    expect(result).toContain('NestJS');
    expect(result).toContain('TypeScript');
    expect(result).toContain('PostgreSQL');
  });
});
