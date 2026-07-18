import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { CompanyCandidateStatus, CandidateSource } from '@prisma/client';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const CANDIDATE_ID = 'cand-1';

describe('CompanyCandidateService', () => {
  let service: CompanyCandidateService;
  let prisma: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      companyCandidate: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      companyMembership: { findFirst: jest.fn() },
      candidate: { findUnique: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    auditService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyCandidateService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApplicationAuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<CompanyCandidateService>(CompanyCandidateService);
  });

  describe('linkCandidate', () => {
    it('throws ConflictException if candidate already linked', async () => {
      prisma.companyCandidate.findUnique.mockResolvedValue({ id: 'cc-1', deletedAt: null });
      await expect(
        service.linkCandidate(
          CANDIDATE_ID,
          COMPANY_A,
          { source: CandidateSource.RECRUITER_CREATED },
          'u1',
          'm1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if candidate does not exist', async () => {
      prisma.companyCandidate.findUnique.mockResolvedValue(null);
      prisma.candidate.findUnique.mockResolvedValue(null);
      await expect(
        service.linkCandidate(
          CANDIDATE_ID,
          COMPANY_A,
          { source: CandidateSource.RECRUITER_CREATED },
          'u1',
          'm1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a new CompanyCandidate for a valid candidate', async () => {
      prisma.companyCandidate.findUnique.mockResolvedValue(null);
      prisma.candidate.findUnique.mockResolvedValue({
        id: CANDIDATE_ID,
        source: CandidateSource.RECRUITER_CREATED,
      });
      prisma.companyCandidate.upsert.mockResolvedValue({
        id: 'cc-1',
        companyId: COMPANY_A,
        candidateId: CANDIDATE_ID,
      });
      const result = await service.linkCandidate(
        CANDIDATE_ID,
        COMPANY_A,
        { source: CandidateSource.RECRUITER_CREATED },
        'u1',
        'm1',
      );
      expect(result.companyId).toBe(COMPANY_A);
    });

    it('same candidate can be linked to two different companies', async () => {
      prisma.candidate.findUnique.mockResolvedValue({
        id: CANDIDATE_ID,
        source: CandidateSource.RECRUITER_CREATED,
      });
      prisma.companyCandidate.findUnique.mockResolvedValue(null);
      prisma.companyCandidate.upsert
        .mockResolvedValueOnce({ id: 'cc-a', companyId: COMPANY_A, candidateId: CANDIDATE_ID })
        .mockResolvedValueOnce({ id: 'cc-b', companyId: COMPANY_B, candidateId: CANDIDATE_ID });

      const resultA = await service.linkCandidate(
        CANDIDATE_ID,
        COMPANY_A,
        { source: CandidateSource.RECRUITER_CREATED },
        'u1',
        'm1',
      );
      const resultB = await service.linkCandidate(
        CANDIDATE_ID,
        COMPANY_B,
        { source: CandidateSource.RECRUITER_CREATED },
        'u2',
        'm2',
      );

      expect(resultA.companyId).toBe(COMPANY_A);
      expect(resultB.companyId).toBe(COMPANY_B);
    });
  });

  describe('archive', () => {
    it('archives at company level without changing global candidate', async () => {
      prisma.companyCandidate.findFirst.mockResolvedValue({
        id: 'cc-1',
        companyId: COMPANY_A,
        candidateId: CANDIDATE_ID,
        status: CompanyCandidateStatus.ACTIVE,
        version: 1,
      });
      prisma.companyCandidate.update.mockResolvedValue({
        id: 'cc-1',
        status: CompanyCandidateStatus.ARCHIVED,
        version: 2,
      });
      const result = await service.archive(CANDIDATE_ID, COMPANY_A, 1, 'test', 'u1', 'm1');
      expect(result.archived).toBe(true);
      // candidate.update should NOT be called
      expect(prisma.candidate?.update).toBeUndefined();
    });

    it('throws ConflictException on stale version during archive', async () => {
      prisma.companyCandidate.findFirst.mockResolvedValue({
        id: 'cc-1',
        companyId: COMPANY_A,
        status: CompanyCandidateStatus.ACTIVE,
        version: 5,
      });
      await expect(service.archive(CANDIDATE_ID, COMPANY_A, 1)).rejects.toThrow(ConflictException);
    });
  });

  describe('restore', () => {
    it('restores company-level archived candidate', async () => {
      prisma.companyCandidate.findFirst.mockResolvedValue({
        id: 'cc-1',
        companyId: COMPANY_A,
        candidateId: CANDIDATE_ID,
        status: CompanyCandidateStatus.ARCHIVED,
        version: 2,
      });
      prisma.companyCandidate.update.mockResolvedValue({
        id: 'cc-1',
        status: CompanyCandidateStatus.ACTIVE,
        version: 3,
      });
      const result = await service.restore(CANDIDATE_ID, COMPANY_A, 2);
      expect(result.restored).toBe(true);
    });
  });

  describe('no cross-company leakage', () => {
    it('companyId is always scoped in queries', async () => {
      prisma.companyCandidate.findFirst.mockResolvedValue(null);
      await expect(service.archive(CANDIDATE_ID, COMPANY_B, 1)).rejects.toThrow(NotFoundException);
      const call = prisma.companyCandidate.findFirst.mock.calls[0][0];
      expect(call.where.companyId).toBe(COMPANY_B);
    });
  });
});
