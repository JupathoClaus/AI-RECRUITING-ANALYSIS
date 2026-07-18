import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobPublicationsService } from '../job-publications.service';
import { AdapterRegistry } from '../adapters/adapter-registry';
import {
  JobPublicationStatus,
  ExternalPostingProvider,
  JobActivityEventType,
} from '@prisma/client';

describe('JobPublicationsService', () => {
  let service: JobPublicationsService;
  let prisma: any;
  let adapterRegistry: any;

  const mockPrismaService = {
    job: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    jobPublication: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    companySettings: {
      findUnique: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
    jobActivityEvent: {
      create: jest.fn(),
    },
  };

  const mockAdapter = {
    publish: jest.fn(),
    unpublish: jest.fn(),
    validateConfiguration: jest.fn(),
    update: jest.fn(),
    getStatus: jest.fn(),
  };

  const mockAdapterRegistry = {
    get: jest.fn(),
    getAllProviders: jest.fn(),
    has: jest.fn(),
    register: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobPublicationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AdapterRegistry, useValue: mockAdapterRegistry },
      ],
    }).compile();

    service = module.get<JobPublicationsService>(JobPublicationsService);
    prisma = mockPrismaService;
    adapterRegistry = mockAdapterRegistry;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapterRegistry.get.mockReturnValue(mockAdapter);
  });

  // ─── findByJob ─────────────────────────────────────────────────────────────────
  describe('findByJob', () => {
    it('should list publications for a job, tenant filtered', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findMany.mockResolvedValue([
        {
          id: 'pub-1',
          provider: ExternalPostingProvider.COMPANY_CAREERS_PAGE,
          status: JobPublicationStatus.PUBLISHED,
        },
      ]);

      const result = await service.findByJob('company-1', 'job-1');

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe(ExternalPostingProvider.COMPANY_CAREERS_PAGE);
    });

    it('should throw NotFoundException when job is in another company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.findByJob('company-1', 'job-other')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ───────────────────────────────────────────────────────────────────
  describe('publish', () => {
    const dto = { provider: ExternalPostingProvider.COMPANY_CAREERS_PAGE };
    const job = { id: 'job-1', companyId: 'company-1', title: 'Engineer' };

    it('should create QUEUED publication, execute adapter, update to PUBLISHED on success', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue(null);
      prisma.jobPublication.create.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      prisma.companySettings.findUnique.mockResolvedValue({ careersPageEnabled: true });
      prisma.company.findUnique.mockResolvedValue({ slug: 'acme', name: 'Acme' });
      mockAdapter.publish.mockResolvedValue({
        success: true,
        externalPostingId: 'ext-1',
        externalUrl: 'https://careers.acme.com/job-1',
      });
      prisma.jobPublication.update.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.PUBLISHED,
        externalPostingId: 'ext-1',
      });
      prisma.jobPublication.findMany.mockResolvedValue([]);

      const result = await service.publish('company-1', 'job-1', dto, 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.PUBLISHED);
      expect(result.externalPostingId).toBe('ext-1');
      expect(mockAdapter.publish).toHaveBeenCalled();
      expect(prisma.jobPublication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pub-1' },
          data: expect.objectContaining({ status: JobPublicationStatus.PUBLISHED }),
        }),
      );
    });

    it('should update job publicationStatus after successful publish', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue(null);
      prisma.jobPublication.create.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      prisma.companySettings.findUnique.mockResolvedValue({ careersPageEnabled: true });
      prisma.company.findUnique.mockResolvedValue({ slug: 'acme', name: 'Acme' });
      mockAdapter.publish.mockResolvedValue({
        success: true,
        externalPostingId: 'ext-1',
      });
      prisma.jobPublication.update.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.PUBLISHED,
      });
      prisma.jobPublication.findMany.mockResolvedValue([
        { status: JobPublicationStatus.PUBLISHED },
      ]);

      await service.publish('company-1', 'job-1', dto, 'mem-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: { publicationStatus: JobPublicationStatus.PUBLISHED },
        }),
      );
    });

    it('should update to FAILED when adapter publish fails', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue(null);
      prisma.jobPublication.create.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      mockAdapter.publish.mockResolvedValue({
        success: false,
        failureCode: 'AUTH_ERROR',
        failureMessage: 'Invalid credentials',
      });
      prisma.jobPublication.update.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.FAILED,
        failureCode: 'AUTH_ERROR',
      });

      const result = await service.publish('company-1', 'job-1', dto, 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.FAILED);
      expect(result.failureCode).toBe('AUTH_ERROR');
    });

    it('should update to FAILED when adapter throws', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue(null);
      prisma.jobPublication.create.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      mockAdapter.publish.mockRejectedValue(new Error('Network error'));
      prisma.jobPublication.update.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.FAILED,
        failureCode: 'ADAPTER_ERROR',
        failureMessage: 'Network error',
      });

      const result = await service.publish('company-1', 'job-1', dto, 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.FAILED);
      expect(result.failureCode).toBe('ADAPTER_ERROR');
    });

    it('should reject unsupported provider', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      adapterRegistry.get.mockImplementation(() => {
        throw new Error('No adapter registered for provider: UNSUPPORTED');
      });

      await expect(
        service.publish('company-1', 'job-1', { provider: 'UNSUPPORTED' as any }, 'mem-1'),
      ).rejects.toThrow(Error);
    });

    it('should reject already published job on same provider', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.PUBLISHED,
      });

      await expect(service.publish('company-1', 'job-1', dto, 'mem-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject already queued publication on same provider', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });

      await expect(service.publish('company-1', 'job-1', dto, 'mem-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should retry existing failed publication', async () => {
      prisma.job.findFirst.mockResolvedValue(job);
      prisma.jobPublication.findUnique.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.FAILED,
        retryCount: 1,
      });
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      mockAdapter.publish.mockResolvedValue({ success: true, externalPostingId: 'ext-1' });
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.PUBLISHED,
      });
      prisma.jobPublication.findMany.mockResolvedValue([]);

      const result = await service.publish('company-1', 'job-1', dto, 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.PUBLISHED);
      expect(prisma.jobPublication.create).not.toHaveBeenCalled();
    });
  });

  // ─── unpublish ─────────────────────────────────────────────────────────────────
  describe('unpublish', () => {
    it('should update publication to UNPUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findFirst.mockResolvedValue({
        id: 'pub-1',
        jobId: 'job-1',
        provider: ExternalPostingProvider.COMPANY_CAREERS_PAGE,
        externalPostingId: 'ext-1',
        status: JobPublicationStatus.PUBLISHED,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      mockAdapter.unpublish.mockResolvedValue({ success: true });
      prisma.jobPublication.update.mockResolvedValue({
        id: 'pub-1',
        status: JobPublicationStatus.UNPUBLISHED,
      });
      prisma.jobPublication.findMany.mockResolvedValue([]);

      const result = await service.unpublish('company-1', 'job-1', 'pub-1', 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.UNPUBLISHED);
      expect(mockAdapter.unpublish).toHaveBeenCalledWith('ext-1', expect.any(Object));
    });

    it('should throw NotFoundException for missing job', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.unpublish('company-1', 'job-1', 'pub-1', 'mem-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for missing publication', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findFirst.mockResolvedValue(null);

      await expect(service.unpublish('company-1', 'job-1', 'pub-1', 'mem-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── retry ─────────────────────────────────────────────────────────────────────
  describe('retry', () => {
    it('should retry a failed publication', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findFirst.mockResolvedValue({
        id: 'pub-1',
        jobId: 'job-1',
        provider: ExternalPostingProvider.CUSTOM_WEBHOOK,
        externalAccountId: 'https://hook.example.com',
        status: JobPublicationStatus.FAILED,
        retryCount: 2,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      mockAdapter.publish.mockResolvedValue({ success: true, externalPostingId: 'ext-new' });
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.PUBLISHED,
      });
      prisma.jobPublication.findMany.mockResolvedValue([]);

      const result = await service.retry('company-1', 'job-1', 'pub-1', 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.PUBLISHED);
    });

    it('should reject retry of non-failed publication', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findFirst.mockResolvedValue({
        id: 'pub-1',
        jobId: 'job-1',
        status: JobPublicationStatus.PUBLISHED,
      });

      await expect(service.retry('company-1', 'job-1', 'pub-1', 'mem-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle retry failure gracefully', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        deletedAt: null,
      });
      prisma.jobPublication.findFirst.mockResolvedValue({
        id: 'pub-1',
        jobId: 'job-1',
        provider: ExternalPostingProvider.CUSTOM_WEBHOOK,
        status: JobPublicationStatus.FAILED,
      });
      prisma.companySettings.findUnique.mockResolvedValue(null);
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.QUEUED,
      });
      mockAdapter.publish.mockRejectedValue(new Error('Timeout'));
      prisma.jobPublication.update.mockResolvedValueOnce({
        id: 'pub-1',
        status: JobPublicationStatus.FAILED,
        failureCode: 'ADAPTER_ERROR',
        failureMessage: 'Timeout',
      });

      const result = await service.retry('company-1', 'job-1', 'pub-1', 'mem-1');

      expect(result.status).toBe(JobPublicationStatus.FAILED);
    });
  });

  // ─── getSupportedProviders ─────────────────────────────────────────────────────
  describe('getSupportedProviders', () => {
    it('should return list of registered providers', () => {
      mockAdapterRegistry.getAllProviders.mockReturnValue([
        ExternalPostingProvider.COMPANY_CAREERS_PAGE,
        ExternalPostingProvider.CUSTOM_WEBHOOK,
      ]);

      const providers = service.getSupportedProviders();

      expect(providers).toHaveLength(2);
      expect(providers).toContain(ExternalPostingProvider.COMPANY_CAREERS_PAGE);
      expect(providers).toContain(ExternalPostingProvider.CUSTOM_WEBHOOK);
    });

    it('should return empty array when no providers registered', () => {
      mockAdapterRegistry.getAllProviders.mockReturnValue([]);

      const providers = service.getSupportedProviders();

      expect(providers).toHaveLength(0);
    });
  });
});
