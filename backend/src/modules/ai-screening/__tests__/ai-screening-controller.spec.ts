import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningController } from '../ai-screening.controller';
import { AiScreeningService, ScreeningResultOrAction } from '../ai-screening.service';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { ResumeTextLoaderService } from '../services/resume-text-loader.service';
import { AI_SCREENING_QUEUE } from '../queue/ai-screening-queue.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ResumeExtractionService } from '../../resume-processing/services/resume-extraction.service';

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as any;

const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text.');
jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

describe('AiScreeningController', () => {
  let controller: AiScreeningController;
  let service: AiScreeningService;
  let mockPrismaService: any;
  let mockQueue: { add: jest.Mock };
  let mockResumeQueue: { add: jest.Mock };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text.');

    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    mockResumeQueue = { add: jest.fn() };

    mockPrismaService = {
      application: { findFirst: jest.fn(), update: jest.fn() },
      aiScreeningResult: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      storedFile: { findUnique: jest.fn() },
      resumeTextExtraction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          'aiScreening.provider': 'mock',
          'aiScreening.openAiModel': 'gpt-4o-mini',
          'aiScreening.promptVersion': 'v1',
          'aiScreening.schemaVersion': 'v1',
          'app.uploadDir': './uploads',
          'app.resumeTextParserSuffix': '_parsed.txt',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiScreeningController],
      providers: [
        AiScreeningService,
        ScreeningInputBuilderService,
        ResumeTextLoaderService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken(AI_SCREENING_QUEUE), useValue: mockQueue },
        { provide: getQueueToken('resume-processing'), useValue: mockResumeQueue },
        { provide: ResumeExtractionService, useValue: { requestExtraction: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AiScreeningController>(AiScreeningController);
    service = module.get<AiScreeningService>(AiScreeningService);
  });

  describe('POST applications/:applicationId/ai-screenings', () => {
    it('returns CREATED action for new screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'CREATED',
        data: {
          id: 'screen-1',
          applicationId: 'app-1',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        } as any,
      });

      const result = await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        {
          userId: 'user-1',
          activeCompanyId: 'company-1',
          role: 'HR_MANAGER',
          permissions: [],
        } as any,
        mockRes(),
      );

      expect(result.action).toBe('CREATED');
      expect(result.data.status).toBe('PENDING');
    });

    it('returns REUSED action for existing screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'REUSED',
        data: {
          id: 'screen-1',
          applicationId: 'app-1',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        } as any,
      });

      const result = await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        {
          userId: 'user-1',
          activeCompanyId: 'company-1',
          role: 'HR_MANAGER',
          permissions: [],
        } as any,
        mockRes(),
      );

      expect(result.action).toBe('REUSED');
      expect(result.data.status).toBe('COMPLETED');
    });

    it('forceRerun returns CREATED', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'CREATED',
        data: { id: 'screen-new', status: 'PENDING', createdAt: new Date().toISOString() } as any,
      });

      const result = await controller.requestScreening(
        'app-1',
        { forceRerun: true },
        {
          userId: 'user-1',
          activeCompanyId: 'company-1',
          role: 'HR_MANAGER',
          permissions: [],
        } as any,
        mockRes(),
      );

      expect(result.action).toBe('CREATED');
    });

    it('uses user context for tenant scoping', async () => {
      const spy = jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'CREATED',
        data: { id: 'screen-1', status: 'PENDING', createdAt: new Date().toISOString() } as any,
      });

      await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        {
          userId: 'user-1',
          activeCompanyId: 'company-1',
          role: 'RECRUITER',
          permissions: [],
        } as any,
        mockRes(),
      );

      expect(spy).toHaveBeenCalledWith('app-1', 'company-1', 'user-1', false);
    });
  });

  describe('GET endpoints', () => {
    it('listScreenings returns data', async () => {
      jest
        .spyOn(service, 'listScreenings')
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      const result = await controller.listScreenings('app-1', { page: 1, limit: 20 }, {
        userId: 'u1',
        activeCompanyId: 'c1',
      } as any);
      expect(result.data).toEqual([]);
    });

    it('getLatestScreening returns result', async () => {
      jest.spyOn(service, 'getLatestScreening').mockResolvedValue({
        id: 's1',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      } as any);
      const result = await controller.getLatestScreening('app-1', {
        userId: 'u1',
        activeCompanyId: 'c1',
      } as any);
      expect(result.id).toBe('s1');
    });

    it('getScreening returns result', async () => {
      jest.spyOn(service, 'getScreening').mockResolvedValue({
        id: 's1',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      } as any);
      const result = await controller.getScreening('s1', {
        userId: 'u1',
        activeCompanyId: 'c1',
      } as any);
      expect(result.id).toBe('s1');
    });
  });

  describe('GET applications/:applicationId/resume-extraction', () => {
    const user = { userId: 'u1', activeCompanyId: 'c1', role: 'RECRUITER', permissions: [] } as any;

    it('returns extraction status for application', async () => {
      jest.spyOn(service, 'getExtractionStatus').mockResolvedValue({
        id: 'ext-1',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.getExtractionStatus('app-1', user);
      expect(result.id).toBe('ext-1');
      expect(result.status).toBe('PENDING');
    });

    it('returns PROCESSING status when worker is active', async () => {
      jest.spyOn(service, 'getExtractionStatus').mockResolvedValue({
        id: 'ext-1',
        status: 'PROCESSING',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });

      const result = await controller.getExtractionStatus('app-1', user);
      expect(result.status).toBe('PROCESSING');
    });

    it('returns COMPLETED status with timestamps', async () => {
      jest.spyOn(service, 'getExtractionStatus').mockResolvedValue({
        id: 'ext-1',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const result = await controller.getExtractionStatus('app-1', user);
      expect(result.status).toBe('COMPLETED');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('returns FAILED status with failure details', async () => {
      jest.spyOn(service, 'getExtractionStatus').mockResolvedValue({
        id: 'ext-1',
        status: 'FAILED',
        failureCode: 'EXTRACTION_FAILED',
        failureMessageSafe: 'Could not extract text from PDF',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const result = await controller.getExtractionStatus('app-1', user);
      expect(result.status).toBe('FAILED');
      expect(result.failureCode).toBe('EXTRACTION_FAILED');
      expect(result.failureMessageSafe).toContain('PDF');
    });
  });

  describe('CQRS — GET resume-extraction is pure read-only (no mutations)', () => {
    const user = { userId: 'u1', activeCompanyId: 'c1', role: 'RECRUITER', permissions: [] } as any;

    beforeEach(() => {
      mockPrismaService.application = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-1',
          companyId: 'c1',
          deletedAt: null,
          resumeFiles: [{ id: 'file-1' }],
        }),
        update: jest.fn(),
      };
      mockPrismaService.resumeTextExtraction = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ext-1',
          storedFileId: 'file-1',
          companyId: 'c1',
          status: 'PENDING',
          failureCode: null,
          failureMessageSafe: null,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
    });

    it('never calls create or update on resumeTextExtraction', async () => {
      await controller.getExtractionStatus('app-1', user);

      expect(mockPrismaService.resumeTextExtraction.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.resumeTextExtraction.create).not.toHaveBeenCalled();
      expect(mockPrismaService.resumeTextExtraction.update).not.toHaveBeenCalled();
    });

    it('never enqueues extraction jobs', async () => {
      await controller.getExtractionStatus('app-1', user);

      expect(mockResumeQueue.add).not.toHaveBeenCalled();
    });

    it('never creates or updates aiScreeningResults', async () => {
      await controller.getExtractionStatus('app-1', user);

      expect(mockPrismaService.aiScreeningResult.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.aiScreeningResult.create).not.toHaveBeenCalled();
      expect(mockPrismaService.aiScreeningResult.update).not.toHaveBeenCalled();
    });

    it('never enqueues ai-screening jobs', async () => {
      await controller.getExtractionStatus('app-1', user);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('is idempotent — repeated calls return same result', async () => {
      const first = await controller.getExtractionStatus('app-1', user);
      const second = await controller.getExtractionStatus('app-1', user);

      expect(first.id).toBe(second.id);
      expect(first.status).toBe(second.status);
    });

    it('repeated calls leave extraction row count unchanged', async () => {
      mockPrismaService.resumeTextExtraction.count = jest.fn().mockResolvedValue(1);
      const countBefore = 1;

      await controller.getExtractionStatus('app-1', user);
      await controller.getExtractionStatus('app-1', user);
      await controller.getExtractionStatus('app-1', user);

      expect(mockPrismaService.resumeTextExtraction.count).not.toHaveBeenCalled();
    });

    it('returns PENDING status without side effects', async () => {
      const result = await controller.getExtractionStatus('app-1', user);

      expect(result.status).toBe('PENDING');
      expect(mockPrismaService.resumeTextExtraction.update).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockResumeQueue.add).not.toHaveBeenCalled();
    });

    it('returns FAILED status without triggering retry', async () => {
      mockPrismaService.resumeTextExtraction.findFirst = jest.fn().mockResolvedValue({
        id: 'ext-1',
        storedFileId: 'file-1',
        companyId: 'c1',
        status: 'FAILED',
        failureCode: 'EXTRACTION_FAILED',
        failureMessageSafe: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: new Date(),
      });

      const result = await controller.getExtractionStatus('app-1', user);

      expect(result.status).toBe('FAILED');
      expect(mockPrismaService.resumeTextExtraction.create).not.toHaveBeenCalled();
      expect(mockResumeQueue.add).not.toHaveBeenCalled();
    });

    it('returns COMPLETED status without reusing results', async () => {
      mockPrismaService.resumeTextExtraction.findFirst = jest.fn().mockResolvedValue({
        id: 'ext-1',
        storedFileId: 'file-1',
        companyId: 'c1',
        status: 'COMPLETED',
        failureCode: null,
        failureMessageSafe: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = await controller.getExtractionStatus('app-1', user);

      expect(result.status).toBe('COMPLETED');
      expect(mockPrismaService.aiScreeningResult.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.aiScreeningResult.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('scopes queries to the active company', async () => {
      mockPrismaService.application.findFirst = jest.fn().mockResolvedValue({
        id: 'app-1',
        companyId: 'c1',
        deletedAt: null,
        resumeFiles: [{ id: 'file-1' }],
      });

      await controller.getExtractionStatus('app-1', user);

      expect(mockPrismaService.application.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'c1' }),
        }),
      );
      expect(mockPrismaService.resumeTextExtraction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'c1' }),
        }),
      );
    });
  });
});
