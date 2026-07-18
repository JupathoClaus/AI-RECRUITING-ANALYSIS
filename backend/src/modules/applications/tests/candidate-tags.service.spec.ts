import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CandidateTagsService } from '../services/candidate-tags.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateTagType } from '@prisma/client';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const CANDIDATE_ID = 'cand-1';

describe('CandidateTagsService', () => {
  let service: CandidateTagsService;
  let prisma: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      candidateTag: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      companyCandidate: { findFirst: jest.fn() },
      companyCandidateTag: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    auditService = { record: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateTagsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApplicationAuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<CandidateTagsService>(CandidateTagsService);
  });

  describe('createTag', () => {
    it('creates a tag within a company', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue(null);
      prisma.candidateTag.create.mockResolvedValue({
        id: 't1',
        companyId: COMPANY_A,
        name: 'Senior',
        normalizedName: 'senior',
      });
      const result = await service.createTag(
        COMPANY_A,
        { name: 'Senior', type: CandidateTagType.GENERAL },
        'm1',
      );
      expect(result.companyId).toBe(COMPANY_A);
    });

    it('throws ConflictException on duplicate normalizedName within company', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue({ id: 't1', normalizedName: 'senior' });
      await expect(service.createTag(COMPANY_A, { name: 'Senior' }, 'm1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows same tag name in different companies', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue(null);
      prisma.candidateTag.create
        .mockResolvedValueOnce({ id: 'ta', companyId: COMPANY_A, name: 'VIP' })
        .mockResolvedValueOnce({ id: 'tb', companyId: COMPANY_B, name: 'VIP' });
      const a = await service.createTag(COMPANY_A, { name: 'VIP' }, 'ma');
      const b = await service.createTag(COMPANY_B, { name: 'VIP' }, 'mb');
      expect(a.companyId).toBe(COMPANY_A);
      expect(b.companyId).toBe(COMPANY_B);
    });

    it('rejects invalid hex color', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue(null);
      await expect(
        service.createTag(COMPANY_A, { name: 'X', color: 'notacolor' }, 'm1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('soft deletes a tag', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue({ id: 't1', companyId: COMPANY_A });
      prisma.candidateTag.update.mockResolvedValue({ id: 't1', deletedAt: new Date() });
      await service.deleteTag('t1', COMPANY_A);
      expect(prisma.candidateTag.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });

  describe('assignTagToCandidate', () => {
    it('throws NotFoundException if tag not found in company', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue(null);
      await expect(
        service.assignTagToCandidate(CANDIDATE_ID, 't-bad', COMPANY_A, 'm1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if company-candidate link missing', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue({
        id: 't1',
        companyId: COMPANY_A,
        name: 'Tag',
      });
      prisma.companyCandidate.findFirst.mockResolvedValue(null);
      await expect(
        service.assignTagToCandidate(CANDIDATE_ID, 't1', COMPANY_A, 'm1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException on duplicate assignment', async () => {
      prisma.candidateTag.findFirst.mockResolvedValue({
        id: 't1',
        companyId: COMPANY_A,
        name: 'Tag',
      });
      prisma.companyCandidate.findFirst.mockResolvedValue({ id: 'cc1' });
      prisma.companyCandidateTag.findUnique.mockResolvedValue({ id: 'assign-1' });
      await expect(
        service.assignTagToCandidate(CANDIDATE_ID, 't1', COMPANY_A, 'm1'),
      ).rejects.toThrow(ConflictException);
    });

    it('cannot assign tag from company B to company A candidate', async () => {
      // Tag belongs to COMPANY_B but request uses COMPANY_A scope
      prisma.candidateTag.findFirst.mockResolvedValue(null); // returns null for COMPANY_A
      await expect(
        service.assignTagToCandidate(CANDIDATE_ID, 't-b', COMPANY_A, 'm1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
