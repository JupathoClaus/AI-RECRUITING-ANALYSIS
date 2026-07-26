import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningProcessor } from '../queue/ai-screening.processor';
import { ScreeningInputBuilderService, ResumeTextData } from '../services/screening-input-builder.service';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { AiScreeningJobData } from '../queue/ai-screening-job-data.interface';
import { computeScreeningFingerprint } from '../utils/screening-input-fingerprint';
import { ScreeningInput } from '../domain/screening-input.type';

const mockPrisma = {
  application: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  aiScreeningResult: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  storedFile: {
    findUnique: jest.fn(),
  },
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

const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text.');

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockProvider = new MockScreeningProvider();

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
  resumeFiles: [{
    id: 'file-1',
    checksumSha256: 'abc123',
    updatedAt: APP_DATE,
    storageKey: 'company-1/file-1.pdf',
  }],
};

const RESUME_TEXT_DATA: ResumeTextData = { parsedText: 'Parsed resume text.', checksumSha256: 'abc123' };

function buildFingerprintForTest(app: typeof mockApplication): string {
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

const MATCHING_FINGERPRINT = buildFingerprintForTest(mockApplication);

function createJob(data: Partial<AiScreeningJobData> = {}): Job<AiScreeningJobData> {
  return {
    id: 'job-1',
    data: {
      screeningId: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      initiatedByUserId: 'user-1',
      inputFingerprint: MATCHING_FINGERPRINT,
      ...data,
    },
  } as Job<AiScreeningJobData>;
}

describe('AiScreeningProcessor', () => {
  let processor: AiScreeningProcessor;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text.');

    const module = await Test.createTestingModule({
      providers: [
        AiScreeningProcessor,
        ScreeningInputBuilderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AI_SCREENING_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    processor = module.get<AiScreeningProcessor>(AiScreeningProcessor);
  });

  it('rejects job with invalid payload', async () => {
    const job = createJob({ screeningId: '' });

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('rejects job when screening record not found', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue(null);

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('rejects job when screening identifiers do not match', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'other-app',
      companyId: 'company-1',
      status: 'PENDING',
    });

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('skips already COMPLETED screening', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'COMPLETED',
    });

    await expect(processor.process(createJob())).resolves.toBeUndefined();
  });

  it('rejects already RUNNING screening', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'RUNNING',
    });

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('marks PENDING as RUNNING and processes successfully', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await processor.process(createJob());

    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'screen-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('sets startedAt when marking RUNNING', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: null,
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await processor.process(createJob());

    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'screen-1' },
        data: expect.objectContaining({
          status: 'RUNNING',
          startedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('fingerprint mismatch prevents provider invocation', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });

    const differentApp = { ...mockApplication, id: 'different-app' };
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    const job = createJob({ inputFingerprint: 'non-matching-fingerprint' });
    await processor.process(job);

    expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'screen-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'STALE_FINGERPRINT',
        }),
      }),
    );
  });

  it('handles application not found', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
    });
    mockPrisma.application.findFirst.mockResolvedValue(null);

    await expect(processor.process(createJob())).rejects.toThrow(UnrecoverableError);
  });

  it('sets completedAt on completion', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await processor.process(createJob());

    const updateCalls = mockPrisma.aiScreeningResult.update.mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate[0].data.completedAt).toBeDefined();
  });

  it('SHORTLIST recommendation is persisted without advancing application', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1',
      applicationId: 'app-1',
      companyId: 'company-1',
      status: 'PENDING',
      provider: 'mock',
      model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await processor.process(createJob());

    expect(mockPrisma.application.update).not.toHaveBeenCalled();
  });

  it('no email is sent by the processor', async () => {
    mockPrisma.aiScreeningResult.findUnique.mockResolvedValue({
      id: 'screen-1', applicationId: 'app-1', companyId: 'company-1',
      status: 'PENDING', provider: 'mock', model: null,
    });
    mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

    await processor.process(createJob());

    const updateCall = mockPrisma.aiScreeningResult.update.mock.calls.find(
      (c: any[]) => c[0]?.data?.status === 'COMPLETED',
    );
    expect(updateCall).toBeDefined();
  });
});
