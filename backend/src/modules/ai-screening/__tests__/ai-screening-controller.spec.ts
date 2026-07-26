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

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as any);

const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text.');
jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

describe('AiScreeningController', () => {
  let controller: AiScreeningController;
  let service: AiScreeningService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text.');

    const mockPrismaService = {
      application: { findFirst: jest.fn(), update: jest.fn() },
      aiScreeningResult: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
      storedFile: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          'aiScreening.provider': 'mock', 'aiScreening.openAiModel': 'gpt-4o-mini',
          'aiScreening.promptVersion': 'v1', 'aiScreening.schemaVersion': 'v1',
          'app.uploadDir': './uploads', 'app.resumeTextParserSuffix': '_parsed.txt',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiScreeningController],
      providers: [
        AiScreeningService, ScreeningInputBuilderService, ResumeTextLoaderService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken(AI_SCREENING_QUEUE), useValue: mockQueue },
        { provide: getQueueToken('resume-processing'), useValue: { add: jest.fn() } },
        { provide: ResumeExtractionService, useValue: { requestExtraction: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard).useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AiScreeningController>(AiScreeningController);
    service = module.get<AiScreeningService>(AiScreeningService);
  });

  describe('POST applications/:applicationId/ai-screenings', () => {
    it('returns CREATED action for new screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'CREATED',
        data: { id: 'screen-1', applicationId: 'app-1', status: 'PENDING', createdAt: new Date().toISOString() } as any,
      });

      const result = await controller.requestScreening(
        'app-1', { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER', permissions: [] } as any,
        mockRes(),
      );

      expect(result.action).toBe('CREATED');
      expect(result.data.status).toBe('PENDING');
    });

    it('returns REUSED action for existing screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        action: 'REUSED',
        data: { id: 'screen-1', applicationId: 'app-1', status: 'COMPLETED', createdAt: new Date().toISOString() } as any,
      });

      const result = await controller.requestScreening(
        'app-1', { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER', permissions: [] } as any,
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
        'app-1', { forceRerun: true },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER', permissions: [] } as any,
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
        'app-1', { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'RECRUITER', permissions: [] } as any,
        mockRes(),
      );

      expect(spy).toHaveBeenCalledWith('app-1', 'company-1', 'user-1', false);
    });
  });

  describe('GET endpoints', () => {
    it('listScreenings returns data', async () => {
      jest.spyOn(service, 'listScreenings').mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      const result = await controller.listScreenings('app-1', { page: 1, limit: 20 }, { userId: 'u1', activeCompanyId: 'c1' } as any);
      expect(result.data).toEqual([]);
    });

    it('getLatestScreening returns result', async () => {
      jest.spyOn(service, 'getLatestScreening').mockResolvedValue({ id: 's1', status: 'COMPLETED', createdAt: new Date().toISOString() } as any);
      const result = await controller.getLatestScreening('app-1', { userId: 'u1', activeCompanyId: 'c1' } as any);
      expect(result.id).toBe('s1');
    });

    it('getScreening returns result', async () => {
      jest.spyOn(service, 'getScreening').mockResolvedValue({ id: 's1', status: 'COMPLETED', createdAt: new Date().toISOString() } as any);
      const result = await controller.getScreening('s1', { userId: 'u1', activeCompanyId: 'c1' } as any);
      expect(result.id).toBe('s1');
    });
  });
});
