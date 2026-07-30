import { redactResumeText } from '../utils/resume-redaction';

describe('redactResumeText', () => {
  it('removes email addresses', () => {
    const result = redactResumeText('Contact me at john.doe@example.com for details.');
    expect(result).not.toContain('john.doe@example.com');
    expect(result).toContain('[REDACTED - email]');
  });

  it('removes phone numbers', () => {
    const result = redactResumeText('Phone: +1 (555) 123-4567');
    expect(result).not.toContain('555');
    expect(result).toContain('[REDACTED - phone]');
  });

  it('removes explicitly labelled date of birth', () => {
    const result = redactResumeText('Date of Birth: 1990-01-15');
    expect(result).not.toContain('1990-01-15');
    expect(result).toContain('[REDACTED - date of birth]');
  });

  it('removes explicitly labelled gender', () => {
    const result = redactResumeText('Gender: Male');
    expect(result).not.toContain('Male');
    expect(result).toContain('[REDACTED - gender]');
  });

  it('removes explicitly labelled marital status', () => {
    const result = redactResumeText('Marital Status: Single');
    expect(result).not.toContain('Single');
    expect(result).toContain('[REDACTED - marital status]');
  });

  it('removes explicitly labelled nationality', () => {
    const result = redactResumeText('Nationality: Canadian');
    expect(result).not.toContain('Canadian');
    expect(result).toContain('[REDACTED - nationality]');
  });

  it('removes social profile URLs', () => {
    const result = redactResumeText('LinkedIn: https://linkedin.com/in/johndoe');
    expect(result).not.toContain('linkedin.com/in/johndoe');
    expect(result).toContain('[REDACTED - social profile URL]');
  });

  it('removes explicitly labelled address', () => {
    const result = redactResumeText('Address: 123 Main St, Springfield, IL 62701');
    expect(result).not.toContain('123 Main St');
    expect(result).toContain('[REDACTED - address]');
  });

  it('preserves skills', () => {
    const result = redactResumeText('Skills: TypeScript, React, Node.js');
    expect(result).toContain('TypeScript');
    expect(result).toContain('React');
  });

  it('preserves employers and job titles', () => {
    const text = 'Worked at Acme Corp as Senior Engineer from 2020-2023';
    const result = redactResumeText(text);
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Senior Engineer');
  });

  it('preserves education', () => {
    const text = 'B.S. Computer Science, University of Technology, 2019';
    const result = redactResumeText(text);
    expect(result).toContain('Computer Science');
    expect(result).toContain('University of Technology');
  });

  it('preserves certifications', () => {
    const text = 'AWS Certified Solutions Architect, PMP Certification';
    const result = redactResumeText(text);
    expect(result).toContain('AWS Certified');
    expect(result).toContain('PMP');
  });

  it('handles empty text gracefully', () => {
    expect(redactResumeText('')).toBe('');
  });

  it('does not corrupt unrelated content', () => {
    const text = 'Experienced developer with 5 years of TypeScript and React experience.';
    const result = redactResumeText(text);
    expect(result).toContain('TypeScript');
    expect(result).toContain('React');
    expect(result).toContain('5 years');
  });
});
