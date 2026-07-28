import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { CandidatesController } from '../candidates.controller';
import { CandidatesService } from '../candidates.service';
import { CandidateProfileService } from '../candidate-profile.service';
import { CandidateDeduplicationService } from '../candidate-deduplication.service';
import { CandidateMergeService } from '../candidate-merge.service';
import { CompanyCandidateService } from '@modules/applications/services/company-candidate.service';
import { CandidateTagsService } from '@modules/applications/services/candidate-tags.service';
import { ApplicationNotesService } from '@modules/applications/services/application-notes.service';
import { CreateCandidateDto, UpdateCandidateDto } from '../dto/create-candidate.dto';
import { CandidateQueryDto } from '../dto/candidate-query.dto';

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let candidatesService: any;
  let profileService: any;
  let deduplicationService: any;
  let mergeService: any;

  const mockUser = {
    userId: 'user-1',
    sessionId: 'session-1',
    activeCompanyId: 'company-1',
    membershipId: 'membership-1',
    role: 'admin',
    permissions: [
      'candidates.create',
      'candidates.read',
      'candidates.update',
      'candidates.archive',
      'candidates.block',
      'candidates.merge',
      'candidates.view_sensitive',
    ],
  };

  const mockCandidatesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
    getActivity: jest.fn(),
  };

  const mockProfileService = {
    getSkills: jest.fn(),
    addSkill: jest.fn(),
    updateSkill: jest.fn(),
    removeSkill: jest.fn(),
    getEmployment: jest.fn(),
    addEmployment: jest.fn(),
    updateEmployment: jest.fn(),
    removeEmployment: jest.fn(),
    reorderEmployment: jest.fn(),
    getEducation: jest.fn(),
    addEducation: jest.fn(),
    removeEducation: jest.fn(),
    reorderEducation: jest.fn(),
    getCertifications: jest.fn(),
    addCertification: jest.fn(),
    removeCertification: jest.fn(),
    getLanguages: jest.fn(),
    addLanguage: jest.fn(),
    setPreferredLanguage: jest.fn(),
    removeLanguage: jest.fn(),
    getConsents: jest.fn(),
    grantConsent: jest.fn(),
    revokeConsent: jest.fn(),
  };

  const mockDeduplicationService = {
    checkBeforeCreate: jest.fn(),
  };

  const mockMergeService = {
    buildMergePreview: jest.fn(),
    executeMerge: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CandidatesController],
      providers: [
        { provide: CandidatesService, useValue: mockCandidatesService },
        { provide: CandidateProfileService, useValue: mockProfileService },
        { provide: CandidateDeduplicationService, useValue: mockDeduplicationService },
        { provide: CandidateMergeService, useValue: mockMergeService },
        {
          provide: CompanyCandidateService,
          useValue: {
            linkCandidate: jest.fn(),
            updateCompanyProfile: jest.fn(),
            archive: jest.fn(),
            restore: jest.fn(),
            findByCompanyAndCandidate: jest.fn(),
          },
        },
        {
          provide: CandidateTagsService,
          useValue: { assignTagToCandidate: jest.fn(), removeTagFromCandidate: jest.fn() },
        },
        { provide: ApplicationNotesService, useValue: { createNote: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn((ctx: ExecutionContext) => true) })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn((ctx: ExecutionContext) => true) })
      .compile();

    controller = module.get<CandidatesController>(CandidatesController);
    candidatesService = mockCandidatesService;
    profileService = mockProfileService;
    deduplicationService = mockDeduplicationService;
    mergeService = mockMergeService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ─── CREATE ─────────────────────────────────────────────────── */
  describe('POST /candidates', () => {
    it('should delegate to candidatesService.create with user fields', async () => {
      const dto = new CreateCandidateDto();
      Object.assign(dto, {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        source: 'RECRUITER_CREATED',
      });
      candidatesService.create.mockResolvedValue({ id: 'candidate-1' });

      const result = await controller.create(dto, mockUser);

      expect(candidatesService.create).toHaveBeenCalledWith(
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
        undefined,
      );
      expect(result).toEqual({ id: 'candidate-1' });
    });
  });

  /* ─── FIND ALL ───────────────────────────────────────────────── */
  describe('GET /candidates', () => {
    it('should delegate to candidatesService.findAll with query and hasSensitive=true when user has permission', async () => {
      const query = new CandidateQueryDto();
      query.page = 1;
      query.limit = 20;
      candidatesService.findAll.mockResolvedValue({ data: [], meta: {} });

      const result = await controller.findAll(query, mockUser);

      expect(candidatesService.findAll).toHaveBeenCalledWith(query, true, 'company-1');
      expect(result).toEqual({ data: [], meta: {} });
    });

    it('should pass hasSensitive=false when user lacks permission', async () => {
      const query = new CandidateQueryDto();
      const userWithoutSensitive = { ...mockUser, permissions: ['candidates.read'] };
      candidatesService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(query, userWithoutSensitive);

      expect(candidatesService.findAll).toHaveBeenCalledWith(query, false, 'company-1');
    });
  });

  /* ─── SEARCH ─────────────────────────────────────────────────── */
  describe('GET /candidates/search', () => {
    it('should delegate to candidatesService.findAll', async () => {
      const query = new CandidateQueryDto();
      query.search = 'john';
      candidatesService.findAll.mockResolvedValue({ data: [], meta: {} });

      const result = await controller.search(query, mockUser);

      expect(candidatesService.findAll).toHaveBeenCalledWith(query, true, 'company-1');
      expect(result).toEqual({ data: [], meta: {} });
    });
  });

  /* ─── FIND ONE ───────────────────────────────────────────────── */
  describe('GET /candidates/:candidateId', () => {
    it('should delegate to candidatesService.findById with hasSensitive', async () => {
      candidatesService.findById.mockResolvedValue({ id: 'candidate-1' });

      const result = await controller.findOne('candidate-1', mockUser);

      expect(candidatesService.findById).toHaveBeenCalledWith('candidate-1', true);
      expect(result).toEqual({ id: 'candidate-1' });
    });

    it('should pass hasSensitive=false when user lacks permission', async () => {
      const userWithoutSensitive = { ...mockUser, permissions: ['candidates.read'] };

      await controller.findOne('candidate-1', userWithoutSensitive);

      expect(candidatesService.findById).toHaveBeenCalledWith('candidate-1', false);
    });
  });

  /* ─── UPDATE ─────────────────────────────────────────────────── */
  describe('PATCH /candidates/:candidateId', () => {
    it('should delegate to candidatesService.update with UpdateCandidateDto', async () => {
      const dto = new UpdateCandidateDto();
      Object.assign(dto, { firstName: 'Jane', expectedVersion: 1 });
      candidatesService.update.mockResolvedValue({ id: 'candidate-1' });

      const result = await controller.update('candidate-1', dto, mockUser);

      expect(candidatesService.update).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'candidate-1' });
    });
  });

  /* ─── STATUS MANAGEMENT ─────────────────────────────────────── */
  describe('POST /candidates/:candidateId/archive', () => {
    it('should delegate to candidatesService.archive', async () => {
      const dto = { expectedVersion: 1, reason: 'No longer needed' };
      candidatesService.archive.mockResolvedValue({ archived: true });

      const result = await controller.archive('candidate-1', dto, mockUser);

      expect(candidatesService.archive).toHaveBeenCalledWith(
        'candidate-1',
        dto.expectedVersion,
        dto.reason,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ archived: true });
    });

    it('should delegate without reason when not provided', async () => {
      const dto = { expectedVersion: 1 };
      candidatesService.archive.mockResolvedValue({ archived: true });

      await controller.archive('candidate-1', dto, mockUser);

      expect(candidatesService.archive).toHaveBeenCalledWith(
        'candidate-1',
        dto.expectedVersion,
        undefined,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
    });
  });

  describe('POST /candidates/:candidateId/restore', () => {
    it('should delegate to candidatesService.restore', async () => {
      const dto = { expectedVersion: 1, reason: 'Restored' };
      candidatesService.restore.mockResolvedValue({ restored: true });

      const result = await controller.restore('candidate-1', dto, mockUser);

      expect(candidatesService.restore).toHaveBeenCalledWith(
        'candidate-1',
        dto.expectedVersion,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ restored: true });
    });
  });

  describe('POST /candidates/:candidateId/block', () => {
    it('should delegate to candidatesService.block', async () => {
      const dto = { reasonCode: 'SPAM', reason: 'Spam candidate', expectedVersion: 1 };
      candidatesService.block.mockResolvedValue({ blocked: true });

      const result = await controller.block('candidate-1', dto, mockUser);

      expect(candidatesService.block).toHaveBeenCalledWith(
        'candidate-1',
        dto.reasonCode,
        dto.reason,
        dto.expectedVersion,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ blocked: true });
    });
  });

  describe('POST /candidates/:candidateId/unblock', () => {
    it('should delegate to candidatesService.unblock', async () => {
      const dto = { expectedVersion: 1 };
      candidatesService.unblock.mockResolvedValue({ unblocked: true });

      const result = await controller.unblock('candidate-1', dto, mockUser);

      expect(candidatesService.unblock).toHaveBeenCalledWith(
        'candidate-1',
        dto.expectedVersion,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ unblocked: true });
    });
  });

  /* ─── DUPLICATE DETECTION & MERGE ────────────────────────────── */
  describe('GET /candidates/:candidateId/duplicates', () => {
    it('should fetch candidate and delegate to deduplicationService.checkBeforeCreate', async () => {
      const candidateData = {
        id: 'candidate-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+15551234567',
      };
      candidatesService.findById.mockResolvedValue(candidateData);
      deduplicationService.checkBeforeCreate.mockResolvedValue({ blocked: false, duplicates: [] });

      const result = await controller.findDuplicates('candidate-1');

      expect(candidatesService.findById).toHaveBeenCalledWith('candidate-1', false);
      expect(deduplicationService.checkBeforeCreate).toHaveBeenCalledWith({
        firstName: candidateData.firstName,
        lastName: candidateData.lastName,
        email: candidateData.email,
        phone: candidateData.phone,
        normalizedEmail: null,
        normalizedPhone: null,
      });
      expect(result).toEqual({ blocked: false, duplicates: [] });
    });
  });

  describe('POST /candidates/merge-preview', () => {
    it('should delegate to mergeService.buildMergePreview', async () => {
      const dto = { primaryCandidateId: 'primary-1', mergedCandidateId: 'merged-1' };
      mergeService.buildMergePreview.mockResolvedValue({ fieldConflicts: {} });

      const result = await controller.mergePreview(dto);

      expect(mergeService.buildMergePreview).toHaveBeenCalledWith(
        dto.primaryCandidateId,
        dto.mergedCandidateId,
      );
      expect(result).toEqual({ fieldConflicts: {} });
    });
  });

  describe('POST /candidates/merge', () => {
    it('should delegate to mergeService.executeMerge with all params', async () => {
      const dto = {
        primaryCandidateId: 'primary-1',
        mergedCandidateId: 'merged-1',
        reason: 'Duplicate',
        fieldResolution: { email: 'primary' as const },
        expectedPrimaryVersion: 1,
        expectedMergedVersion: 1,
      };
      mergeService.executeMerge.mockResolvedValue({ id: 'primary-1' });

      const result = await controller.merge(dto, mockUser);

      expect(mergeService.executeMerge).toHaveBeenCalledWith(
        dto.primaryCandidateId,
        dto.mergedCandidateId,
        dto.reason,
        dto.fieldResolution,
        dto.expectedPrimaryVersion,
        dto.expectedMergedVersion,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'primary-1' });
    });
  });

  /* ─── ACTIVITY ───────────────────────────────────────────────── */
  describe('GET /candidates/:candidateId/activity', () => {
    it('should delegate to candidatesService.getActivity with defaults', async () => {
      candidatesService.getActivity.mockResolvedValue({ data: [], meta: {} });

      const result = await controller.getActivity('candidate-1');

      expect(candidatesService.getActivity).toHaveBeenCalledWith('candidate-1', 1, 20, undefined);
      expect(result).toEqual({ data: [], meta: {} });
    });

    it('should pass parsed pagination and eventType filters', async () => {
      candidatesService.getActivity.mockResolvedValue({ data: [], meta: {} });

      await controller.getActivity('candidate-1', '2', '10', 'CANDIDATE_UPDATED');

      expect(candidatesService.getActivity).toHaveBeenCalledWith(
        'candidate-1',
        2,
        10,
        'CANDIDATE_UPDATED',
      );
    });
  });

  /* ─── SKILLS ─────────────────────────────────────────────────── */
  describe('Skill sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/skills should call profileService.getSkills', async () => {
      profileService.getSkills.mockResolvedValue([]);
      const result = await controller.getSkills('candidate-1');
      expect(profileService.getSkills).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/skills should call profileService.addSkill', async () => {
      const dto = { skillId: 'skill-1', proficiencyLevel: 'Advanced' };
      profileService.addSkill.mockResolvedValue({ id: 'cs-1' });

      const result = await controller.addSkill('candidate-1', dto, mockUser);

      expect(profileService.addSkill).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'cs-1' });
    });

    it('PATCH /candidates/:candidateId/skills/:candidateSkillId should call profileService.updateSkill', async () => {
      const dto = { proficiencyLevel: 'Expert' };
      profileService.updateSkill.mockResolvedValue({ id: 'cs-1' });

      const result = await controller.updateSkill('candidate-1', 'cs-1', dto, mockUser);

      expect(profileService.updateSkill).toHaveBeenCalledWith(
        'candidate-1',
        'cs-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'cs-1' });
    });

    it('DELETE /candidates/:candidateId/skills/:candidateSkillId should call profileService.removeSkill', async () => {
      profileService.removeSkill.mockResolvedValue({ removed: true });

      const result = await controller.removeSkill('candidate-1', 'cs-1', mockUser);

      expect(profileService.removeSkill).toHaveBeenCalledWith(
        'candidate-1',
        'cs-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ removed: true });
    });
  });

  /* ─── EMPLOYMENT ─────────────────────────────────────────────── */
  describe('Employment sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/employment should call profileService.getEmployment', async () => {
      profileService.getEmployment.mockResolvedValue([]);
      const result = await controller.getEmployment('candidate-1');
      expect(profileService.getEmployment).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/employment should call profileService.addEmployment', async () => {
      const dto = {
        type: 'FULL_TIME',
        companyName: 'Acme',
        jobTitle: 'Dev',
        startDate: '2020-01-01',
      };
      profileService.addEmployment.mockResolvedValue({ id: 'emp-1' });

      const result = await controller.addEmployment('candidate-1', dto, mockUser);

      expect(profileService.addEmployment).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'emp-1' });
    });

    it('PATCH /candidates/:candidateId/employment/:employmentId should call profileService.updateEmployment', async () => {
      const dto = { jobTitle: 'Senior Dev' };
      profileService.updateEmployment.mockResolvedValue({ id: 'emp-1' });

      const result = await controller.updateEmployment('candidate-1', 'emp-1', dto, mockUser);

      expect(profileService.updateEmployment).toHaveBeenCalledWith(
        'candidate-1',
        'emp-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'emp-1' });
    });

    it('DELETE /candidates/:candidateId/employment/:employmentId should call profileService.removeEmployment', async () => {
      profileService.removeEmployment.mockResolvedValue({ removed: true });

      const result = await controller.removeEmployment('candidate-1', 'emp-1', mockUser);

      expect(profileService.removeEmployment).toHaveBeenCalledWith(
        'candidate-1',
        'emp-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ removed: true });
    });

    it('POST /candidates/:candidateId/employment/reorder should call profileService.reorderEmployment', async () => {
      const dto = { employmentIds: ['e1', 'e2'] };
      profileService.reorderEmployment.mockResolvedValue({ reordered: true });

      const result = await controller.reorderEmployment('candidate-1', dto, mockUser);

      expect(profileService.reorderEmployment).toHaveBeenCalledWith(
        'candidate-1',
        dto.employmentIds,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ reordered: true });
    });
  });

  /* ─── EDUCATION ──────────────────────────────────────────────── */
  describe('Education sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/education should call profileService.getEducation', async () => {
      profileService.getEducation.mockResolvedValue([]);
      const result = await controller.getEducation('candidate-1');
      expect(profileService.getEducation).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/education should call profileService.addEducation', async () => {
      const dto = { institution: 'MIT', level: 'BACHELOR', status: 'COMPLETED' };
      profileService.addEducation.mockResolvedValue({ id: 'edu-1' });

      const result = await controller.addEducation('candidate-1', dto, mockUser);

      expect(profileService.addEducation).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'edu-1' });
    });

    it('DELETE /candidates/:candidateId/education/:educationId should call profileService.removeEducation', async () => {
      profileService.removeEducation.mockResolvedValue({ removed: true });

      const result = await controller.removeEducation('candidate-1', 'edu-1', mockUser);

      expect(profileService.removeEducation).toHaveBeenCalledWith(
        'candidate-1',
        'edu-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ removed: true });
    });

    it('POST /candidates/:candidateId/education/reorder should call profileService.reorderEducation', async () => {
      const dto = { educationIds: ['e1', 'e2'] };
      profileService.reorderEducation.mockResolvedValue({ reordered: true });

      const result = await controller.reorderEducation('candidate-1', dto, mockUser);

      expect(profileService.reorderEducation).toHaveBeenCalledWith(
        'candidate-1',
        dto.educationIds,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ reordered: true });
    });
  });

  /* ─── CERTIFICATIONS ─────────────────────────────────────────── */
  describe('Certification sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/certifications should call profileService.getCertifications', async () => {
      profileService.getCertifications.mockResolvedValue([]);
      const result = await controller.getCertifications('candidate-1');
      expect(profileService.getCertifications).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/certifications should call profileService.addCertification', async () => {
      const dto = { name: 'AWS CPA', issuingOrganization: 'Amazon' };
      profileService.addCertification.mockResolvedValue({ id: 'cert-1' });

      const result = await controller.addCertification('candidate-1', dto, mockUser);

      expect(profileService.addCertification).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'cert-1' });
    });

    it('DELETE /candidates/:candidateId/certifications/:certificationId should call profileService.removeCertification', async () => {
      profileService.removeCertification.mockResolvedValue({ removed: true });

      const result = await controller.removeCertification('candidate-1', 'cert-1', mockUser);

      expect(profileService.removeCertification).toHaveBeenCalledWith(
        'candidate-1',
        'cert-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ removed: true });
    });
  });

  /* ─── LANGUAGES ──────────────────────────────────────────────── */
  describe('Language sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/languages should call profileService.getLanguages', async () => {
      profileService.getLanguages.mockResolvedValue([]);
      const result = await controller.getLanguages('candidate-1');
      expect(profileService.getLanguages).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/languages should call profileService.addLanguage', async () => {
      const dto = { languageCode: 'en', proficiency: 'NATIVE' };
      profileService.addLanguage.mockResolvedValue({ id: 'lang-1' });

      const result = await controller.addLanguage('candidate-1', dto, mockUser);

      expect(profileService.addLanguage).toHaveBeenCalledWith(
        'candidate-1',
        dto,
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ id: 'lang-1' });
    });

    it('POST /candidates/:candidateId/languages/:languageId/set-preferred should call profileService.setPreferredLanguage', async () => {
      profileService.setPreferredLanguage.mockResolvedValue({ preferredLanguage: 'en' });

      const result = await controller.setPreferredLanguage('candidate-1', 'lang-1', mockUser);

      expect(profileService.setPreferredLanguage).toHaveBeenCalledWith(
        'candidate-1',
        'lang-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ preferredLanguage: 'en' });
    });

    it('DELETE /candidates/:candidateId/languages/:languageId should call profileService.removeLanguage', async () => {
      profileService.removeLanguage.mockResolvedValue({ removed: true });

      const result = await controller.removeLanguage('candidate-1', 'lang-1', mockUser);

      expect(profileService.removeLanguage).toHaveBeenCalledWith(
        'candidate-1',
        'lang-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ removed: true });
    });
  });

  /* ─── CONSENTS ───────────────────────────────────────────────── */
  describe('Consent sub-resource endpoints', () => {
    it('GET /candidates/:candidateId/consents should call profileService.getConsents', async () => {
      profileService.getConsents.mockResolvedValue([]);
      const result = await controller.getConsents('candidate-1');
      expect(profileService.getConsents).toHaveBeenCalledWith('candidate-1');
      expect(result).toEqual([]);
    });

    it('POST /candidates/:candidateId/consents/grant should call profileService.grantConsent', async () => {
      const dto = { type: 'DATA_PROCESSING', policyVersion: '2.0' };
      profileService.grantConsent.mockResolvedValue({ id: 'consent-1' });

      const result = await controller.grantConsent('candidate-1', dto, mockUser);

      expect(profileService.grantConsent).toHaveBeenCalledWith(
        'candidate-1',
        { ...dto, companyId: mockUser.activeCompanyId },
        mockUser.userId,
        mockUser.membershipId,
        undefined,
      );
      expect(result).toEqual({ id: 'consent-1' });
    });

    it('POST /candidates/:candidateId/consents/:consentId/revoke should call profileService.revokeConsent', async () => {
      profileService.revokeConsent.mockResolvedValue({ revoked: true });

      const result = await controller.revokeConsent('candidate-1', 'consent-1', mockUser);

      expect(profileService.revokeConsent).toHaveBeenCalledWith(
        'candidate-1',
        'consent-1',
        mockUser.userId,
        mockUser.membershipId,
        mockUser.activeCompanyId,
        undefined,
      );
      expect(result).toEqual({ revoked: true });
    });
  });
});
