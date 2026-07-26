import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiScreeningService } from '../ai-screening.service';
import { MockScreeningProvider } from '../providers/mock-screening.provider';
import { AI_SCREENING_PROVIDER } from '../providers/ai-screening-provider.token';
import { AiScreeningRecommendation, AiScreeningConfidence } from '../domain/screening-recommendation.enum';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../providers/ai-screening-provider.interface';

describe('AiScreeningService', () => {
  let service: AiScreeningService;
  let prisma: any;
  let provider: any;

  const mockCompanyId = 'company-1';
  const mockUserId = 'user-1';
  const mockApplicationId = 'app-1';
  const mockJobId = 'job-1';
  const mockCandidateId = 'cand-1';
  const mockScreeningId = 'screen-1';

  const mockApplication = {
    id: mockApplicationId,
    companyId: mockCompanyId,
    jobId: mockJobId,
    candidateId: mockCandidateId,
    deletedAt: null,
    job: {
      id: mockJobId,
      title: 'Software Engineer',
      description: 'Build and maintain software applications.',
      qualifications: '5+ years experience in software development',
      skills: [
        { importance: 'REQUIRED', skill: { displayName: 'TypeScript' } },
        { importance: 'REQUIRED', skill: { displayName: 'Node.js' } },
        { importance: 'PREFERRED', skill: { displayName: 'React' } },
      ],
      educationRequirements: [{ level: 'BACHELORS', fieldOfStudy: 'Computer Science' }],
      experienceRequirements: [
        { importance: 'REQUIRED', title: 'Software Engineer', minimumYears: 3 },
      ],
    },
    candidate: { id: mockCandidateId, firstName: 'Test', lastName: 'User' },
    resumeFiles: [{ id: 'resume-1', category: 'RESUME', status: 'ACTIVE', deletedAt: null }],
  };

  beforeEach(async () => {
    prisma = {
      application: { findFirst: jest.fn() },
      storedFile: { findUnique: jest.fn() },
      aiScreeningResult: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'app.aiScreeningProvider') return 'mock';
        if (key === 'app.aiScreeningPromptVersion') return 'v1';
        return undefined;
      }),
    };

    provider = new MockScreeningProvider(config as unknown as ConfigService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiScreeningService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AI_SCREENING_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get<AiScreeningService>(AiScreeningService);
  });

  describe('runScreening', () => {
    it('should reject non-existent application', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.runScreening(mockApplicationId, mockCompanyId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject application with missing job description', async () => {
      prisma.application.findFirst.mockResolvedValue({
        ...mockApplication,
        job: { ...mockApplication.job, description: '' },
      });
      await expect(
        service.runScreening(mockApplicationId, mockCompanyId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject application with no resume', async () => {
      prisma.application.findFirst.mockResolvedValue({
        ...mockApplication,
        resumeFiles: [],
      });
      await expect(
        service.runScreening(mockApplicationId, mockCompanyId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cross-company access', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.runScreening(mockApplicationId, 'other-company', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should complete screening successfully with HUMAN_REVIEW when resume text is metadata only', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'resume-1',
        category: 'RESUME',
        originalName: 'resume.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      prisma.aiScreeningResult.create.mockResolvedValue({ id: mockScreeningId });
      prisma.aiScreeningResult.update.mockResolvedValue({});

      const result = await service.runScreening(mockApplicationId, mockCompanyId, mockUserId);
      expect(result).toBeDefined();
      expect(result.recommendation).toBe(AiScreeningRecommendation.HUMAN_REVIEW);
      expect(result.overallScore).toBe(0);
    });

    it('should handle provider failure gracefully', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'resume-1',
        category: 'RESUME',
        originalName: 'resume.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      prisma.aiScreeningResult.create.mockResolvedValue({ id: mockScreeningId });
      prisma.aiScreeningResult.update.mockResolvedValue({});

      const failingProvider = {
        screen: jest.fn().mockRejectedValue(new Error('Provider timeout')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiScreeningService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('mock') },
          },
          { provide: AI_SCREENING_PROVIDER, useValue: failingProvider },
        ],
      }).compile();

      const svc = module.get<AiScreeningService>(AiScreeningService);
      const result = await svc.runScreening(mockApplicationId, mockCompanyId, mockUserId);

      expect(result.recommendation).toBe(AiScreeningRecommendation.HUMAN_REVIEW);
      expect(result.overallScore).toBe(0);
      expect(result.riskFlags).toContain('PROVIDER_ERROR');
    });

    it('should not change application pipeline status', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'resume-1',
        category: 'RESUME',
        originalName: 'resume.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      prisma.aiScreeningResult.create.mockResolvedValue({ id: mockScreeningId });
      prisma.aiScreeningResult.update.mockResolvedValue({});

      const result = await service.runScreening(mockApplicationId, mockCompanyId, mockUserId);

      // Verify no application update was called
      expect(prisma.application.update).toBeUndefined();
      // Verify only screening result was created and updated
      expect(prisma.aiScreeningResult.create).toHaveBeenCalled();
      expect(prisma.aiScreeningResult.update).toHaveBeenCalled();
    });

    it('should persist the screening result', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'resume-1',
        category: 'RESUME',
        originalName: 'resume.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      prisma.aiScreeningResult.create.mockResolvedValue({ id: mockScreeningId });
      prisma.aiScreeningResult.update.mockResolvedValue({});

      await service.runScreening(mockApplicationId, mockCompanyId, mockUserId);

      expect(prisma.aiScreeningResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ applicationId: mockApplicationId }),
        }),
      );
      expect(prisma.aiScreeningResult.update).toHaveBeenCalled();
    });

    it('should preserve previous screening attempts', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'resume-1',
        category: 'RESUME',
        originalName: 'resume.pdf',
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      prisma.aiScreeningResult.create.mockResolvedValue({ id: mockScreeningId });
      prisma.aiScreeningResult.update.mockResolvedValue({});

      await service.runScreening(mockApplicationId, mockCompanyId, mockUserId);
      await service.runScreening(mockApplicationId, mockCompanyId, mockUserId);

      expect(prisma.aiScreeningResult.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('findByApplication', () => {
    it('should reject non-existent application', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.findByApplication(mockApplicationId, mockCompanyId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated results', async () => {
      prisma.application.findFirst.mockResolvedValue({ id: mockApplicationId, companyId: mockCompanyId, deletedAt: null });
      prisma.aiScreeningResult.findMany.mockResolvedValue([{ id: mockScreeningId }]);
      prisma.aiScreeningResult.count.mockResolvedValue(1);

      const result = await service.findByApplication(mockApplicationId, mockCompanyId, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findLatest', () => {
    it('should return latest result', async () => {
      prisma.aiScreeningResult.findFirst.mockResolvedValue({ id: mockScreeningId });
      const result = await service.findLatest(mockApplicationId, mockCompanyId);
      expect(result.id).toBe(mockScreeningId);
    });

    it('should throw if no results', async () => {
      prisma.aiScreeningResult.findFirst.mockResolvedValue(null);
      await expect(
        service.findLatest(mockApplicationId, mockCompanyId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return result by id', async () => {
      prisma.aiScreeningResult.findFirst.mockResolvedValue({ id: mockScreeningId, companyId: mockCompanyId });
      const result = await service.findById(mockScreeningId, mockCompanyId);
      expect(result.id).toBe(mockScreeningId);
    });

    it('should throw for cross-company access', async () => {
      prisma.aiScreeningResult.findFirst.mockResolvedValue(null);
      await expect(
        service.findById(mockScreeningId, 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
