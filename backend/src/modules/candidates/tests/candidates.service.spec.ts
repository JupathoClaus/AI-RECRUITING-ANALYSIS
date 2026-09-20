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
      findFirst: jest.fn(),
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
    application: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    // Phase 2.2 — auto CompanyCandidate on create
    companyCandidate: {
      upsert: jest.fn().mockResolvedValue({ id: 'cc-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn) =>
      fn({
        candidate: mockPrismaService.candidate,
        application: mockPrismaService.application,
        companyCandidate: mockPrismaService.companyCandidate,
      }),
    ),
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
        {
          ...baseCandidate,
          id: 'candidate-1',
          applications: [{ id: 'app-1', status: 'SUBMITTED' }],
        },
        {
          ...baseCandidate,
          id: 'candidate-2',
          applications: [{ id: 'app-2', status: 'INTERVIEW' }],
        },
      ]);
      prisma.candidate.count.mockResolvedValue(2);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          applicationId: 'app-2',
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
            applicationId: { in: ['app-1', 'app-2'] },
          }),
        }),
      );
    });

    it('attaches the screening summary to the mapped candidate response', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          ...baseCandidate,
          id: 'candidate-1',
          applications: [{ id: 'app-1', status: 'SUBMITTED' }],
        },
      ]);
      prisma.candidate.count.mockResolvedValue(1);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          applicationId: 'app-1',
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
      prisma.candidate.findMany.mockResolvedValue([
        {
          ...baseCandidate,
          id: 'candidate-1',
          applications: [{ id: 'app-1', status: 'SUBMITTED' }],
        },
      ]);
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

    it('filters candidates by the jobId of their current application', async () => {
      prisma.application.findMany
        .mockResolvedValueOnce([
          { candidateId: 'c-1', jobId: 'job-1', status: 'SUBMITTED' },
          { candidateId: 'c-2', jobId: 'job-2', status: 'INTERVIEW' },
        ])
        .mockResolvedValueOnce([
          { candidateId: 'c-1', jobId: 'job-1', status: 'SUBMITTED' },
          { candidateId: 'c-2', jobId: 'job-2', status: 'INTERVIEW' },
        ]);
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'c-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, jobId: 'job-1' }, false, 'company-1');

      expect(prisma.application.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1', deletedAt: null }),
          distinct: ['candidateId'],
        }),
      );
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ id: { in: ['c-1'] } }),
            ]),
          }),
        }),
      );
    });

    it('filters candidates by the status of their current application', async () => {
      prisma.application.findMany
        .mockResolvedValueOnce([{ candidateId: 'c-1', jobId: 'job-1', status: 'INTERVIEW' }])
        .mockResolvedValueOnce([{ candidateId: 'c-1', jobId: 'job-1', status: 'INTERVIEW' }]);
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'c-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll(
        { page: 1, limit: 20, applicationStatus: ['INTERVIEW'] },
        false,
        'company-1',
      );

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ id: { in: ['c-1'] } }),
            ]),
          }),
        }),
      );
    });

    it('returns an empty page early when no current application matches', async () => {
      prisma.application.findMany
        .mockResolvedValueOnce([{ candidateId: 'c-1', jobId: 'job-1', status: 'SUBMITTED' }])
        .mockResolvedValueOnce([{ candidateId: 'c-1', jobId: 'job-1', status: 'SUBMITTED' }]);

      const result = await service.findAll(
        { page: 1, limit: 20, jobId: 'job-404' },
        false,
        'company-1',
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();
      expect(prisma.candidate.count).not.toHaveBeenCalled();
    });

    it('filters candidates by minimum company rating', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'c-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, minRating: 4 }, false, 'company-1');

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                companyCandidates: {
                  some: { companyId: 'company-1', deletedAt: null, rating: { gte: 4 } },
                },
              }),
            ]),
          }),
        }),
      );
    });

    it('filters candidates by an exact rating', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'c-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, exactRating: 5 }, false, 'company-1');

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                companyCandidates: {
                  some: { companyId: 'company-1', deletedAt: null, rating: { equals: 5 } },
                },
              }),
            ]),
          }),
        }),
      );
    });

    it('filters candidates that are unrated (null or zero rating)', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ ...baseCandidate, id: 'c-1' }]);
      prisma.candidate.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, unrated: true }, false, 'company-1');

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                companyCandidates: {
                  some: {
                    companyId: 'company-1',
                    deletedAt: null,
                    OR: [{ rating: null }, { rating: 0 }],
                  },
                },
              }),
            ]),
          }),
        }),
      );
    });
  });

  // ─── getScreeningScoreSummary ──────────────────────────────────────────────────
  describe('getScreeningScoreSummary', () => {
    function makeCandidateRow(id: string) {
      return {
        id,
        firstName: `First${id}`,
        lastName: `Last${id}`,
        currentJobTitle: 'Engineer',
      };
    }

    it('fails closed without an active company context', async () => {
      await expect(service.getScreeningScoreSummary()).rejects.toThrow(BadRequestException);
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty summary for a company without candidates', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result).toEqual({
        totalCandidates: 0,
        scoredCandidates: 0,
        averageScore: null,
        topCandidates: [],
      });
      expect(prisma.application.findMany).not.toHaveBeenCalled();
      expect(prisma.aiScreeningResult.findMany).not.toHaveBeenCalled();
    });

    it('aggregates the latest completed score across more than 50 candidates', async () => {
      const candidateCount = 120;
      const candidates = Array.from({ length: candidateCount }, (_, i) =>
        makeCandidateRow(`candidate-${i}`),
      );
      prisma.candidate.findMany.mockResolvedValue(candidates);
      prisma.application.findMany.mockResolvedValue(
        candidates.map((c) => ({
          id: `app-${c.id}`,
          candidateId: c.id,
          status: 'SCREENING',
          job: { title: 'Engineer' },
        })),
      );
      // Latest row per candidate is COMPLETED with score 40 + (i % 60):
      // average = 40 + mean(0..59) = 40 + 29.5 = 69.5 -> rounds to 70.
      // Each candidate also has an older FAILED row that must not contribute.
      prisma.aiScreeningResult.findMany.mockResolvedValue(
        candidates.flatMap((c, i) => [
          {
            id: `res-new-${c.id}`,
            applicationId: `app-${c.id}`,
            candidateId: c.id,
            status: 'COMPLETED',
            overallScore: 40 + (i % 60),
            recommendation: 'SHORTLIST',
            confidence: 'HIGH',
            completedAt: new Date('2026-01-02'),
            createdAt: new Date('2026-01-02'),
          },
          {
            id: `res-old-${c.id}`,
            applicationId: `app-${c.id}`,
            candidateId: c.id,
            status: 'FAILED',
            overallScore: null,
            recommendation: null,
            confidence: null,
            completedAt: null,
            createdAt: new Date('2026-01-01'),
          },
        ]),
      );

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.totalCandidates).toBe(120);
      expect(result.scoredCandidates).toBe(120);
      expect(result.averageScore).toBe(70);
      expect(result.topCandidates).toHaveLength(5);
      // Deterministic top-5: highest scores first (99 from candidates 59 and 119).
      expect(result.topCandidates[0].overallScore).toBe(99);
      expect(result.topCandidates.map((t) => t.overallScore)).toEqual([99, 99, 98, 98, 97]);
      // Scoped to the tenant in every query.
      const candidateCall = prisma.candidate.findMany.mock.calls[0][0];
      expect(candidateCall.where.AND).toEqual(
        expect.arrayContaining([
          { companyCandidates: { some: { companyId: 'company-1', deletedAt: null } } },
        ]),
      );
      expect(prisma.aiScreeningResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1' }),
        }),
      );
    });

    it('excludes candidates without a completed screening from the average', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        makeCandidateRow('candidate-1'),
        makeCandidateRow('candidate-2'),
        makeCandidateRow('candidate-3'),
      ]);
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          candidateId: 'candidate-1',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
        {
          id: 'app-2',
          candidateId: 'candidate-2',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
        {
          id: 'app-3',
          candidateId: 'candidate-3',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
      ]);
      // Only candidate-1 and candidate-3 have a completed score.
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          applicationId: 'app-1',
          candidateId: 'candidate-1',
          status: 'COMPLETED',
          overallScore: 80,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'res-3',
          applicationId: 'app-3',
          candidateId: 'candidate-3',
          status: 'COMPLETED',
          overallScore: 60,
          recommendation: 'SHORTLIST',
          confidence: 'MEDIUM',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.totalCandidates).toBe(3);
      expect(result.scoredCandidates).toBe(2);
      expect(result.averageScore).toBe(70);
      expect(result.topCandidates.map((t) => t.candidateId)).toEqual([
        'candidate-1',
        'candidate-3',
      ]);
      expect(result.topCandidates[0]).toEqual(
        expect.objectContaining({
          displayName: 'Firstcandidate-1 Lastcandidate-1',
          currentJobTitle: 'Engineer',
          jobTitle: 'Engineer',
          status: 'SCREENING',
          overallScore: 80,
        }),
      );
    });

    it('preserves a real score of 0 in the average and top candidates', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        makeCandidateRow('candidate-1'),
        makeCandidateRow('candidate-2'),
      ]);
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          candidateId: 'candidate-1',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
        {
          id: 'app-2',
          candidateId: 'candidate-2',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
      ]);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          applicationId: 'app-1',
          candidateId: 'candidate-1',
          status: 'COMPLETED',
          overallScore: 0,
          recommendation: 'NOT_SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'res-2',
          applicationId: 'app-2',
          candidateId: 'candidate-2',
          status: 'COMPLETED',
          overallScore: 100,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.scoredCandidates).toBe(2);
      expect(result.averageScore).toBe(50);
      expect(result.topCandidates.map((t) => t.overallScore)).toEqual([100, 0]);
    });

    it('returns a null average when no candidate has a completed screening', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        makeCandidateRow('candidate-1'),
        makeCandidateRow('candidate-2'),
      ]);
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          candidateId: 'candidate-1',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
        {
          id: 'app-2',
          candidateId: 'candidate-2',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
      ]);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-1',
          applicationId: 'app-1',
          candidateId: 'candidate-1',
          status: 'FAILED',
          overallScore: null,
          recommendation: null,
          confidence: null,
          completedAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.totalCandidates).toBe(2);
      expect(result.scoredCandidates).toBe(0);
      expect(result.averageScore).toBeNull();
      expect(result.topCandidates).toEqual([]);
    });

    it('uses the current non-terminal application per candidate', async () => {
      prisma.candidate.findMany.mockResolvedValue([makeCandidateRow('candidate-1')]);
      prisma.application.findMany.mockResolvedValue([
        { id: 'app-hired', candidateId: 'candidate-1', status: 'HIRED', job: { title: 'Old Job' } },
        {
          id: 'app-current',
          candidateId: 'candidate-1',
          status: 'INTERVIEW',
          job: { title: 'Current Job' },
        },
      ]);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-current',
          applicationId: 'app-current',
          candidateId: 'candidate-1',
          status: 'COMPLETED',
          overallScore: 90,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.scoredCandidates).toBe(1);
      expect(result.averageScore).toBe(90);
      expect(result.topCandidates[0].jobTitle).toBe('Current Job');
      expect(prisma.aiScreeningResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            applicationId: { in: ['app-current'] },
          }),
        }),
      );
    });

    it('excludes hired/rejected candidates from top candidates but keeps their score in the average', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        makeCandidateRow('candidate-hired'),
        makeCandidateRow('candidate-active'),
      ]);
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-hired',
          candidateId: 'candidate-hired',
          status: 'HIRED',
          job: { title: 'Old Job' },
        },
        {
          id: 'app-active',
          candidateId: 'candidate-active',
          status: 'SCREENING',
          job: { title: 'Engineer' },
        },
      ]);
      prisma.aiScreeningResult.findMany.mockResolvedValue([
        {
          id: 'res-hired',
          applicationId: 'app-hired',
          candidateId: 'candidate-hired',
          status: 'COMPLETED',
          overallScore: 95,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'res-active',
          applicationId: 'app-active',
          candidateId: 'candidate-active',
          status: 'COMPLETED',
          overallScore: 70,
          recommendation: 'SHORTLIST',
          confidence: 'HIGH',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.getScreeningScoreSummary('company-1');

      expect(result.scoredCandidates).toBe(2);
      expect(result.averageScore).toBe(83); // (95 + 70) / 2 rounds to 83
      expect(result.topCandidates).toHaveLength(1);
      expect(result.topCandidates[0].candidateId).toBe('candidate-active');
      expect(result.topCandidates[0].overallScore).toBe(70);
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

  // ─── deleteCandidate ──────────────────────────────────────────────────────────
  describe('deleteCandidate', () => {
    it('should soft-delete an active candidate and its applications', async () => {
      prisma.candidate.findFirst.mockResolvedValue(baseCandidate);
      prisma.candidate.update.mockResolvedValue({
        ...baseCandidate,
        status: 'DELETED',
        version: 2,
        deletedAt: new Date(),
      });
      prisma.application.updateMany.mockResolvedValue({ count: 1 });
      prisma.companyCandidate.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteCandidate(
        'candidate-1',
        1,
        'Removed by HR',
        'user-1',
        'mem-1',
        'company-1',
        'req-1',
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ status: 'DELETED', version: 2 }),
        }),
      );
      expect(prisma.application.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', candidateId: 'candidate-1', deletedAt: null },
        }),
      );
      expect(prisma.companyCandidate.updateMany).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CANDIDATE_DELETED' }),
      );
      expect(result.deleted).toBe(true);
    });

    it('should return 404 when the candidate is not linked to the company (tenant isolation)', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteCandidate('candidate-1', 1, undefined, 'u', 'm', 'company-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });

    it('should be idempotent for an already-deleted candidate', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        ...baseCandidate,
        status: 'DELETED',
        deletedAt: new Date(),
      });
      const result = await service.deleteCandidate(
        'candidate-1',
        1,
        undefined,
        'u',
        'm',
        'company-1',
      );
      expect(result).toEqual({ deleted: true, status: 'already_deleted' });
      expect(prisma.candidate.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('should reject deleting a merged or anonymized candidate', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ ...baseCandidate, status: 'MERGED' });
      await expect(
        service.deleteCandidate('candidate-1', 1, undefined, 'u', 'm', 'company-1'),
      ).rejects.toThrow(BadRequestException);
      prisma.candidate.findFirst.mockResolvedValue({ ...baseCandidate, status: 'ANONYMIZED' });
      await expect(
        service.deleteCandidate('candidate-1', 1, undefined, 'u', 'm', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject on stale version', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ ...baseCandidate, version: 5 });
      await expect(
        service.deleteCandidate('candidate-1', 1, undefined, 'u', 'm', 'company-1'),
      ).rejects.toThrow(ConflictException);
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
