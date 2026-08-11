import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateDeduplicationService } from '../candidate-deduplication.service';

describe('CandidateDeduplicationService', () => {
  let service: CandidateDeduplicationService;
  let prisma: any;

  const mockPrismaService = {
    candidate: {
      findMany: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateDeduplicationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CandidateDeduplicationService>(CandidateDeduplicationService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateFingerprint', () => {
    it('should generate consistent fingerprint for same inputs', () => {
      const fp1 = service.calculateFingerprint({
        normalizedEmail: 'john@example.com',
        normalizedPhone: '+15551234567',
        firstName: 'John',
        lastName: 'Doe',
      });
      const fp2 = service.calculateFingerprint({
        normalizedEmail: 'john@example.com',
        normalizedPhone: '+15551234567',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different data', () => {
      const fp1 = service.calculateFingerprint({
        normalizedEmail: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
      const fp2 = service.calculateFingerprint({
        normalizedEmail: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      expect(fp1).not.toBe(fp2);
    });

    it('should return null when no signals available', () => {
      const fp = service.calculateFingerprint({});
      expect(fp).toBeNull();
    });

    it('should include name in fingerprint when both firstName and lastName present', () => {
      const fp = service.calculateFingerprint({
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(fp).not.toBeNull();
    });
  });

  describe('findExactMatches', () => {
    it('should return empty when no conditions', async () => {
      const result = await service.findExactMatches({});
      expect(result).toEqual([]);
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();
    });

    it('should find by normalizedEmail', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'candidate-1' }]);
      const result = await service.findExactMatches({
        normalizedEmail: 'john@example.com',
      });
      expect(result).toHaveLength(1);
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ normalizedEmail: 'john@example.com' }]),
            status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] },
          }),
        }),
      );
    });

    it('should exclude candidateId when provided', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      await service.findExactMatches({
        normalizedEmail: 'john@example.com',
        excludeCandidateId: 'candidate-1',
      });
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'candidate-1' },
          }),
        }),
      );
    });
  });

  describe('findPotentialMatches', () => {
    it('should return empty when no data provided', async () => {
      const result = await service.findPotentialMatches({});
      expect(result).toEqual([]);
    });

    it('should search with name and email', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      await service.findPotentialMatches({
        firstName: 'John',
        lastName: 'Doe',
        normalizedEmail: 'john@example.com',
      });
      expect(prisma.candidate.findMany).toHaveBeenCalled();
    });
  });

  describe('checkBeforeCreate', () => {
    it('should block when exact match found', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          id: 'dup-1',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: new Date(),
          status: 'ACTIVE',
        },
      ]);
      const result = await service.checkBeforeCreate({
        firstName: 'John',
        lastName: 'Doe',
        normalizedEmail: 'john@example.com',
      });
      expect(result.blocked).toBe(true);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchCategory).toBe('EXACT');
    });

    it('should not block when only potential match found', async () => {
      prisma.candidate.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'pot-1',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: new Date(),
          status: 'ACTIVE',
        },
      ]);
      const result = await service.checkBeforeCreate({
        firstName: 'John',
        lastName: 'Doe',
        normalizedEmail: 'john.different@example.com',
      });
      expect(result.blocked).toBe(false);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchCategory).toBe('POSSIBLE');
    });

    it('should return no duplicates when no matches', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      const result = await service.checkBeforeCreate({
        firstName: 'Jane',
        lastName: 'Smith',
        normalizedEmail: 'jane@example.com',
      });
      expect(result.blocked).toBe(false);
      expect(result.duplicates).toHaveLength(0);
    });

    it('should pass excludeCandidateId to findExactMatches', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      await service.checkBeforeCreate({
        firstName: 'John',
        lastName: 'Doe',
        normalizedEmail: 'john@example.com',
        excludeCandidateId: 'self-1',
      });
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'self-1' },
          }),
        }),
      );
    });
  });
});
