import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningController } from '../ai-screening.controller';
import { AiScreeningService } from '../ai-screening.service';
import { ScreeningInputBuilderService } from '../services/screening-input-builder.service';
import { AI_SCREENING_QUEUE } from '../queue/ai-screening-queue.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

const mockPrismaService = {
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
};

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

const mockReadFile = jest.fn().mockResolvedValue('Parsed resume text.');

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'aiScreening.provider': 'mock',
      'aiScreening.openAiModel': 'gpt-4o-mini',
      'aiScreening.promptVersion': 'v1',
      'aiScreening.schemaVersion': 'v1',
      'aiScreening.workerConcurrency': 3,
      'app.uploadDir': './uploads',
      'app.resumeTextParserSuffix': '_parsed.txt',
    };
    return config[key];
  }),
};

describe('AiScreeningController', () => {
  let controller: AiScreeningController;
  let service: AiScreeningService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockReadFile.mockResolvedValue('Parsed resume text.');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiScreeningController],
      providers: [
        AiScreeningService,
        ScreeningInputBuilderService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken(AI_SCREENING_QUEUE), useValue: mockQueue },
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
    it('returns 202 for newly queued screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        id: 'screen-1',
        applicationId: 'app-1',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      } as any);

      const result = await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER' } as any,
      );

      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.data.status).toBe('PENDING');
    });

    it('returns 200 for reused completed screening', async () => {
      jest.spyOn(service, 'requestScreening').mockResolvedValue({
        id: 'screen-1',
        applicationId: 'app-1',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      } as any);

      const result = await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER' } as any,
      );

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.status).toBe('COMPLETED');
    });

    it('uses user context for tenant scoping', async () => {
      const spy = jest.spyOn(service, 'requestScreening').mockResolvedValue({
        id: 'screen-1', applicationId: 'app-1', status: 'PENDING', createdAt: new Date().toISOString(),
      } as any);

      await controller.requestScreening(
        'app-1',
        { forceRerun: false },
        { userId: 'user-1', activeCompanyId: 'company-1', role: 'HR_MANAGER' } as any,
      );

      expect(spy).toHaveBeenCalledWith('app-1', 'company-1', 'user-1', false);
    });
  });

  describe('GET applications/:applicationId/ai-screenings', () => {
    it('returns paginated list', async () => {
      jest.spyOn(service, 'listScreenings').mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const result = await controller.listScreenings(
        'app-1',
        { page: 1, limit: 20 },
        { userId: 'user-1', activeCompanyId: 'company-1' } as any,
      );

      expect(result.data).toEqual([]);
    });
  });

  describe('GET applications/:applicationId/ai-screenings/latest', () => {
    it('returns latest screening', async () => {
      jest.spyOn(service, 'getLatestScreening').mockResolvedValue({
        id: 'screen-1', status: 'COMPLETED', createdAt: new Date().toISOString(),
      } as any);

      const result = await controller.getLatestScreening(
        'app-1',
        { userId: 'user-1', activeCompanyId: 'company-1' } as any,
      );

      expect(result.id).toBe('screen-1');
    });
  });

  describe('GET ai-screenings/:screeningId', () => {
    it('returns specific screening', async () => {
      jest.spyOn(service, 'getScreening').mockResolvedValue({
        id: 'screen-1', status: 'COMPLETED', createdAt: new Date().toISOString(),
      } as any);

      const result = await controller.getScreening(
        'screen-1',
        { userId: 'user-1', activeCompanyId: 'company-1' } as any,
      );

      expect(result.id).toBe('screen-1');
    });
  });
});
