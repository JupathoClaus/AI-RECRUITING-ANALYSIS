import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningService } from '../ai-screening.service';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { ResumeTextLoaderService } from '../services/resume-text-loader.service';
import { ResumeExtractionService } from '../../resume-processing/services/resume-extraction.service';
import { AI_SCREENING_QUEUE } from '../queue/ai-screening-queue.constants';

const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text content here.');

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockPrisma = {
  application: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  aiScreeningResult: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  resumeTextExtraction: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  storedFile: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'aiScreening.provider': 'mock',
      'aiScreening.openAiModel': 'gpt-4o-mini',
      'aiScreening.promptVersion': 'v1',
      'aiScreening.schemaVersion': 'v1',
      'aiScreening.maxResumeChars': 15000,
      'app.uploadDir': './uploads',
      'app.resumeTextParserSuffix': '_parsed.txt',
    };
    return config[key];
  }),
};

const mockApplication = {
  id: 'app-1',
  companyId: 'company-1',
  jobId: 'job-1',
  candidateId: 'cand-1',
  companyCandidateId: 'cc-1',
  status: 'SUBMITTED',
  createdAt: new Date(),
  updatedAt: new Date(),
  job: {
    id: 'job-1',
    title: 'Engineer',
    description: 'Build software.',
    responsibilities: null,
    qualifications: null,
    experienceLevel: 'MID',
    updatedAt: new Date(),
    skills: [{ skill: { displayName: 'TypeScript' }, importance: 'REQUIRED' }],
    screeningQuestions: [],
    educationRequirements: [],
    experienceRequirements: [],
  },
  candidate: { id: 'cand-1', firstName: 'Test', lastName: 'User' },
  screeningAnswers: [],
  resumeFiles: [
    {
      id: 'file-1',
      checksumSha256: 'abc123',
      updatedAt: new Date(),
      storageKey: 'company-1/file-1.pdf',
    },
  ],
};

