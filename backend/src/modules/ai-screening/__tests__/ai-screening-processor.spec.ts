import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningProcessor } from '../queue/ai-screening.processor';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { ResumeTextLoaderService } from '../services/resume-text-loader.service';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { AiScreeningJobData } from '../queue/ai-screening-job-data.interface';
import { computeScreeningFingerprint } from '../utils/screening-input-fingerprint';
import { ScreeningInput } from '../domain/screening-input.type';
import { AI_SCREENING_JOB } from '../queue/ai-screening-queue.constants';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import {
  AiScreeningAuthenticationError,
  AiScreeningTimeoutError,
} from '../providers/ai-screening-provider.errors';

const mockPrisma = {
  application: { findFirst: jest.fn(), update: jest.fn() },
  aiScreeningResult: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  resumeTextExtraction: { findFirst: jest.fn() },
  storedFile: { findUnique: jest.fn() },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'aiScreening.provider': 'mock',
      'aiScreening.openAiModel': 'gpt-4o-mini',
      'aiScreening.promptVersion': 'v1',
      'aiScreening.schemaVersion': 'v1',
      'aiScreening.workerConcurrency': 3,
      'aiScreening.mockScenario': '',
      'app.uploadDir': './uploads',
      'app.resumeTextParserSuffix': '_parsed.txt',
    };
    return config[key];
  }),
};

const mockProvider = new MockScreeningProvider();
const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text.');

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const APP_DATE = new Date('2025-01-01T00:00:00.000Z');

