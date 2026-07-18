import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CandidateProfileService } from '../candidate-profile.service';
import { CandidateAuditService } from '../candidate-audit.service';
import { PrismaService } from '@database/prisma/prisma.service';

describe('CandidateProfileService', () => {
  let service: CandidateProfileService;
  let prisma: any;
  let auditService: any;

  const mockCandidateId = 'candidate-1';
  const mockActiveCandidate = {
    id: mockCandidateId,
    firstName: 'John',
    lastName: 'Doe',
    status: 'ACTIVE',
  };
  const mockMergedCandidate = {
    id: mockCandidateId,
    firstName: 'John',
    lastName: 'Doe',
    status: 'MERGED',
  };
  const mockDeletedCandidate = {
    id: mockCandidateId,
    firstName: 'John',
    lastName: 'Doe',
    status: 'DELETED',
  };
  const mockAnonymizedCandidate = {
    id: mockCandidateId,
    firstName: null,
    lastName: null,
    status: 'ANONYMIZED',
  };
  const mockSkill = { id: 'skill-1', displayName: 'JavaScript', isGlobal: true, companyId: null };
  const mockNonGlobalSkill = {
    id: 'skill-2',
    displayName: 'CustomSkill',
    isGlobal: false,
    companyId: 'company-x',
  };

  const mockPrismaService = {
    candidate: { findUnique: jest.fn() },
    skill: { findUnique: jest.fn() },
    candidateSkill: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    candidateEmployment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    candidateEducation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    candidateCertification: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    candidateLanguage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    candidateConsent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      if (Array.isArray(cb)) return Promise.resolve(cb);
      return Promise.resolve([]);
    }),
  };

  const mockAuditService = { record: jest.fn() };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateProfileService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CandidateAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CandidateProfileService>(CandidateProfileService);
    prisma = mockPrismaService;
    auditService = mockAuditService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.candidate.findUnique.mockResolvedValue(mockActiveCandidate);
  });

  function expectAuditCalled(expected: Partial<any>) {
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining(expected));
  }

  /* ══════════════════════════════════════════════════════════════
     assertCandidateExists
     ══════════════════════════════════════════════════════════════ */
  describe('assertCandidateExists (private, via public methods)', () => {
    it('should throw NotFoundException when candidate does not exist', async () => {
      prisma.candidate.findUnique.mockResolvedValue(null);
      await expect(service.getSkills(mockCandidateId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when candidate is DELETED', async () => {
      prisma.candidate.findUnique.mockResolvedValue(mockDeletedCandidate);
      await expect(service.getSkills(mockCandidateId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when candidate is ANONYMIZED', async () => {
      prisma.candidate.findUnique.mockResolvedValue(mockAnonymizedCandidate);
      await expect(service.getSkills(mockCandidateId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when candidate is MERGED', async () => {
      prisma.candidate.findUnique.mockResolvedValue(mockMergedCandidate);
      await expect(service.getSkills(mockCandidateId)).rejects.toThrow(BadRequestException);
    });
  });

  /* ══════════════════════════════════════════════════════════════
     SKILLS
     ══════════════════════════════════════════════════════════════ */
  describe('addSkill', () => {
    const skillData = {
      skillId: 'skill-1',
      proficiencyLevel: 'ADVANCED',
      yearsOfExperience: 5,
      lastUsedAt: '2024-01-01',
    };
    const createdRecord = {
      id: 'cs-1',
      candidateId: mockCandidateId,
      skillId: 'skill-1',
      proficiencyLevel: 'ADVANCED',
      yearsOfExperience: 5,
      lastUsedAt: new Date('2024-01-01'),
      skill: mockSkill,
    };

    it('should add a skill successfully', async () => {
      prisma.skill.findUnique.mockResolvedValue(mockSkill);
      prisma.candidateSkill.findUnique.mockResolvedValue(null);
      prisma.candidateSkill.create.mockResolvedValue(createdRecord);

      const result = await service.addSkill(
        mockCandidateId,
        skillData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(createdRecord);
      expect(prisma.candidateSkill.create).toHaveBeenCalledWith({
        data: {
          candidateId: mockCandidateId,
          skillId: 'skill-1',
          proficiencyLevel: 'ADVANCED',
          yearsOfExperience: 5,
          lastUsedAt: new Date('2024-01-01'),
        },
        include: { skill: true },
      });
      expectAuditCalled({
        candidateId: mockCandidateId,
        companyId: 'company-1',
        actorUserId: 'actor-1',
        actorMembershipId: null,
        eventType: 'CANDIDATE_SKILL_ADDED',
        entityType: 'CandidateSkill',
        entityId: 'cs-1',
        description: 'Skill "JavaScript" added to candidate',
        metadata: { skillId: 'skill-1' },
        requestId: 'req-1',
      });
    });

    it('should throw NotFoundException when skill does not exist', async () => {
      prisma.skill.findUnique.mockResolvedValue(null);
      await expect(service.addSkill(mockCandidateId, skillData)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when skill is not global and has companyId', async () => {
      prisma.skill.findUnique.mockResolvedValue(mockNonGlobalSkill);
      await expect(service.addSkill(mockCandidateId, skillData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when skill already exists for candidate', async () => {
      prisma.skill.findUnique.mockResolvedValue(mockSkill);
      prisma.candidateSkill.findUnique.mockResolvedValue({ id: 'existing-cs' });
      await expect(service.addSkill(mockCandidateId, skillData)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when yearsOfExperience is negative', async () => {
      prisma.skill.findUnique.mockResolvedValue(mockSkill);
      prisma.candidateSkill.findUnique.mockResolvedValue(null);
      await expect(
        service.addSkill(mockCandidateId, { ...skillData, yearsOfExperience: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default null for optional fields', async () => {
      prisma.skill.findUnique.mockResolvedValue(mockSkill);
      prisma.candidateSkill.findUnique.mockResolvedValue(null);
      prisma.candidateSkill.create.mockResolvedValue({
        id: 'cs-2',
        candidateId: mockCandidateId,
        skillId: 'skill-1',
        proficiencyLevel: null,
        yearsOfExperience: null,
        lastUsedAt: null,
        skill: mockSkill,
      });

      await service.addSkill(mockCandidateId, { skillId: 'skill-1' });

      expect(prisma.candidateSkill.create).toHaveBeenCalledWith({
        data: {
          candidateId: mockCandidateId,
          skillId: 'skill-1',
          proficiencyLevel: null,
          yearsOfExperience: null,
          lastUsedAt: null,
        },
        include: { skill: true },
      });
    });
  });

  describe('getSkills', () => {
    const skills = [{ id: 'cs-1', skill: { name: 'JavaScript' } }];

    it('should return skills for candidate', async () => {
      prisma.candidateSkill.findMany.mockResolvedValue(skills);
      const result = await service.getSkills(mockCandidateId);
      expect(result).toEqual(skills);
      expect(prisma.candidateSkill.findMany).toHaveBeenCalledWith({
        where: { candidateId: mockCandidateId },
        include: { skill: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateSkill', () => {
    const candidateSkillId = 'cs-1';
    const existing = {
      id: candidateSkillId,
      candidateId: mockCandidateId,
      proficiencyLevel: 'INTERMEDIATE',
      yearsOfExperience: 2,
      lastUsedAt: null,
      verified: false,
      verificationSource: null,
    };
    const updateData = {
      proficiencyLevel: 'ADVANCED',
      yearsOfExperience: 5,
      lastUsedAt: '2024-06-01',
      verified: true,
      verificationSource: 'HR',
    };

    it('should update skill fields', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue(existing);
      const updatedRecord = { ...existing, ...updateData, lastUsedAt: new Date('2024-06-01') };
      prisma.candidateSkill.update.mockResolvedValue(updatedRecord);

      const result = await service.updateSkill(
        mockCandidateId,
        candidateSkillId,
        updateData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(updatedRecord);
      expect(prisma.candidateSkill.update).toHaveBeenCalledWith({
        where: { id: candidateSkillId },
        data: {
          proficiencyLevel: 'ADVANCED',
          yearsOfExperience: 5,
          lastUsedAt: new Date('2024-06-01'),
          verified: true,
          verificationSource: 'HR',
        },
        include: { skill: true },
      });
      expectAuditCalled({
        eventType: 'CANDIDATE_SKILL_UPDATED',
        entityId: candidateSkillId,
        requestId: 'req-1',
      });
    });

    it('should throw NotFoundException when candidate skill does not exist', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue(null);
      await expect(service.updateSkill(mockCandidateId, candidateSkillId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for negative yearsOfExperience', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue(existing);
      await expect(
        service.updateSkill(mockCandidateId, candidateSkillId, { yearsOfExperience: -2 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set lastUsedAt to null when provided as null', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue(existing);
      const updated = { ...existing, lastUsedAt: null };
      prisma.candidateSkill.update.mockResolvedValue(updated);

      await service.updateSkill(mockCandidateId, candidateSkillId, { lastUsedAt: null as any });

      expect(prisma.candidateSkill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastUsedAt: null }),
        }),
      );
    });
  });

  describe('removeSkill', () => {
    const candidateSkillId = 'cs-1';

    it('should remove skill and write audit event', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue({
        id: candidateSkillId,
        candidateId: mockCandidateId,
      });
      prisma.candidateSkill.delete.mockResolvedValue({ id: candidateSkillId });

      const result = await service.removeSkill(
        mockCandidateId,
        candidateSkillId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ removed: true });
      expect(prisma.candidateSkill.delete).toHaveBeenCalledWith({
        where: { id: candidateSkillId },
      });
      expectAuditCalled({
        eventType: 'CANDIDATE_SKILL_REMOVED',
        entityId: candidateSkillId,
        requestId: 'req-1',
      });
    });

    it('should throw NotFoundException when skill not found', async () => {
      prisma.candidateSkill.findFirst.mockResolvedValue(null);
      await expect(service.removeSkill(mockCandidateId, candidateSkillId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ══════════════════════════════════════════════════════════════
     EMPLOYMENT
     ══════════════════════════════════════════════════════════════ */
  describe('addEmployment', () => {
    const employmentData = {
      type: 'FULL_TIME',
      companyName: '  Acme Corp  ',
      jobTitle: '  Engineer  ',
      location: '  NYC  ',
      startDate: '2020-01-01',
      endDate: '2023-01-01',
      currentlyWorking: false,
      description: '  Great  ',
      achievements: '  Done it  ',
      industry: '  Tech  ',
      sortOrder: 1,
    };
    const createdRecord = {
      id: 'emp-1',
      candidateId: mockCandidateId,
      ...employmentData,
      companyName: 'Acme Corp',
      jobTitle: 'Engineer',
      location: 'NYC',
      description: 'Great',
      achievements: 'Done it',
      industry: 'Tech',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2023-01-01'),
    };

    it('should add employment successfully', async () => {
      prisma.candidateEmployment.create.mockResolvedValue(createdRecord);

      const result = await service.addEmployment(
        mockCandidateId,
        employmentData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(createdRecord);
      expect(prisma.candidateEmployment.create).toHaveBeenCalledWith({
        data: {
          candidateId: mockCandidateId,
          type: 'FULL_TIME',
          companyName: 'Acme Corp',
          jobTitle: 'Engineer',
          location: 'NYC',
          startDate: new Date('2020-01-01'),
          endDate: new Date('2023-01-01'),
          currentlyWorking: false,
          description: 'Great',
          achievements: 'Done it',
          industry: 'Tech',
          sortOrder: 1,
        },
      });
      expectAuditCalled({
        eventType: 'CANDIDATE_EMPLOYMENT_ADDED',
        description: 'Employment at "  Acme Corp  " added',
        requestId: 'req-1',
      });
    });

    it('should throw BadRequestException when endDate is before startDate', async () => {
      await expect(
        service.addEmployment(mockCandidateId, {
          ...employmentData,
          startDate: '2023-01-01',
          endDate: '2020-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when endDate provided with currentlyWorking', async () => {
      await expect(
        service.addEmployment(mockCandidateId, {
          ...employmentData,
          currentlyWorking: true,
          endDate: '2023-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default sortOrder to 0', async () => {
      prisma.candidateEmployment.create.mockResolvedValue({ id: 'emp-2' });
      await service.addEmployment(mockCandidateId, {
        type: 'FULL_TIME',
        companyName: 'Co',
        jobTitle: 'Dev',
        startDate: '2020-01-01',
      });
      expect(prisma.candidateEmployment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 0 }),
        }),
      );
    });
  });

  describe('getEmployment', () => {
    it('should return employment records ordered by sortOrder', async () => {
      const records = [{ id: 'emp-1', sortOrder: 0 }];
      prisma.candidateEmployment.findMany.mockResolvedValue(records);

      const result = await service.getEmployment(mockCandidateId);

      expect(result).toEqual(records);
      expect(prisma.candidateEmployment.findMany).toHaveBeenCalledWith({
        where: { candidateId: mockCandidateId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('updateEmployment', () => {
    const employmentId = 'emp-1';
    const existingRecord = {
      id: employmentId,
      candidateId: mockCandidateId,
      type: 'FULL_TIME',
      companyName: 'OldCo',
      jobTitle: 'Dev',
      startDate: new Date('2020-01-01'),
      endDate: null,
      currentlyWorking: false,
      location: null,
      description: null,
      achievements: null,
      industry: null,
      sortOrder: 0,
    };

    it('should update employment', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue(existingRecord);
      const updated = { ...existingRecord, companyName: 'NewCo', jobTitle: 'Senior Dev' };
      prisma.candidateEmployment.update.mockResolvedValue(updated);

      const result = await service.updateEmployment(
        mockCandidateId,
        employmentId,
        { companyName: '  NewCo  ', jobTitle: 'Senior Dev' },
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(updated);
      expect(prisma.candidateEmployment.update).toHaveBeenCalledWith({
        where: { id: employmentId },
        data: expect.objectContaining({ companyName: 'NewCo', jobTitle: 'Senior Dev' }),
      });
      expectAuditCalled({ eventType: 'CANDIDATE_EMPLOYMENT_UPDATED', requestId: 'req-1' });
    });

    it('should throw NotFoundException when record not found', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue(null);
      await expect(service.updateEmployment(mockCandidateId, employmentId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should validate dates on update', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue(existingRecord);
      await expect(
        service.updateEmployment(mockCandidateId, employmentId, {
          startDate: '2023-01-01',
          endDate: '2020-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject endDate when currentlyWorking is set', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue(existingRecord);
      await expect(
        service.updateEmployment(mockCandidateId, employmentId, {
          currentlyWorking: true,
          endDate: '2023-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeEmployment', () => {
    const employmentId = 'emp-1';

    it('should remove employment and write audit', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue({
        id: employmentId,
        candidateId: mockCandidateId,
      });
      prisma.candidateEmployment.delete.mockResolvedValue({});

      const result = await service.removeEmployment(
        mockCandidateId,
        employmentId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ removed: true });
      expect(prisma.candidateEmployment.delete).toHaveBeenCalledWith({
        where: { id: employmentId },
      });
      expectAuditCalled({ eventType: 'CANDIDATE_EMPLOYMENT_REMOVED', requestId: 'req-1' });
    });

    it('should throw NotFoundException', async () => {
      prisma.candidateEmployment.findFirst.mockResolvedValue(null);
      await expect(service.removeEmployment(mockCandidateId, employmentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ══════════════════════════════════════════════════════════════
     EDUCATION
     ══════════════════════════════════════════════════════════════ */
  describe('addEducation', () => {
    const eduData = {
      institution: '  MIT  ',
      level: 'MASTERS',
      fieldOfStudy: '  CS  ',
      status: 'COMPLETED',
      startDate: '2018-09-01',
      endDate: '2020-06-01',
      grade: '  A  ',
      description: '  Great  ',
      sortOrder: 1,
    };
    const createdRecord = {
      id: 'edu-1',
      candidateId: mockCandidateId,
      institution: 'MIT',
      level: 'MASTERS',
      fieldOfStudy: 'CS',
      status: 'COMPLETED',
      startDate: new Date('2018-09-01'),
      endDate: new Date('2020-06-01'),
      grade: 'A',
      description: 'Great',
      sortOrder: 1,
    };

    it('should add education successfully', async () => {
      prisma.candidateEducation.create.mockResolvedValue(createdRecord);

      const result = await service.addEducation(
        mockCandidateId,
        eduData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(createdRecord);
      expectAuditCalled({
        eventType: 'CANDIDATE_EDUCATION_ADDED',
        description: 'Education at "  MIT  " added',
        requestId: 'req-1',
      });
    });

    it('should throw BadRequestException when endDate before startDate', async () => {
      await expect(
        service.addEducation(mockCandidateId, {
          ...eduData,
          startDate: '2020-01-01',
          endDate: '2019-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow missing dates', async () => {
      prisma.candidateEducation.create.mockResolvedValue({ id: 'edu-2' });
      await service.addEducation(mockCandidateId, {
        institution: 'U',
        level: 'BACHELORS',
        status: 'IN_PROGRESS',
      });
      expect(prisma.candidateEducation.create).toHaveBeenCalled();
    });
  });

  describe('removeEducation', () => {
    const educationId = 'edu-1';

    it('should remove education and write audit', async () => {
      prisma.candidateEducation.findFirst.mockResolvedValue({
        id: educationId,
        candidateId: mockCandidateId,
      });
      prisma.candidateEducation.delete.mockResolvedValue({});

      const result = await service.removeEducation(
        mockCandidateId,
        educationId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ removed: true });
      expect(prisma.candidateEducation.delete).toHaveBeenCalledWith({ where: { id: educationId } });
      expectAuditCalled({ eventType: 'CANDIDATE_EDUCATION_REMOVED', requestId: 'req-1' });
    });

    it('should throw NotFoundException', async () => {
      prisma.candidateEducation.findFirst.mockResolvedValue(null);
      await expect(service.removeEducation(mockCandidateId, educationId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ══════════════════════════════════════════════════════════════
     CERTIFICATIONS
     ══════════════════════════════════════════════════════════════ */
  describe('addCertification', () => {
    const certData = {
      name: '  AWS Certified  ',
      issuingOrganization: '  Amazon  ',
      issuedAt: '2023-01-01',
      expiresAt: '2026-01-01',
      credentialId: '  ABC-123  ',
      credentialUrl: '  https://example.com  ',
    };
    const createdRecord = {
      id: 'cert-1',
      candidateId: mockCandidateId,
      name: 'AWS Certified',
      issuingOrganization: 'Amazon',
      issuedAt: new Date('2023-01-01'),
      expiresAt: new Date('2026-01-01'),
      credentialId: 'ABC-123',
      credentialUrl: 'https://example.com',
    };

    it('should add certification successfully', async () => {
      prisma.candidateCertification.create.mockResolvedValue(createdRecord);

      const result = await service.addCertification(
        mockCandidateId,
        certData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(createdRecord);
      expect(prisma.candidateCertification.create).toHaveBeenCalledWith({
        data: {
          candidateId: mockCandidateId,
          name: 'AWS Certified',
          issuingOrganization: 'Amazon',
          issuedAt: new Date('2023-01-01'),
          expiresAt: new Date('2026-01-01'),
          credentialId: 'ABC-123',
          credentialUrl: 'https://example.com',
        },
      });
      expectAuditCalled({
        eventType: 'CANDIDATE_CERTIFICATION_ADDED',
        description: 'Certification "  AWS Certified  " added',
        requestId: 'req-1',
      });
    });

    it('should throw BadRequestException when expiresAt before issuedAt', async () => {
      await expect(
        service.addCertification(mockCandidateId, {
          ...certData,
          issuedAt: '2025-01-01',
          expiresAt: '2024-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow null dates', async () => {
      prisma.candidateCertification.create.mockResolvedValue({ id: 'cert-2' });
      await service.addCertification(mockCandidateId, {
        name: 'Some Cert',
        issuingOrganization: 'Org',
      });
      expect(prisma.candidateCertification.create).toHaveBeenCalled();
    });
  });

  describe('removeCertification', () => {
    const certificationId = 'cert-1';

    it('should remove certification and write audit', async () => {
      prisma.candidateCertification.findFirst.mockResolvedValue({
        id: certificationId,
        candidateId: mockCandidateId,
      });
      prisma.candidateCertification.delete.mockResolvedValue({});

      const result = await service.removeCertification(
        mockCandidateId,
        certificationId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ removed: true });
      expect(prisma.candidateCertification.delete).toHaveBeenCalledWith({
        where: { id: certificationId },
      });
      expectAuditCalled({ eventType: 'CANDIDATE_CERTIFICATION_REMOVED', requestId: 'req-1' });
    });

    it('should throw NotFoundException', async () => {
      prisma.candidateCertification.findFirst.mockResolvedValue(null);
      await expect(service.removeCertification(mockCandidateId, certificationId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ══════════════════════════════════════════════════════════════
     LANGUAGES
     ══════════════════════════════════════════════════════════════ */
  describe('addLanguage', () => {
    const langData = {
      languageCode: 'EN',
      proficiency: 'NATIVE',
      preferredInterviewLanguage: true,
    };
    const createdRecord = {
      id: 'lang-1',
      candidateId: mockCandidateId,
      languageCode: 'EN',
      proficiency: 'NATIVE',
      preferredInterviewLanguage: true,
    };

    it('should add language successfully', async () => {
      prisma.candidateLanguage.findUnique.mockResolvedValue(null);
      prisma.candidateLanguage.create.mockResolvedValue(createdRecord);

      const result = await service.addLanguage(
        mockCandidateId,
        langData,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual(createdRecord);
      expect(prisma.candidateLanguage.updateMany).toHaveBeenCalledWith({
        where: { candidateId: mockCandidateId, preferredInterviewLanguage: true },
        data: { preferredInterviewLanguage: false },
      });
      expect(prisma.candidateLanguage.create).toHaveBeenCalledWith({
        data: {
          candidateId: mockCandidateId,
          languageCode: 'EN',
          proficiency: 'NATIVE',
          preferredInterviewLanguage: true,
        },
      });
      expectAuditCalled({
        eventType: 'CANDIDATE_LANGUAGE_ADDED',
        description: 'Language "EN" added',
        metadata: { languageCode: 'EN' },
        requestId: 'req-1',
      });
    });

    it('should throw ConflictException when language already exists', async () => {
      prisma.candidateLanguage.findUnique.mockResolvedValue({ id: 'existing-lang' });
      await expect(service.addLanguage(mockCandidateId, langData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should default preferredInterviewLanguage to false', async () => {
      prisma.candidateLanguage.findUnique.mockResolvedValue(null);
      prisma.candidateLanguage.create.mockResolvedValue({ id: 'lang-2' });

      await service.addLanguage(mockCandidateId, {
        languageCode: 'FR',
        proficiency: 'INTERMEDIATE',
      });

      expect(prisma.candidateLanguage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ preferredInterviewLanguage: false }),
        }),
      );
      expect(prisma.candidateLanguage.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('setPreferredLanguage', () => {
    const languageId = 'lang-1';

    it('should set preferred language and clear others', async () => {
      prisma.candidateLanguage.findFirst.mockResolvedValue({
        id: languageId,
        candidateId: mockCandidateId,
        languageCode: 'EN',
      });
      prisma.candidateLanguage.updateMany.mockResolvedValue({ count: 1 });
      prisma.candidateLanguage.update.mockResolvedValue({
        id: languageId,
        preferredInterviewLanguage: true,
      });

      const result = await service.setPreferredLanguage(
        mockCandidateId,
        languageId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ preferredLanguage: 'EN' });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        prisma.candidateLanguage.updateMany({
          where: { candidateId: mockCandidateId, preferredInterviewLanguage: true },
          data: { preferredInterviewLanguage: false },
        }),
        prisma.candidateLanguage.update({
          where: { id: languageId },
          data: { preferredInterviewLanguage: true },
        }),
      ]);
      expectAuditCalled({
        eventType: 'CANDIDATE_LANGUAGE_UPDATED',
        description: 'Preferred interview language set to "EN"',
        requestId: 'req-1',
      });
    });

    it('should throw NotFoundException when language not found', async () => {
      prisma.candidateLanguage.findFirst.mockResolvedValue(null);
      await expect(service.setPreferredLanguage(mockCandidateId, languageId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeLanguage', () => {
    const languageId = 'lang-1';

    it('should remove language and write audit', async () => {
      prisma.candidateLanguage.findFirst.mockResolvedValue({
        id: languageId,
        candidateId: mockCandidateId,
        languageCode: 'EN',
      });
      prisma.candidateLanguage.delete.mockResolvedValue({});

      const result = await service.removeLanguage(
        mockCandidateId,
        languageId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ removed: true });
      expect(prisma.candidateLanguage.delete).toHaveBeenCalledWith({ where: { id: languageId } });
      expectAuditCalled({
        eventType: 'CANDIDATE_LANGUAGE_REMOVED',
        description: 'Language "EN" removed',
        requestId: 'req-1',
      });
    });

    it('should throw NotFoundException', async () => {
      prisma.candidateLanguage.findFirst.mockResolvedValue(null);
      await expect(service.removeLanguage(mockCandidateId, languageId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ══════════════════════════════════════════════════════════════
     CONSENTS
     ══════════════════════════════════════════════════════════════ */
  describe('grantConsent', () => {
    const consentData = {
      type: 'DATA_PROCESSING',
      policyVersion: '1.0',
      companyId: 'company-1',
      sourceIp: '192.168.1.1',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'.repeat(
          5,
        ),
    };
    const createdRecord = {
      id: 'consent-1',
      candidateId: mockCandidateId,
      type: 'DATA_PROCESSING',
      status: 'GRANTED',
      policyVersion: '1.0',
      granteeAt: new Date(),
      sourceIpHash: 'c5eb5a4cc76a5cdb',
      userAgent: undefined,
    };

    it('should grant consent with hashed IP', async () => {
      prisma.candidateConsent.create.mockResolvedValue(createdRecord);

      const result = await service.grantConsent(
        mockCandidateId,
        consentData,
        'actor-1',
        null,
        'req-1',
      );

      expect(result.id).toBe('consent-1');
      expect(prisma.candidateConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            candidateId: mockCandidateId,
            type: 'DATA_PROCESSING',
            status: 'GRANTED',
            policyVersion: '1.0',
            companyId: 'company-1',
            sourceIpHash: 'c5eb5a4cc76a5cdb',
            userAgent: expect.any(String),
          }),
        }),
      );
      expectAuditCalled({
        eventType: 'CONSENT_GRANTED',
        description: 'Consent "DATA_PROCESSING" granted (v1.0)',
        metadata: { type: 'DATA_PROCESSING', policyVersion: '1.0' },
        requestId: 'req-1',
      });
    });

    it('should truncate userAgent to 500 chars', async () => {
      prisma.candidateConsent.create.mockResolvedValue({ id: 'consent-2' });

      await service.grantConsent(mockCandidateId, {
        ...consentData,
        sourceIp: undefined,
        userAgent: 'x'.repeat(1000),
      });

      const callData = prisma.candidateConsent.create.mock.calls[0][0].data;
      expect(callData.userAgent.length).toBe(500);
    });

    it('should set sourceIpHash to null when no sourceIp', async () => {
      prisma.candidateConsent.create.mockResolvedValue({ id: 'consent-3' });

      await service.grantConsent(mockCandidateId, { type: 'TERMS', policyVersion: '1.0' });

      expect(prisma.candidateConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sourceIpHash: null, companyId: null }),
        }),
      );
    });
  });

  describe('revokeConsent', () => {
    const consentId = 'consent-1';
    const activeConsent = {
      id: consentId,
      candidateId: mockCandidateId,
      type: 'DATA_PROCESSING',
      status: 'GRANTED',
      policyVersion: '1.0',
    };

    it('should revoke consent and write audit', async () => {
      prisma.candidateConsent.findFirst.mockResolvedValue(activeConsent);
      prisma.candidateConsent.update.mockResolvedValue({ ...activeConsent, status: 'REVOKED' });

      const result = await service.revokeConsent(
        mockCandidateId,
        consentId,
        'actor-1',
        null,
        'company-1',
        'req-1',
      );

      expect(result).toEqual({ revoked: true });
      expect(prisma.candidateConsent.update).toHaveBeenCalledWith({
        where: { id: consentId },
        data: { status: 'REVOKED', revokedAt: expect.any(Date) },
      });
      expectAuditCalled({
        eventType: 'CONSENT_REVOKED',
        description: 'Consent "DATA_PROCESSING" revoked',
        metadata: { type: 'DATA_PROCESSING', policyVersion: '1.0' },
        requestId: 'req-1',
      });
    });

    it('should return idempotent result when already revoked', async () => {
      prisma.candidateConsent.findFirst.mockResolvedValue({ ...activeConsent, status: 'REVOKED' });

      const result = await service.revokeConsent(mockCandidateId, consentId);

      expect(result).toEqual({ revoked: true, status: 'already_revoked' });
      expect(prisma.candidateConsent.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when consent not found', async () => {
      prisma.candidateConsent.findFirst.mockResolvedValue(null);
      await expect(service.revokeConsent(mockCandidateId, consentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getConsents', () => {
    it('should return consent records without sensitive fields', async () => {
      const rawRecords = [
        {
          id: 'consent-1',
          type: 'DATA_PROCESSING',
          status: 'GRANTED',
          policyVersion: '1.0',
          grantedAt: new Date('2024-01-01'),
          revokedAt: null,
          expiresAt: null,
          createdAt: new Date('2024-01-01'),
          sourceIpHash: 'should-not-be-included',
          userAgent: 'should-not-be-included',
          candidateId: mockCandidateId,
          companyId: null,
          updatedAt: new Date(),
        },
      ];
      prisma.candidateConsent.findMany.mockResolvedValue(rawRecords);

      const result = await service.getConsents(mockCandidateId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'consent-1',
        type: 'DATA_PROCESSING',
        status: 'GRANTED',
        policyVersion: '1.0',
        grantedAt: rawRecords[0].grantedAt,
        revokedAt: null,
        expiresAt: null,
        createdAt: rawRecords[0].createdAt,
      });
      expect(result[0]).not.toHaveProperty('sourceIpHash');
      expect(result[0]).not.toHaveProperty('userAgent');
      expect(result[0]).not.toHaveProperty('candidateId');
    });
  });
});
