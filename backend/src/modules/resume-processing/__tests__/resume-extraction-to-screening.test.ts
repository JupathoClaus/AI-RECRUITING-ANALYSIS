import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { ResumeTextExtractorService } from '../services/resume-text-extractor.service';
import { redactResumeText } from '../../ai-screening/utils/resume-redaction';
import { ScreeningInput } from '../../ai-screening/domain/screening-input.type';
import { ScreeningRecommendation } from '../../ai-screening/domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../../ai-screening/domain/screening-confidence.enum';

const mockConfig = (): ConfigService =>
  ({
    get: (key: string) => {
      const cfg: Record<string, unknown> = {
        'resumeExtraction.maxTextChars': 50000,
        'resumeExtraction.minTextChars': 20,
        'resumeExtraction.timeoutMs': 30000,
      };
      return cfg[key];
    },
    getJSON: jest.fn(),
  }) as any;

const FIXTURES = resolve(__dirname, '../../../../test/fixtures/resumes');

describe('Extraction to Screening (real binary)', () => {
  let extractor: ResumeTextExtractorService;

  beforeAll(() => {
    extractor = new ResumeTextExtractorService(mockConfig());
  });

  async function extractAndBuildInput(
    mimeType: string,
    filePath: string,
  ): Promise<{
    input: ScreeningInput;
    rawExtracted: string;
    redactedText: string;
  }> {
    const buf = readFileSync(filePath);
    const result = await extractor.extract({ buffer: buf as never, mimeType });

    const redactedText = redactResumeText(result.text);

    const input: ScreeningInput = Object.freeze({
      applicationId: 'app-e2e-1',
      candidateId: 'cand-e2e-1',
      jobId: 'job-e2e-1',
      companyId: 'company-e2e-1',
      jobTitle: 'Backend Software Engineer',
      jobDescription: 'Build and maintain backend services.',
      requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL', 'Redis'],
      preferredSkills: ['BullMQ', 'Prisma', 'GraphQL'],
      requiredExperience: '3+ years backend development',
      preferredExperience: '5+ years',
      requiredEducation: "Bachelor's degree in CS or related",
      preferredEducation: "Master's degree",
      requiredCertifications: [],
      preferredCertifications: ['AWS Certified'],
      resumeText: redactedText,
      screeningQuestions: [],
      promptVersion: 'v1',
    });

    return { input, rawExtracted: result.text, redactedText };
  }

  describe('PDF extraction to screening input', () => {
    let result: { input: ScreeningInput; rawExtracted: string; redactedText: string };

    beforeAll(async () => {
      result = await extractAndBuildInput(
        'application/pdf',
        resolve(FIXTURES, 'sample-resume.pdf'),
      );
    });

    it('extracted text contains job-relevant evidence', () => {
      expect(result.rawExtracted).toContain('TypeScript');
      expect(result.rawExtracted).toContain('NestJS');
      expect(result.rawExtracted).toContain('PostgreSQL');
      expect(result.rawExtracted).toContain('Redis');
      expect(result.rawExtracted).toContain('Example Technologies');
      expect(result.rawExtracted).toContain('Bachelor of Science');
      expect(result.rawExtracted).toContain('AWS Certified Cloud Practitioner');
    });

    it('redacted text removes personal contact fields', () => {
      expect(result.redactedText).not.toContain('test.candidate@example.com');
      expect(result.redactedText).not.toContain('+256 700 123456');
      expect(result.redactedText).not.toContain('Ugandan');
      expect(result.redactedText).not.toContain('Kampala, Uganda');
    });

    it('redacted text preserves job evidence', () => {
      expect(result.redactedText).toContain('TypeScript');
      expect(result.redactedText).toContain('NestJS');
      expect(result.redactedText).toContain('PostgreSQL');
      expect(result.redactedText).toContain('Example Technologies');
    });

    it('screening input includes required skills from resume', () => {
      expect(result.input.requiredSkills).toContain('TypeScript');
      expect(result.input.requiredSkills).toContain('NestJS');
      expect(result.input.resumeText).toContain('TypeScript');
      expect(result.input.resumeText).toContain('NestJS');
    });
  });

  describe('DOCX extraction to screening input', () => {
    let result: { input: ScreeningInput; rawExtracted: string; redactedText: string };

    beforeAll(async () => {
      result = await extractAndBuildInput(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        resolve(FIXTURES, 'sample-resume.docx'),
      );
    });

    it('extracted text contains job-relevant evidence', () => {
      expect(result.rawExtracted).toContain('TypeScript');
      expect(result.rawExtracted).toContain('NestJS');
      expect(result.rawExtracted).toContain('PostgreSQL');
      expect(result.rawExtracted).toContain('Example Technologies');
      expect(result.rawExtracted).toContain('Bachelor of Science');
    });

    it('redacted text removes personal fields', () => {
      expect(result.redactedText).not.toContain('test.candidate@example.com');
      expect(result.redactedText).not.toContain('+256 700 123456');
    });

    it('redacted text preserves job evidence', () => {
      expect(result.redactedText).toContain('TypeScript');
      expect(result.redactedText).toContain('NestJS');
      expect(result.redactedText).toContain('PostgreSQL');
    });
  });

  describe('mock AI provider receives extracted content', () => {
    it('mock provider can screen using real extracted PDF content', async () => {
      const { MockScreeningProvider } =
        await import('../../ai-screening/providers/mock-screening.provider');
      const provider = new MockScreeningProvider();

      const buf = readFileSync(resolve(FIXTURES, 'sample-resume.pdf'));
      const extResult = await extractor.extract({
        buffer: buf as never,
        mimeType: 'application/pdf',
      });
      const redacted = redactResumeText(extResult.text);

      const input: ScreeningInput = Object.freeze({
        applicationId: 'app-provider-1',
        candidateId: 'cand-provider-1',
        jobId: 'job-provider-1',
        companyId: 'company-provider-1',
        jobTitle: 'Backend Engineer',
        jobDescription: 'Backend role with TypeScript, NestJS, PostgreSQL, Redis, BullMQ, Prisma',
        requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL', 'Redis'],
        preferredSkills: ['BullMQ', 'Prisma', 'GraphQL'],
        requiredExperience: '3+ years',
        preferredExperience: '',
        requiredEducation: 'Bachelors',
        preferredEducation: '',
        requiredCertifications: [],
        preferredCertifications: ['AWS Certified'],
        resumeText: redacted,
        screeningQuestions: [],
        promptVersion: 'v1',
      });

      const screeningResult = await provider.screen(input);
      expect(screeningResult.recommendation).toBe(ScreeningRecommendation.SHORTLIST);
      expect(screeningResult.confidence).toBe(ScreeningConfidence.HIGH);
      expect(screeningResult.matchedQualifications.length).toBeGreaterThan(0);
      expect(screeningResult.overallScore).toBeGreaterThanOrEqual(80);
    });
  });
});