const mockApplication = {
  id: 'app-1',
  companyId: 'company-1',
  deletedAt: null,
  job: {
    id: 'job-1',
    title: 'Engineer',
    description: 'Build software.',
    qualifications: null,
    updatedAt: APP_DATE,
    skills: [{ skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' }],
    screeningQuestions: [],
  },
  candidate: { id: 'cand-1' },
  screeningAnswers: [],
  resumeFiles: [
    {
      id: 'file-1',
      checksumSha256: 'abc123',
      updatedAt: APP_DATE,
      storageKey: 'company-1/file-1.pdf',
    },
  ],
};

function buildFingerprintForTest(): string {
  const input: ScreeningInput = Object.freeze({
    applicationId: 'app-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    companyId: 'company-1',
    jobTitle: 'Engineer',
    jobDescription: 'Build software.',
    requiredSkills: ['TypeScript'],
    preferredSkills: [],
    requiredExperience: '',
    preferredExperience: '',
    requiredEducation: '',
    preferredEducation: '',
    requiredCertifications: [],
    preferredCertifications: [],
    resumeText: 'Parsed resume text.',
    screeningQuestions: [],
    promptVersion: 'v1',
  });
  return computeScreeningFingerprint({
    applicationId: 'app-1',
    input,
    jobUpdatedAt: APP_DATE.toISOString(),
    resumeChecksumSha256: 'abc123',
    resumeUpdatedAt: APP_DATE.toISOString(),
    provider: 'mock',
    model: '',
    promptVersion: 'v1',
    schemaVersion: 'v1',
  });
}

const MATCHING_FINGERPRINT = buildFingerprintForTest();

function createJob(
  overrides: Partial<
    AiScreeningJobData & {
      name?: string;
      id?: string;
      attemptsMade?: number;
      opts?: Record<string, unknown>;
    }
  > = {},
): Job<AiScreeningJobData> {
  return {
    id: overrides.id ?? 'screen-1',
    name: overrides.name ?? AI_SCREENING_JOB,
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: 3, ...(overrides.opts ?? {}) },
    data: {
      screeningId: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      initiatedByUserId: 'user-1',
      inputFingerprint: MATCHING_FINGERPRINT,
      ...overrides,
    },
  } as Job<AiScreeningJobData>;
}

describe('AiScreeningProcessor', () => {
  let processor: AiScreeningProcessor;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text.');
    mockPrisma.resumeTextExtraction.findFirst.mockResolvedValue({
      id: 'ext-1',
      storedFileId: 'file-1',
      companyId: 'company-1',
      status: 'COMPLETED',
      extractedText: 'Parsed resume text.',
      extractedTextSha256: 'abc',
      sourceFileSha256: 'def',
      parserName: 'pdf-parse',
      parserVersion: '1.1.1',
      completedAt: new Date(),
      storedFile: { status: 'ACTIVE', deletedAt: null },
    });

    const module = await Test.createTestingModule({
      providers: [
        AiScreeningProcessor,
        ScreeningInputBuilderService,
        ResumeTextLoaderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AI_SCREENING_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    processor = module.get<AiScreeningProcessor>(AiScreeningProcessor);
  });

  it('rejects job with wrong name', async () => {
    const job = createJob({ name: 'wrong-job-name' });
    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('rejects job with invalid payload', async () => {
    await expect(processor.process(createJob({ screeningId: '' }))).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it('rejects job when screening record not found', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue(null);
    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('rejects job when identifiers mismatch', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'other-app',
      companyId: 'company-1',
      status: 'PENDING',
    });
    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('skips COMPLETED screening', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    await expect(processor.process(createJob())).resolves.toBeUndefined();
  });

  it('skips terminal FAILED screening', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'FAILED',
      completedAt: new Date(),
    });
    await expect(processor.process(createJob())).resolves.toBeUndefined();
  });

  it('rejects RUNNING from different worker', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'RUNNING',
    });
    await expect(processor.process(createJob({ id: 'different-job-id' }))).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it('allows retry when same job is RUNNING', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'RUNNING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await processor.process(createJob({ id: 'screen-1', attemptsMade: 1 }));
    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('first transient failure allows retry', async () => {
    const err = new AiScreeningTimeoutError('mock');
    jest.spyOn(mockProvider, 'screen').mockRejectedValue(err);

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await expect(processor.process(createJob({ attemptsMade: 0 }))).rejects.toThrow(err);
    expect(mockPrisma.aiScreeningResult.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('second retry succeeds after first failure', async () => {
    jest.spyOn(mockProvider, 'screen').mockResolvedValue({
      overallScore: 85,
      recommendation: ScreeningRecommendation.SHORTLIST,
      confidence: ScreeningConfidence.HIGH,
      matchedQualifications: ['TypeScript'],
      missingQualifications: [],
      evidence: [],
      uncertainties: [],
      riskFlags: [],
      explanation: 'Good match.',
      criteriaScores: [],
      prohibitedReasoningDetected: false,
    });

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'RUNNING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await processor.process(createJob({ id: 'screen-1', attemptsMade: 1 }));
    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('exhausted retries persist FAILED', async () => {
    const err = new AiScreeningTimeoutError('mock');
    jest.spyOn(mockProvider, 'screen').mockRejectedValue(err);

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await expect(
      processor.process(createJob({ attemptsMade: 2, opts: { attempts: 3 } })),
    ).rejects.toThrow(UnrecoverableError);
    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failureCode: 'PROVIDER_TIMEOUT' }),
      }),
    );
  });

  it('permanent error does not retry', async () => {
    const err = new AiScreeningAuthenticationError('mock');
    jest.spyOn(mockProvider, 'screen').mockRejectedValue(err);

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failureCode: 'PROVIDER_AUTH_ERROR' }),
      }),
    );
  });

  it('atomically claims PENDING', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
    expect(mockPrisma.aiScreeningResult.updateMany).toHaveBeenCalledWith({
      where: { id: 'screen-1', status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: expect.any(Date) },
    });
  });

  it('sets completedAt on completion', async () => {
    jest.spyOn(mockProvider, 'screen').mockResolvedValue({
      overallScore: 85,
      recommendation: ScreeningRecommendation.SHORTLIST,
      confidence: ScreeningConfidence.HIGH,
      matchedQualifications: ['TypeScript'],
      missingQualifications: [],
      evidence: [
        {
          criterion: 'skills',
          sourceCategory: 'RESUME' as any,
          sourceText: 'TypeScript',
          assessment: 'match',
          score: 90,
        },
      ],
      uncertainties: [],
      riskFlags: [],
      explanation: 'Good match.',
      criteriaScores: [
        { criterion: 'skills', score: 85, maximumScore: 100, weight: 0.5, explanation: 'Good' },
      ],
      prohibitedReasoningDetected: false,
    });

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await processor.process(createJob());
    const updateCalls = mockPrisma.aiScreeningResult.update.mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate[0].data.completedAt).toBeDefined();
  });

  it('SHORTLIST does not advance application', async () => {
    jest.spyOn(mockProvider, 'screen').mockResolvedValue({
      overallScore: 85,
      recommendation: ScreeningRecommendation.SHORTLIST,
      confidence: ScreeningConfidence.HIGH,
      matchedQualifications: ['TypeScript'],
      missingQualifications: [],
      evidence: [
        {
          criterion: 'skills',
          sourceCategory: 'RESUME' as any,
          sourceText: 'TypeScript',
          assessment: 'match',
        },
      ],
      uncertainties: [],
      riskFlags: [],
      explanation: 'Good match.',
      criteriaScores: [],
      prohibitedReasoningDetected: false,
    });

    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.aiScreeningResult.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
    mockPrisma.aiScreeningResult.update.mockResolvedValue({});

    await processor.process(createJob());
    expect(mockPrisma.application.update).not.toHaveBeenCalled();
  });
});
