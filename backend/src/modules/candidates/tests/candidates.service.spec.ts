import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidatesService } from '../candidates.service';
import { CandidateAuditService } from '../candidate-audit.service';
import { CandidateDeduplicationService } from '../candidate-deduplication.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { mapCandidateToResponse as mapCandidateToResponseImpl } from '../mappers/candidate.mapper';

const mapCandidateToResponse = jest.mocked(mapCandidateToResponseImpl);

jest.mock('../mappers/candidate.mapper', () => ({
  mapCandidateToResponse: jest.fn((candidate) => ({
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    displayName: `${candidate.firstName} ${candidate.lastName}`,
    status: candidate.status,
    version: candidate.version,
    skills: candidate.skills || [],
    languages: candidate.languages || [],
  })),
  mapCandidateToDetail: jest.fn((candidate) => ({
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    displayName: `${candidate.firstName} ${candidate.lastName}`,
    status: candidate.status,
    version: candidate.version,
    skills: candidate.skills || [],
    languages: candidate.languages || [],
    employment: [],
    education: [],
    certifications: [],
    consents: [],
    mergeStatus: null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  })),
}));

describe('CandidatesService', () => {
  let service: CandidatesService;
  let prisma: any;
  let auditService: any;
  let dedupService: any;

  const mockPrismaService = {
    candidate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    candidateAuditEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    aiScreeningResult: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Phase 2.2 — auto CompanyCandidate on create
    companyCandidate: {
      upsert: jest.fn().mockResolvedValue({ id: 'cc-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockAuditService = {
    record: jest.fn(),
  };

  const mockDedupService = {
    checkBeforeCreate: jest.fn(),
    calculateFingerprint: jest.fn(),
  };

  const mockIdempotencyService = {
    claim: jest.fn(),
    getRecord: jest.fn(),
  };

  const baseCandidate = {
    id: 'candidate-1',
    firstName: 'John',
    middleName: null,
    lastName: 'Doe',
    email: 'john@example.com',
    normalizedEmail: 'john@example.com',
    phone: '+15551234567',
    normalizedPhone: '+15551234567',
    city: 'New York',
    stateOrProvince: 'NY',
    countryCode: 'US',
    headline: 'Senior Engineer',
    summary: 'Experienced engineer',
    currentJobTitle: 'Engineer',
    currentEmployer: 'Acme',
    totalExperienceYears: 10,
    preferredLocale: 'en',
    timezone: 'UTC',
    status: 'ACTIVE',
    source: 'RECRUITER_CREATED',
    version: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    skills: [],
    languages: [],
    employmentRecords: [],
    educationRecords: [],
    certifications: [],
    consents: [],
    mergeRecordsAsPrimary: [],
    duplicateFingerprint: 'abc123',
    deletedAt: null,
    anonymizedAt: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CandidateAuditService, useValue: mockAuditService },
        {
          provide: CandidateDeduplicationService,
          useValue: mockDedupService,
        },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
    prisma = mockPrismaService;
    auditService = mockAuditService;
    dedupService = mockDedupService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1-555-123-4567',
      source: 'RECRUITER_CREATED' as const,
      skills: [{ skillId: 'skill-1' }],
      languages: [{ languageCode: 'en', proficiency: 'NATIVE' as const }],
    };

    it('should create a candidate with skills, languages, and audit event', async () => {
      dedupService.checkBeforeCreate.mockResolvedValue({
        blocked: false,
        duplicates: [],
      });
      dedupService.calculateFingerprint.mockReturnValue('fingerprint-1');
      prisma.candidate.create.mockResolvedValue(baseCandidate);

      const result = await service.create(createDto, 'user-1', 'mem-1', 'company-1', 'req-1');

      expect(dedupService.checkBeforeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedEmail: 'john@example.com',
          normalizedPhone: expect.stringMatching(/^\+15551234567$/),
        }),
      );
      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'John',
            lastName: 'Doe',
            skills: expect.objectContaining({
              create: expect.arrayContaining([expect.objectContaining({ skillId: 'skill-1' })]),
            }),
            languages: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ languageCode: 'en', proficiency: 'NATIVE' }),
              ]),
            }),
          }),
          include: expect.objectContaining({
            skills: expect.anything(),
            languages: expect.anything(),
          }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: baseCandidate.id,
          eventType: 'CANDIDATE_CREATED',
          description: expect.stringContaining('John Doe'),
          actorUserId: 'user-1',
          actorMembershipId: 'mem-1',
          companyId: 'company-1',
          requestId: 'req-1',
        }),
      );
      expect(result!.id).toBe(baseCandidate.id);
    });

    it('should reject when neither email nor phone provided', async () => {
      await expect(
        service.create({
          firstName: 'John',
          lastName: 'Doe',
          source: 'RECRUITER_CREATED' as const,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject exact duplicate', async () => {
      dedupService.checkBeforeCreate.mockResolvedValue({
        blocked: true,
        duplicates: [
          {
            candidateId: 'dup-1',
            matchCategory: 'EXACT',
            reasons: ['Same email as existing candidate'],
            displayName: 'John Doe',
          },
        ],
      });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should reject when salary max is less than salary min', async () => {
      dedupService.checkBeforeCreate.mockResolvedValue({
        blocked: false,
        duplicates: [],
      });
      dedupService.calculateFingerprint.mockReturnValue('fp');

      await expect(
        service.create({
          ...createDto,
          salaryExpectationMin: 100000,
          salaryExpectationMax: 80000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated results', async () => {
      prisma.candidate.findMany.mockResolvedValue([baseCandidate]);
      prisma.candidate.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, false);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by search, status, source, skillId, and city', async () => {
      prisma.candidate.findMany.mockResolvedValue([baseCandidate]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll(
        {
          page: 1,
          limit: 20,
          search: 'John',
          status: ['ACTIVE'],
          source: ['RECRUITER_CREATED'],
          skillId: 'skill-1',
          city: 'New York',
        },
        false,
      );

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { firstName: { contains: 'John', mode: 'insensitive' } },
                ]),
              }),
              { status: { in: ['ACTIVE'] } },
              { source: { in: ['RECRUITER_CREATED'] } },
              { skills: { some: { skillId: 'skill-1' } } },
              { city: { contains: 'New York', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should exclude merged, deleted, anonymized by default', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll({}, false);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] },
          }),
        }),
      );
    });

    it('should allow sorting by allowed fields', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'lastName', sortOrder: 'asc' }, false);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { lastName: 'asc' },
        }),
      );
    });

    it('should default to createdAt desc for invalid sortBy', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'invalidField' as any, sortOrder: 'desc' }, false);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('fetches screening summaries with a single tenant-scoped query (no N+1)', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        { ...baseCandidate, id: 'candidate-1' },
        { ...baseCandidate, id: 'candidate-2' },
      ]);
      prisma.candidate.count.mockResolvedValue(2);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          candidateId: 'candidate-2',
          status: 'COMPLETED',
          overallScore: 84,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      await service.findAll({ page: 1, limit: 20 }, false, 'company-1');

      // exactly one screening query for all listed candidates, scoped to the tenant
      expect(prisma.aiScreeningResult.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.aiScreeningResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            candidateId: { in: ['candidate-1', 'candidate-2'] },
          }),
        }),
      );
    });

    it('attaches the screening summary to the mapped candidate response', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'candidate-1' }]);
      prisma.candidate.count.mockResolvedValue(1);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          candidateId: 'candidate-1',
          status: 'COMPLETED',
          overallScore: 92,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      mapCandidateToResponse.mockClear();

      await service.findAll({ page: 1, limit: 20 }, false, 'company-1');

      const mapperCall = mapCandidateToResponse.mock.calls[0][0];
      expect(mapperCall.screeningSummary).toEqual({
        status: 'COMPLETED',
        overallScore: 92,
        recommendation: 'SHORTLIST',
        confidence: 'HIGH',
        resultId: 'res-1',
        completedAt: expect.any(String),
        pendingRerun: false,
        failedRerun: false,
      });
    });

    it('passes a null screening summary when the candidate was never screened', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'candidate-1' }]);
      prisma.candidate.count.mockResolvedValue(1);
      prisma.aiScreeningResult.findMany.mockResolvedValue([]);

      mapCandidateToResponse.mockClear();

      await service.findAll({ page: 1, limit: 20 }, false, 'company-1');

      expect(mapCandidateToResponse.mock.calls[0][0].screeningSummary).toBeNull();
    });

    it('does not query screening results without a company scope', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'candidate-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20 }, false);

      expect(prisma.aiScreeningResult.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('should return candidate detail', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);

      const result = await service.findById('candidate-1', false);

      expect(result.id).toBe('candidate-1');
      expect(prisma.candidate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          include: expect.objectContaining({
            skills: expect.anything(),
            employmentRecords: expect.anything(),
            educationRecords: expect.anything(),
            certifications: expect.anything(),
            languages: expect.anything(),
            consents: expect.anything(),
            mergeRecordsAsPrimary: expect.anything(),
          }),
        }),
      );
    });

    it('should throw NotFoundException for deleted candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'DELETED',
      });

      await expect(service.findById('candidate-1', false)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for anonymized candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'ANONYMIZED',
      });

      await expect(service.findById('candidate-1', false)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent', false)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      firstName: 'Jane',
      expectedVersion: 1,
    };

    it('should update fields and record audit event', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);
      dedupService.calculateFingerprint.mockReturnValue('new-fingerprint');
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        firstName: 'Jane',
        version: 2,
      });

      const result = await service.update(
        'candidate-1',
        updateDto,
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({
            firstName: 'Jane',
            version: 2,
          }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CANDIDATE_UPDATED',
          actorUserId: 'user-1',
        }),
      );
      expect(result.firstName).toBe('Jane');
    });

    it('should reject stale version', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        version: 2,
      });

      await expect(service.update('candidate-1', { expectedVersion: 1 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject duplicate contact on email change', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);
      dedupService.checkBeforeCreate.mockResolvedValue({
        blocked: true,
        duplicates: [{ candidateId: 'dup-1', matchCategory: 'EXACT' }],
      });

      await expect(
        service.update('candidate-1', { email: 'other@example.com', expectedVersion: 1 }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject merged candidate update', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'MERGED',
      });

      await expect(service.update('candidate-1', { expectedVersion: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── archive ───────────────────────────────────────────────────────────────────
  describe('archive', () => {
    it('should archive an active candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        status: 'INACTIVE',
        version: 2,
        deletedAt: new Date(),
      });

      const result = await service.archive(
        'candidate-1',
        1,
        'No longer needed',
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ status: 'INACTIVE', version: 2 }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CANDIDATE_ARCHIVED' }),
      );
      expect(result.archived).toBe(true);
    });

    it('should reject archiving a merged candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'MERGED',
      });

      await expect(service.archive('candidate-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject archiving a deleted candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'DELETED',
      });

      await expect(service.archive('candidate-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('should be idempotent for already archived candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'INACTIVE',
      });

      const result = await service.archive('candidate-1', 1);

      expect(result).toEqual({ archived: true, status: 'already_archived' });
      expect(prisma.candidate.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  // ─── restore ───────────────────────────────────────────────────────────────────
  describe('restore', () => {
    it('should restore an archived candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'INACTIVE',
      });
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        status: 'ACTIVE',
        version: 2,
        deletedAt: null,
      });

      const result = await service.restore(
        'candidate-1',
        1,
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ status: 'ACTIVE', version: 2 }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CANDIDATE_RESTORED' }),
      );
      expect(result.restored).toBe(true);
    });

    it('should reject restoring a merged candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'MERGED',
      });

      await expect(service.restore('candidate-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject restoring an anonymized candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'ANONYMIZED',
      });

      await expect(service.restore('candidate-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('should be idempotent for already active candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);

      const result = await service.restore('candidate-1', 1);

      expect(result).toEqual({ restored: true, status: 'already_active' });
      expect(prisma.candidate.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  // ─── block ─────────────────────────────────────────────────────────────────────
  describe('block', () => {
    it('should block a candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        status: 'BLOCKED',
        version: 2,
      });

      const result = await service.block(
        'candidate-1',
        'SPAM',
        'Spam submission',
        1,
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ status: 'BLOCKED', version: 2 }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CANDIDATE_BLOCKED',
          metadata: expect.objectContaining({ reasonCode: 'SPAM', reason: 'Spam submission' }),
        }),
      );
      expect(result.blocked).toBe(true);
    });

    it('should reject blocking a merged candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'MERGED',
      });

      await expect(service.block('candidate-1', 'SPAM', 'Spam', 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject blocking a deleted candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'DELETED',
      });

      await expect(service.block('candidate-1', 'SPAM', 'Spam', 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── unblock ───────────────────────────────────────────────────────────────────
  describe('unblock', () => {
    it('should unblock a blocked candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        ...baseCandidate,
        status: 'BLOCKED',
      });
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        status: 'ACTIVE',
        version: 2,
      });

      const result = await service.unblock(
        'candidate-1',
        1,
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ status: 'ACTIVE', version: 2 }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CANDIDATE_UNBLOCKED' }),
      );
      expect(result.unblocked).toBe(true);
    });

    it('should be idempotent for non-blocked candidate', async () => {
      prisma.candidate.findUnique.mockResolvedValue(baseCandidate);

      const result = await service.unblock('candidate-1', 1);

      expect(result).toEqual({ unblocked: true, status: 'not_blocked' });
      expect(prisma.candidate.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  // ─── getActivity ───────────────────────────────────────────────────────────────
  describe('getActivity', () => {
    it('should return paginated audit events', async () => {
      const auditEvents = [
        { id: 'event-1', eventType: 'CANDIDATE_CREATED', occurredAt: new Date() },
        { id: 'event-2', eventType: 'CANDIDATE_UPDATED', occurredAt: new Date() },
      ];
      prisma.candidateAuditEvent.findMany.mockResolvedValue(auditEvents);
      prisma.candidateAuditEvent.count.mockResolvedValue(2);

      const result = await service.getActivity('candidate-1', 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(prisma.candidateAuditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: 'candidate-1' },
          skip: 0,
          take: 20,
          orderBy: { occurredAt: 'desc' },
        }),
      );
    });

    it('should filter by eventType when provided', async () => {
      prisma.candidateAuditEvent.findMany.mockResolvedValue([]);
      prisma.candidateAuditEvent.count.mockResolvedValue(0);

      await service.getActivity('candidate-1', 1, 20, 'CANDIDATE_CREATED');

      expect(prisma.candidateAuditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: 'candidate-1', eventType: 'CANDIDATE_CREATED' },
        }),
      );
    });
  });
});
