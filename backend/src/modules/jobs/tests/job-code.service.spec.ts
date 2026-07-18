import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobCodeService } from '../job-code.service';

describe('JobCodeService', () => {
  let service: JobCodeService;
  let prisma: any;

  const mockPrismaService = {
    $transaction: jest.fn(),
    systemMetadata: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    job: {
      findFirst: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobCodeService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<JobCodeService>(JobCodeService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => any) =>
      cb(mockPrismaService),
    );
  });

  // ─── generateCode ──────────────────────────────────────────────────────────────
  describe('generateCode', () => {
    it('should create counter atomically and format JOB-{year}-{seq:05d}', async () => {
      prisma.systemMetadata.findUnique.mockResolvedValue(null);
      prisma.systemMetadata.create.mockResolvedValue({
        key: 'job_code_company-1_2026',
        value: { sequence: 1 },
      });

      const code = await service.generateCode('company-1');

      expect(code).toMatch(/^JOB-2026-00001$/);
      expect(prisma.systemMetadata.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'job_code_company-1_2026',
            value: { sequence: 1 },
          }),
        }),
      );
    });

    it('should increment sequence atomically for subsequent calls', async () => {
      prisma.systemMetadata.findUnique.mockResolvedValue({
        key: 'job_code_company-1_2026',
        value: { sequence: 5 },
      });
      prisma.systemMetadata.update.mockResolvedValue({
        key: 'job_code_company-1_2026',
        value: { sequence: 6 },
      });

      const code = await service.generateCode('company-1');

      expect(code).toBe('JOB-2026-00005');
      expect(prisma.systemMetadata.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'job_code_company-1_2026' },
          data: { value: { sequence: 6 } },
        }),
      );
    });

    it('should pad sequence to 5 digits', async () => {
      prisma.systemMetadata.findUnique.mockResolvedValue({
        key: 'job_code_company-1_2026',
        value: { sequence: 100 },
      });
      prisma.systemMetadata.update.mockResolvedValue({});

      const code = await service.generateCode('company-1');

      expect(code).toBe('JOB-2026-00100');
    });
  });

  // ─── generateSlug ──────────────────────────────────────────────────────────────
  describe('generateSlug', () => {
    it('should generate a URL-safe slug from title', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const slug = await service.generateSlug('company-1', 'Senior Software Engineer');

      expect(slug).toBe('senior-software-engineer');
    });

    it('should handle collisions with numeric suffix', async () => {
      prisma.job.findFirst
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce({ id: 'existing-2' })
        .mockResolvedValueOnce(null);

      const slug = await service.generateSlug('company-1', 'Senior Engineer');

      expect(slug).toBe('senior-engineer-2');
      expect(prisma.job.findFirst).toHaveBeenCalledTimes(3);
    });

    it('should return "job" for titles with no valid characters', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const slug = await service.generateSlug('company-1', '@@@ $$$ %%%');

      expect(slug).toBe('job');
    });

    it('should produce stable slug for same title', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const slug1 = await service.generateSlug('company-1', 'Software Engineer');
      const slug2 = await service.generateSlug('company-1', 'Software Engineer');

      expect(slug1).toBe('software-engineer');
      expect(slug2).toBe('software-engineer');
    });

    it('should strip leading and trailing hyphens', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const slug = await service.generateSlug('company-1', '--Senior Engineer--');

      expect(slug).toBe('senior-engineer');
    });
  });

  // ─── regenerateSlug ────────────────────────────────────────────────────────────
  describe('regenerateSlug', () => {
    it('should regenerate slug excluding current job ID', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const slug = await service.regenerateSlug('company-1', 'Updated Title', 'job-1');

      expect(slug).toBe('updated-title');
      expect(prisma.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'job-1' },
          }),
        }),
      );
    });

    it('should append suffix when slug collides with another job', async () => {
      prisma.job.findFirst.mockResolvedValueOnce({ id: 'job-2' }).mockResolvedValueOnce(null);

      const slug = await service.regenerateSlug('company-1', 'Updated Title', 'job-1');

      expect(slug).toBe('updated-title-1');
    });
  });
});
