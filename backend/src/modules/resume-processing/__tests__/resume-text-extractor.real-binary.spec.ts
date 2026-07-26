import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { ResumeTextExtractorService } from '../services/resume-text-extractor.service';

const mockConfig = (): ConfigService => ({
  get: (key: string) => {
    const cfg: Record<string, unknown> = {
      'resumeExtraction.maxTextChars': 50000,
      'resumeExtraction.minTextChars': 20,
      'resumeExtraction.timeoutMs': 30000,
    };
    return cfg[key];
  },
  getJSON: jest.fn(),
} as any);

const FIXTURES = resolve(__dirname, '../../../../test/fixtures/resumes');

describe('ResumeTextExtractorService (real binary)', () => {
  let extractor: ResumeTextExtractorService;

  beforeAll(() => {
    extractor = new ResumeTextExtractorService(mockConfig());
  });

  describe('PDF extraction', () => {
    it('extracts text from real PDF fixture', async () => {
      const buf = readFileSync(resolve(FIXTURES, 'sample-resume.pdf'));
      const result = await extractor.extract({ buffer: buf as never, mimeType: 'application/pdf' });
      expect(result.text).toContain('TypeScript');
      expect(result.text).toContain('NestJS');
      expect(result.text).toContain('PostgreSQL');
      expect(result.text).toContain('Example Technologies');
      expect(result.text).toContain('Bachelor of Science');
      expect(result.text).toContain('AWS Certified Cloud Practitioner');
      expect(result.parserName).toBe('pdf-parse');
      expect(result.textSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('fails for empty/blank PDF', async () => {
      const buf = readFileSync(resolve(FIXTURES, 'empty-resume.pdf'));
      await expect(extractor.extract({ buffer: buf as never, mimeType: 'application/pdf' })).rejects.toThrow('EMPTY_EXTRACTION');
    });
  });

  describe('DOCX extraction', () => {
    it('extracts text from real DOCX fixture', async () => {
      const buf = readFileSync(resolve(FIXTURES, 'sample-resume.docx'));
      const result = await extractor.extract({ buffer: buf as never, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      expect(result.text).toContain('TypeScript');
      expect(result.text).toContain('NestJS');
      expect(result.text).toContain('PostgreSQL');
      expect(result.text).toContain('Example Technologies');
      expect(result.text).toContain('Bachelor of Science');
      expect(result.text).toContain('AWS Certified Cloud Practitioner');
      expect(result.parserName).toBe('mammoth');
      expect(result.textSha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('error handling', () => {
    it('fails for unsupported MIME type', async () => {
      const buf = Buffer.from('some text');
      await expect(extractor.extract({ buffer: buf as never, mimeType: 'text/plain' })).rejects.toThrow('UNSUPPORTED_MIME_TYPE');
    });

    it('fails for corrupt DOCX', async () => {
      const buf = Buffer.from('not a valid docx');
      await expect(extractor.extract({ buffer: buf as never, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).rejects.toThrow('CORRUPT_DOCX');
    });
  });
});
