import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateAuditService } from '../candidate-audit.service';
import { CandidateMergeService } from '../candidate-merge.service';

describe('CandidateMergeService', () => {
  let service: CandidateMergeService;
  let prisma: any;
  let auditService: any;
  let tx: any;

  const mockAuditService = {
    record: jest.fn(),
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
    candidate: {
      findUnique: jest.fn(),
    },
    candidateSkill: {
      findMany: jest.fn(),
    },
    candidateEmployment: {
      findMany: jest.fn(),
    },
    candidateEducation: {
      findMany: jest.fn(),
    },
    candidateCertification: {
      findMany: jest.fn(),
    },
    candidateLanguage: {
      findMany: jest.fn(),
    },
    candidateConsent: {
      findMany: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateMergeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CandidateAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CandidateMergeService>(CandidateMergeService);
    prisma = mockPrismaService;
    auditService = mockAuditService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      candidate: {
        update: jest.fn(),
      },
      candidateSkill: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      candidateEmployment: {
        updateMany: jest.fn(),
      },
      candidateEducation: {
        updateMany: jest.fn(),
      },
      candidateCertification: {
        updateMany: jest.fn(),
      },
      candidateLanguage: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      candidateConsent: {
        updateMany: jest.fn(),
      },
      candidateMergeRecord: {
        create: jest.fn(),
      },
      candidateAuditEvent: {
        createMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => any) => cb(tx));
  });

  const baseCandidate = {
    id: 'candidate-1',
    version: 1,
    status: 'ACTIVE',
    firstName: 'John',
    middleName: null,
    lastName: 'Doe',
    email: 'john@example.com',
    normalizedEmail: 'john@example.com',
    phone: '+15551234567',
    normalizedPhone: '+15551234567',
    alternatePhone: null,
    city: 'New York',
    stateOrProvince: 'NY',
    countryCode: 'US',
    postalCode: '10001',
    headline: 'Engineer',
    summary: 'A summary',
    currentJobTitle: 'Developer',
    currentEmployer: 'Acme',
    totalExperienceYears: 5,
    preferredLocale: 'en-US',
    timezone: 'America/New_York',
    linkedInUrl: 'https://linkedin.com/in/johndoe',
    portfolioUrl: null,
    personalWebsiteUrl: null,
    willingToRelocate: false,
    remoteWorkPreference: 'HYBRID',
    salaryExpectationMin: 100000,
    salaryExpectationMax: 150000,
    salaryCurrency: 'USD',
    noticePeriodDays: 30,
    availableFrom: null,
  };

  const baseMergedCandidate = {
    ...baseCandidate,
    id: 'candidate-2',
    version: 1,
    firstName: 'Johnny',
    lastName: 'Doe',
    email: 'johnny@example.com',
    normalizedEmail: 'johnny@example.com',
  };

  function makeSkill(id: string, skillId: string, candidateId: string) {
    return {
      id,
      candidateId,
      skillId,
      proficiencyLevel: 'Advanced',
      yearsOfExperience: 3,
      skill: { id: skillId, displayName: `Skill ${skillId}` },
    };
  }

  function makeEmployment(id: string, candidateId: string) {
    return {
      id,
      candidateId,
      companyName: 'Company',
      jobTitle: 'Role',
      startDate: new Date('2020-01-01'),
      sortOrder: 0,
    };
  }

  function makeEducation(id: string, candidateId: string) {
    return {
      id,
      candidateId,
      institution: 'University',
      level: 'BACHELOR',
      status: 'COMPLETED',
      sortOrder: 0,
    };
  }

  function makeCert(id: string, candidateId: string) {
    return {
      id,
      candidateId,
      name: 'Cert',
      issuingOrganization: 'Org',
    };
  }

  function makeLanguage(id: string, languageCode: string, candidateId: string, preferred = false) {
    return {
      id,
      candidateId,
      languageCode,
      proficiency: 'FLUENT',
      preferredInterviewLanguage: preferred,
    };
  }

  function makeConsent(id: string, candidateId: string) {
    return {
      id,
      candidateId,
      type: 'DATA_PROCESSING',
      status: 'GRANTED',
      policyVersion: '1.0',
    };
  }

  describe('buildMergePreview', () => {
    it('should return field conflicts and sub-resource counts', async () => {
      const primary = { ...baseCandidate };
      const merged = { ...baseMergedCandidate, city: 'Boston', headline: 'Senior Engineer' };

      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      const pSkills = [
        makeSkill('ps1', 'skill-1', primary.id),
        makeSkill('ps2', 'skill-2', primary.id),
      ];
      const mSkills = [
        makeSkill('ms1', 'skill-2', merged.id),
        makeSkill('ms2', 'skill-3', merged.id),
      ];
      prisma.candidateSkill.findMany.mockResolvedValueOnce(pSkills).mockResolvedValueOnce(mSkills);

      const pEmp = [makeEmployment('pe1', primary.id), makeEmployment('pe2', primary.id)];
      const mEmp = [makeEmployment('me1', merged.id)];
      prisma.candidateEmployment.findMany.mockResolvedValueOnce(pEmp).mockResolvedValueOnce(mEmp);

      const pEdu = [makeEducation('ped1', primary.id)];
      const mEdu = [makeEducation('med1', merged.id)];
      prisma.candidateEducation.findMany.mockResolvedValueOnce(pEdu).mockResolvedValueOnce(mEdu);

      const pCert = [makeCert('pc1', primary.id)];
      const mCert = [makeCert('mc1', merged.id), makeCert('mc2', merged.id)];
      prisma.candidateCertification.findMany
        .mockResolvedValueOnce(pCert)
        .mockResolvedValueOnce(mCert);

      const pLang = [makeLanguage('pl1', 'en', primary.id, true)];
      const mLang = [makeLanguage('ml1', 'en', merged.id), makeLanguage('ml2', 'fr', merged.id)];
      prisma.candidateLanguage.findMany.mockResolvedValueOnce(pLang).mockResolvedValueOnce(mLang);

      const pCons = [makeConsent('pco1', primary.id)];
      const mCons = [makeConsent('mco1', merged.id)];
      prisma.candidateConsent.findMany.mockResolvedValueOnce(pCons).mockResolvedValueOnce(mCons);

      const result = await service.buildMergePreview(primary.id, merged.id);

      expect(result.primary.id).toBe(primary.id);
      expect(result.merged.id).toBe(merged.id);
      expect(result.fieldConflicts).toEqual({
        firstName: { primary: 'John', merged: 'Johnny', conflict: true },
        email: { primary: 'john@example.com', merged: 'johnny@example.com', conflict: true },
        city: { primary: 'New York', merged: 'Boston', conflict: true },
        headline: { primary: 'Engineer', merged: 'Senior Engineer', conflict: true },
      });
      expect(result.skills).toEqual({ primary: 2, merged: 2, uniqueOnMerge: 1 });
      expect(result.employment).toEqual({ primary: 2, merged: 1 });
      expect(result.education).toEqual({ primary: 1, merged: 1 });
      expect(result.certifications).toEqual({ primary: 1, merged: 2 });
      expect(result.languages).toEqual({
        primary: 1,
        merged: 2,
        preferredPrimary: 'en',
        preferredMerged: null,
      });
      expect(result.consents).toEqual({ primary: 1, merged: 1 });
    });

    it('should not report conflict when only one candidate has a value', async () => {
      const primary = { ...baseCandidate, phone: null };
      const merged = { ...baseMergedCandidate, phone: '+15559876543' };

      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      prisma.candidateSkill.findMany.mockResolvedValue([]);
      prisma.candidateSkill.findMany.mockResolvedValue([]);
      prisma.candidateEmployment.findMany.mockResolvedValue([]);
      prisma.candidateEmployment.findMany.mockResolvedValue([]);
      prisma.candidateEducation.findMany.mockResolvedValue([]);
      prisma.candidateEducation.findMany.mockResolvedValue([]);
      prisma.candidateCertification.findMany.mockResolvedValue([]);
      prisma.candidateCertification.findMany.mockResolvedValue([]);
      prisma.candidateLanguage.findMany.mockResolvedValue([]);
      prisma.candidateLanguage.findMany.mockResolvedValue([]);
      prisma.candidateConsent.findMany.mockResolvedValue([]);
      prisma.candidateConsent.findMany.mockResolvedValue([]);

      const result = await service.buildMergePreview(primary.id, merged.id);

      expect(Object.keys(result.fieldConflicts)).not.toContain('phone');
    });

    it('should throw when primary and merged are the same', async () => {
      await expect(service.buildMergePreview('same-id', 'same-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when primary not found', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(null);

      await expect(service.buildMergePreview('nonexistent', 'candidate-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when primary status is MERGED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce({ ...baseCandidate, id: 'primary', status: 'MERGED' })
        .mockResolvedValueOnce(baseMergedCandidate);

      await expect(service.buildMergePreview('primary', 'candidate-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when primary status is DELETED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce({ ...baseCandidate, id: 'primary', status: 'DELETED' })
        .mockResolvedValueOnce(baseMergedCandidate);

      await expect(service.buildMergePreview('primary', 'candidate-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when primary status is ANONYMIZED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce({ ...baseCandidate, id: 'primary', status: 'ANONYMIZED' })
        .mockResolvedValueOnce(baseMergedCandidate);

      await expect(service.buildMergePreview('primary', 'candidate-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when merged status is MERGED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce(baseCandidate)
        .mockResolvedValueOnce({ ...baseMergedCandidate, id: 'merged', status: 'MERGED' });

      await expect(service.buildMergePreview('candidate-1', 'merged')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when merged status is DELETED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce(baseCandidate)
        .mockResolvedValueOnce({ ...baseMergedCandidate, id: 'merged', status: 'DELETED' });

      await expect(service.buildMergePreview('candidate-1', 'merged')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when merged status is ANONYMIZED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce(baseCandidate)
        .mockResolvedValueOnce({ ...baseMergedCandidate, id: 'merged', status: 'ANONYMIZED' });

      await expect(service.buildMergePreview('candidate-1', 'merged')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should calculate uniqueOnMerge as primary skills not in merged', async () => {
      const primary = { ...baseCandidate };
      const merged = { ...baseMergedCandidate };

      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      const pSkills = [
        makeSkill('ps1', 'skill-A', primary.id),
        makeSkill('ps2', 'skill-B', primary.id),
      ];
      const mSkills = [
        makeSkill('ms1', 'skill-B', merged.id),
        makeSkill('ms2', 'skill-C', merged.id),
      ];
      prisma.candidateSkill.findMany.mockResolvedValueOnce(pSkills).mockResolvedValueOnce(mSkills);

      prisma.candidateEmployment.findMany.mockResolvedValue([]);
      prisma.candidateEmployment.findMany.mockResolvedValue([]);
      prisma.candidateEducation.findMany.mockResolvedValue([]);
      prisma.candidateEducation.findMany.mockResolvedValue([]);
      prisma.candidateCertification.findMany.mockResolvedValue([]);
      prisma.candidateCertification.findMany.mockResolvedValue([]);
      prisma.candidateLanguage.findMany.mockResolvedValue([]);
      prisma.candidateLanguage.findMany.mockResolvedValue([]);
      prisma.candidateConsent.findMany.mockResolvedValue([]);
      prisma.candidateConsent.findMany.mockResolvedValue([]);

      const result = await service.buildMergePreview(primary.id, merged.id);

      expect(result.skills.uniqueOnMerge).toBe(1);
    });
  });

  describe('executeMerge', () => {
    const primaryId = 'primary-1';
    const mergedId = 'merged-1';
    const actorUserId = 'actor-1';
    const actorMembershipId = 'membership-1';
    const companyId = 'company-1';

    const primary = { ...baseCandidate, id: primaryId };
    const merged = { ...baseMergedCandidate, id: mergedId };

    it('should merge candidates successfully in a transaction', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      tx.candidateSkill.findMany.mockResolvedValueOnce([]);
      tx.candidateSkill.findMany.mockResolvedValueOnce([]);
      tx.candidateLanguage.findMany.mockResolvedValueOnce([]);
      tx.candidateLanguage.findMany.mockResolvedValueOnce([]);
      tx.candidateEmployment.updateMany.mockResolvedValue({ count: 1 });
      tx.candidateEducation.updateMany.mockResolvedValue({ count: 1 });
      tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
      tx.candidateConsent.updateMany.mockResolvedValue({ count: 1 });
      tx.candidate.update
        .mockResolvedValueOnce({ ...primary, version: 2 })
        .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
      tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
      tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

      const result = await service.executeMerge(
        primaryId,
        mergedId,
        'Duplicate profile',
        undefined,
        1,
        1,
        actorUserId,
        actorMembershipId,
        companyId,
        'req-1',
      );

      expect(prisma.candidate.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.candidateEmployment.updateMany).toHaveBeenCalledWith({
        where: { candidateId: mergedId },
        data: { candidateId: primaryId },
      });
      expect(tx.candidateEducation.updateMany).toHaveBeenCalledWith({
        where: { candidateId: mergedId },
        data: { candidateId: primaryId },
      });
      expect(tx.candidateCertification.updateMany).toHaveBeenCalledWith({
        where: { candidateId: mergedId },
        data: { candidateId: primaryId },
      });
      expect(tx.candidateConsent.updateMany).toHaveBeenCalledWith({
        where: { candidateId: mergedId },
        data: { candidateId: primaryId },
      });
      expect(tx.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mergedId },
          data: expect.objectContaining({ status: 'MERGED' }),
        }),
      );
      expect(tx.candidateMergeRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          primaryCandidateId: primaryId,
          mergedCandidateId: mergedId,
          mergedByUserId: actorUserId,
        }),
      });
      expect(tx.candidateAuditEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ candidateId: primaryId, eventType: 'CANDIDATE_MERGED' }),
          expect.objectContaining({ candidateId: mergedId, eventType: 'CANDIDATE_MERGED' }),
        ]),
      });
      expect(result).toEqual({ ...primary, version: 2 });
    });

    it('should throw when primary and merged are the same', async () => {
      await expect(
        service.executeMerge('same-id', 'same-id', undefined, undefined, 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when primary has stale version', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      await expect(
        service.executeMerge(primaryId, mergedId, undefined, undefined, 99, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw when merged has stale version', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

      await expect(
        service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 99),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw when primary status is MERGED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce({ ...primary, status: 'MERGED' })
        .mockResolvedValueOnce(merged);

      await expect(
        service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when merged status is MERGED', async () => {
      prisma.candidate.findUnique
        .mockResolvedValueOnce(primary)
        .mockResolvedValueOnce({ ...merged, status: 'MERGED' });

      await expect(
        service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when primary not found', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    describe('language conflict handling', () => {
      it('should delete duplicate languages (same languageCode) and reassign unique ones', async () => {
        prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

        tx.candidateSkill.findMany.mockResolvedValue([]);
        tx.candidateSkill.findMany.mockResolvedValue([]);

        const pLangs = [
          { id: 'pl-en', candidateId: primaryId, languageCode: 'en', proficiency: 'NATIVE' },
          { id: 'pl-fr', candidateId: primaryId, languageCode: 'fr', proficiency: 'FLUENT' },
        ];
        const mLangs = [
          { id: 'ml-en', candidateId: mergedId, languageCode: 'en', proficiency: 'FLUENT' },
          { id: 'ml-de', candidateId: mergedId, languageCode: 'de', proficiency: 'BASIC' },
        ];

        tx.candidateLanguage.findMany.mockResolvedValueOnce(pLangs).mockResolvedValueOnce(mLangs);

        tx.candidateEmployment.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateEducation.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateConsent.updateMany.mockResolvedValue({ count: 0 });
        tx.candidate.update
          .mockResolvedValueOnce({ ...primary, version: 2 })
          .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
        tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
        tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

        await service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1);

        expect(tx.candidateLanguage.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: ['ml-en'] } },
        });
        expect(tx.candidateLanguage.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['ml-de'] } },
          data: { candidateId: primaryId },
        });
      });

      it('should handle no language overlap', async () => {
        prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

        tx.candidateSkill.findMany.mockResolvedValue([]);
        tx.candidateSkill.findMany.mockResolvedValue([]);

        const pLangs = [{ id: 'pl-en', candidateId: primaryId, languageCode: 'en' }];
        const mLangs = [{ id: 'ml-de', candidateId: mergedId, languageCode: 'de' }];

        tx.candidateLanguage.findMany.mockResolvedValueOnce(pLangs).mockResolvedValueOnce(mLangs);

        tx.candidateEmployment.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateEducation.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateConsent.updateMany.mockResolvedValue({ count: 0 });
        tx.candidate.update
          .mockResolvedValueOnce({ ...primary, version: 2 })
          .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
        tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
        tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

        await service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1);

        expect(tx.candidateLanguage.deleteMany).not.toHaveBeenCalled();
        expect(tx.candidateLanguage.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['ml-de'] } },
          data: { candidateId: primaryId },
        });
      });
    });

    describe('skill conflict handling', () => {
      it('should only reassign merged skills with unique skillId (not in primary)', async () => {
        prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

        const pSkills = [
          { id: 'ps1', candidateId: primaryId, skillId: 'skill-A' },
          { id: 'ps2', candidateId: primaryId, skillId: 'skill-B' },
        ];
        const mSkills = [
          { id: 'ms1', candidateId: mergedId, skillId: 'skill-B' },
          { id: 'ms2', candidateId: mergedId, skillId: 'skill-C' },
        ];

        tx.candidateSkill.findMany.mockResolvedValueOnce(pSkills).mockResolvedValueOnce(mSkills);

        tx.candidateLanguage.findMany.mockResolvedValue([]);
        tx.candidateLanguage.findMany.mockResolvedValue([]);
        tx.candidateEmployment.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateEducation.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateConsent.updateMany.mockResolvedValue({ count: 0 });
        tx.candidate.update
          .mockResolvedValueOnce({ ...primary, version: 2 })
          .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
        tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
        tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

        await service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1);

        expect(tx.candidateSkill.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.candidateSkill.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['ms2'] } },
          data: { candidateId: primaryId },
        });
      });

      it('should not reassign any skills when all merged skills exist in primary', async () => {
        prisma.candidate.findUnique.mockResolvedValueOnce(primary).mockResolvedValueOnce(merged);

        const pSkills = [{ id: 'ps1', candidateId: primaryId, skillId: 'skill-A' }];
        const mSkills = [{ id: 'ms1', candidateId: mergedId, skillId: 'skill-A' }];

        tx.candidateSkill.findMany.mockResolvedValueOnce(pSkills).mockResolvedValueOnce(mSkills);

        tx.candidateLanguage.findMany.mockResolvedValue([]);
        tx.candidateLanguage.findMany.mockResolvedValue([]);
        tx.candidateEmployment.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateEducation.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
        tx.candidateConsent.updateMany.mockResolvedValue({ count: 0 });
        tx.candidate.update
          .mockResolvedValueOnce({ ...primary, version: 2 })
          .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
        tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
        tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

        await service.executeMerge(primaryId, mergedId, undefined, undefined, 1, 1);

        expect(tx.candidateSkill.updateMany).not.toHaveBeenCalled();
      });
    });

    it('should apply field resolution when specified', async () => {
      const primaryWithNullFields = {
        ...primary,
        headline: null,
        currentJobTitle: null,
      };
      const mergedWithVals = {
        ...merged,
        headline: 'Senior Engineer',
        currentJobTitle: 'Lead Developer',
      };

      prisma.candidate.findUnique
        .mockResolvedValueOnce(primaryWithNullFields)
        .mockResolvedValueOnce(mergedWithVals);

      tx.candidateSkill.findMany.mockResolvedValue([]);
      tx.candidateSkill.findMany.mockResolvedValue([]);
      tx.candidateLanguage.findMany.mockResolvedValue([]);
      tx.candidateLanguage.findMany.mockResolvedValue([]);
      tx.candidateEmployment.updateMany.mockResolvedValue({ count: 0 });
      tx.candidateEducation.updateMany.mockResolvedValue({ count: 0 });
      tx.candidateCertification.updateMany.mockResolvedValue({ count: 0 });
      tx.candidateConsent.updateMany.mockResolvedValue({ count: 0 });
      tx.candidate.update
        .mockResolvedValueOnce({
          ...primaryWithNullFields,
          version: 2,
          headline: 'Senior Engineer',
        })
        .mockResolvedValueOnce({ ...merged, status: 'MERGED', version: 2 });
      tx.candidateMergeRecord.create.mockResolvedValue({ id: 'record-1' });
      tx.candidateAuditEvent.createMany.mockResolvedValue({ count: 2 });

      await service.executeMerge(
        primaryId,
        mergedId,
        'Field resolution',
        { headline: 'merged', currentJobTitle: 'merged' },
        1,
        1,
      );

      const updateCall = tx.candidate.update.mock.calls[0][0];
      expect(updateCall.data.headline).toBe('Senior Engineer');
      expect(updateCall.data.currentJobTitle).toBe('Lead Developer');
    });
  });
});