describe('AiScreeningService', () => {
  let service: AiScreeningService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text content here.');
    mockQueue.add.mockResolvedValue({ id: 'job-1' });
    mockPrisma.resumeTextExtraction.findFirst.mockResolvedValue({
      id: 'ext-1',
      storedFileId: 'file-1',
      companyId: 'company-1',
      status: 'COMPLETED',
      extractedText: 'Parsed resume text content here.',
      extractedTextSha256: 'abc',
      sourceFileSha256: 'def',
      parserName: 'pdf-parse',
      parserVersion: '1.1.1',
      completedAt: new Date(),
      storedFile: { status: 'ACTIVE', deletedAt: null },
    });

    const mockExtractionService = {
      requestExtraction: jest
        .fn()
        .mockResolvedValue({ action: 'REUSED', extraction: { id: 'ext-1', status: 'COMPLETED' } }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AiScreeningService,
        ScreeningInputBuilderService,
        ResumeTextLoaderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(AI_SCREENING_QUEUE), useValue: mockQueue },
        { provide: getQueueToken('resume-processing'), useValue: { add: jest.fn() } },
        { provide: ResumeExtractionService, useValue: mockExtractionService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiScreeningService>(AiScreeningService);
  });

  describe('requestScreening', () => {
    it('creates a PENDING screening attempt and enqueues a job', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (client: typeof mockPrisma) => unknown) => {
          mockPrisma.aiScreeningResult.create.mockResolvedValue({
            id: 'screen-1',
            applicationId: 'app-1',
            status: 'PENDING',
            companyId: 'company-1',
            createdAt: new Date(),
          });
          return cb(mockPrisma);
        },
      );

      const result = await service.requestScreening('app-1', 'company-1', 'user-1');

      expect(result.action).toBe('CREATED');
      expect(result.data.status).toBe('PENDING');
      expect(mockPrisma.aiScreeningResult.create).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('returns existing PENDING attempt with REUSED action', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue({
        id: 'screen-1',
        applicationId: 'app-1',
        status: 'PENDING',
        companyId: 'company-1',
        createdAt: new Date(),
      });

      const result = await service.requestScreening('app-1', 'company-1', 'user-1');

      expect(result.action).toBe('REUSED');
      expect(result.data.status).toBe('PENDING');
      expect(mockPrisma.aiScreeningResult.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('returns existing COMPLETED result with REUSED action', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue({
        id: 'screen-1',
        applicationId: 'app-1',
        status: 'COMPLETED',
        companyId: 'company-1',
        recommendation: 'SHORTLIST',
        overallScore: 85,
        createdAt: new Date(),
      });

      const result = await service.requestScreening('app-1', 'company-1', 'user-1');

      expect(result.action).toBe('REUSED');
      expect(result.data.status).toBe('COMPLETED');
      expect(mockPrisma.aiScreeningResult.create).not.toHaveBeenCalled();
    });

    it('forceRerun creates a new attempt and returns CREATED', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue({
        id: 'screen-old',
        status: 'COMPLETED',
        createdAt: new Date(),
      });
      mockPrisma.$transaction.mockImplementation(
        async (cb: (client: typeof mockPrisma) => unknown) => {
          mockPrisma.aiScreeningResult.create.mockResolvedValue({
            id: 'screen-new',
            status: 'PENDING',
            createdAt: new Date(),
          });
          return cb(mockPrisma);
        },
      );

      const result = await service.requestScreening('app-1', 'company-1', 'user-1', true);

      expect(result.action).toBe('CREATED');
      expect(result.data.status).toBe('PENDING');
      expect(mockPrisma.aiScreeningResult.create).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.requestScreening('app-nonexistent', 'company-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException for missing job description', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({
        ...mockApplication,
        job: { ...mockApplication.job, description: '', qualifications: null },
      });

      await expect(service.requestScreening('app-1', 'company-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException for missing resume', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ ...mockApplication, resumeFiles: [] });

      await expect(service.requestScreening('app-1', 'company-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('marks attempt FAILED when queue insertion fails', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (client: typeof mockPrisma) => unknown) => {
          mockPrisma.aiScreeningResult.create.mockResolvedValue({
            id: 'screen-1',
            status: 'PENDING',
            createdAt: new Date(),
          });
          return cb(mockPrisma);
        },
      );
      mockQueue.add.mockRejectedValue(new Error('Redis connection failed'));
      mockPrisma.aiScreeningResult.update.mockResolvedValue({});

      await expect(service.requestScreening('app-1', 'company-1', 'user-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrisma.aiScreeningResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', failureCode: 'QUEUE_FAILURE' }),
        }),
      );
    });

    it('application status remains unchanged', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (client: typeof mockPrisma) => unknown) => {
          mockPrisma.aiScreeningResult.create.mockResolvedValue({
            id: 'screen-1',
            status: 'PENDING',
            createdAt: new Date(),
          });
          return cb(mockPrisma);
        },
      );

      await service.requestScreening('app-1', 'company-1', 'user-1');

      expect(mockPrisma.application.update).not.toHaveBeenCalled();
    });
  });

  describe('getScreening', () => {
    it('retrieves screening scoped by company', async () => {
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue({
        id: 'screen-1',
        applicationId: 'app-1',
        status: 'COMPLETED',
        companyId: 'company-1',
        recommendation: 'SHORTLIST',
        overallScore: 85,
        createdAt: new Date(),
      });

      const result = await service.getScreening('screen-1', 'company-1');
      expect(result.id).toBe('screen-1');
      expect(mockPrisma.aiScreeningResult.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-1' }) }),
      );
    });

    it('throws NotFound for cross-company access', async () => {
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue(null);

      await expect(service.getScreening('screen-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getLatestScreening', () => {
    it('retrieves latest screening for application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: 'app-1' });
      mockPrisma.aiScreeningResult.findFirst.mockResolvedValue({
        id: 'screen-1',
        status: 'COMPLETED',
        createdAt: new Date(),
      });

      const result = await service.getLatestScreening('app-1', 'company-1');
      expect(result.id).toBe('screen-1');
    });

    it('throws NotFound when app does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      await expect(service.getLatestScreening('app-nonexistent', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listScreenings', () => {
    it('returns paginated results', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: 'app-1' });
      mockPrisma.aiScreeningResult.findMany.mockResolvedValue([
        { id: 'screen-1', status: 'COMPLETED', createdAt: new Date() },
      ]);
      mockPrisma.aiScreeningResult.count.mockResolvedValue(1);

      const result = await service.listScreenings('app-1', 'company-1', 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
