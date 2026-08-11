import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateAuditService } from './candidate-audit.service';
import * as crypto from 'crypto';
import {
  CandidateSkill,
  CandidateEmployment,
  CandidateEducation,
  CandidateCertification,
  CandidateLanguage,
  CandidateConsent,
  Prisma,
} from '@prisma/client';

@Injectable()
export class CandidateProfileService {
  private readonly logger = new Logger(CandidateProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: CandidateAuditService,
  ) {}

  private async assertCandidateExists(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    if (!candidate || candidate.status === 'DELETED' || candidate.status === 'ANONYMIZED') {
      throw new NotFoundException(`Candidate with ID ${id} not found`);
    }
    if (candidate.status === 'MERGED') {
      throw new BadRequestException('Cannot modify a merged candidate');
    }
    return candidate;
  }

  /* ══════════════════════════════════════════════════════════════
     SKILLS
     ══════════════════════════════════════════════════════════════ */
  async addSkill(
    candidateId: string,
    data: {
      skillId: string;
      proficiencyLevel?: string;
      yearsOfExperience?: number;
      lastUsedAt?: string;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const candidate = await this.assertCandidateExists(candidateId);

    const skill = await this.prisma.skill.findUnique({ where: { id: data.skillId } });
    if (!skill) throw new NotFoundException(`Skill with ID ${data.skillId} not found`);
    if (!skill.isGlobal && skill.companyId) {
      throw new BadRequestException('Only global skills can be added in this phase');
    }

    const existing = await this.prisma.candidateSkill.findUnique({
      where: { candidateId_skillId: { candidateId, skillId: data.skillId } },
    });
    if (existing) throw new ConflictException('Skill already exists for this candidate');

    if (data.yearsOfExperience !== undefined && data.yearsOfExperience < 0) {
      throw new BadRequestException('Years of experience cannot be negative');
    }

    const record = await this.prisma.candidateSkill.create({
      data: {
        candidateId,
        skillId: data.skillId,
        proficiencyLevel: data.proficiencyLevel ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null,
        lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
      },
      include: { skill: true },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_SKILL_ADDED',
      entityType: 'CandidateSkill',
      entityId: record.id,
      description: `Skill "${skill.displayName}" added to candidate`,
      metadata: { skillId: data.skillId },
      requestId,
    });

    return record;
  }

  async getSkills(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    return this.prisma.candidateSkill.findMany({
      where: { candidateId },
      include: { skill: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSkill(
    candidateId: string,
    candidateSkillId: string,
    data: {
      proficiencyLevel?: string;
      yearsOfExperience?: number;
      lastUsedAt?: string;
      verified?: boolean;
      verificationSource?: string;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const existing = await this.prisma.candidateSkill.findFirst({
      where: { id: candidateSkillId, candidateId },
    });
    if (!existing) throw new NotFoundException('Candidate skill not found');

    if (data.yearsOfExperience !== undefined && data.yearsOfExperience < 0) {
      throw new BadRequestException('Years of experience cannot be negative');
    }

    const updated = await this.prisma.candidateSkill.update({
      where: { id: candidateSkillId },
      data: {
        ...(data.proficiencyLevel !== undefined ? { proficiencyLevel: data.proficiencyLevel } : {}),
        ...(data.yearsOfExperience !== undefined
          ? { yearsOfExperience: data.yearsOfExperience }
          : {}),
        ...(data.lastUsedAt !== undefined
          ? { lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null }
          : {}),
        ...(data.verified !== undefined ? { verified: data.verified } : {}),
        ...(data.verificationSource !== undefined
          ? { verificationSource: data.verificationSource }
          : {}),
      },
      include: { skill: true },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_SKILL_UPDATED',
      entityType: 'CandidateSkill',
      entityId: candidateSkillId,
      description: 'Candidate skill updated',
      requestId,
    });

    return updated;
  }

  async removeSkill(
    candidateId: string,
    candidateSkillId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateSkill.findFirst({
      where: { id: candidateSkillId, candidateId },
    });
    if (!existing) throw new NotFoundException('Candidate skill not found');

    await this.prisma.candidateSkill.delete({ where: { id: candidateSkillId } });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_SKILL_REMOVED',
      entityType: 'CandidateSkill',
      entityId: candidateSkillId,
      description: 'Candidate skill removed',
      requestId,
    });

    return { removed: true };
  }

  /* ══════════════════════════════════════════════════════════════
     EMPLOYMENT
     ══════════════════════════════════════════════════════════════ */
  async addEmployment(
    candidateId: string,
    data: {
      type: string;
      companyName: string;
      jobTitle: string;
      location?: string;
      startDate: string;
      endDate?: string;
      currentlyWorking?: boolean;
      description?: string;
      achievements?: string;
      industry?: string;
      sortOrder?: number;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }
    if (data.currentlyWorking && endDate) {
      throw new BadRequestException('Cannot have end date when currently working');
    }

    const record = await this.prisma.candidateEmployment.create({
      data: {
        candidateId,
        type: data.type as any,
        companyName: data.companyName.trim(),
        jobTitle: data.jobTitle.trim(),
        location: data.location?.trim() ?? null,
        startDate,
        endDate,
        currentlyWorking: data.currentlyWorking ?? false,
        description: data.description?.trim() ?? null,
        achievements: data.achievements?.trim() ?? null,
        industry: data.industry?.trim() ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_EMPLOYMENT_ADDED',
      entityType: 'CandidateEmployment',
      entityId: record.id,
      description: `Employment at "${data.companyName}" added`,
      requestId,
    });

    return record;
  }

  async getEmployment(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    return this.prisma.candidateEmployment.findMany({
      where: { candidateId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateEmployment(
    candidateId: string,
    employmentId: string,
    data: {
      type?: string;
      companyName?: string;
      jobTitle?: string;
      location?: string;
      startDate?: string;
      endDate?: string | null;
      currentlyWorking?: boolean;
      description?: string;
      achievements?: string;
      industry?: string;
      sortOrder?: number;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateEmployment.findFirst({
      where: { id: employmentId, candidateId },
    });
    if (!existing) throw new NotFoundException('Employment record not found');

    const startDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    const endDate =
      data.endDate !== undefined
        ? data.endDate
          ? new Date(data.endDate)
          : null
        : existing.endDate;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }
    if ((data.currentlyWorking ?? existing.currentlyWorking) && endDate) {
      throw new BadRequestException('Cannot have end date when currently working');
    }

    const updated = await this.prisma.candidateEmployment.update({
      where: { id: employmentId },
      data: {
        ...(data.type !== undefined ? { type: data.type as any } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName.trim() } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle.trim() } : {}),
        ...(data.location !== undefined ? { location: data.location?.trim() ?? null } : {}),
        ...(data.startDate !== undefined ? { startDate } : {}),
        ...(data.endDate !== undefined ? { endDate } : {}),
        ...(data.currentlyWorking !== undefined ? { currentlyWorking: data.currentlyWorking } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() ?? null }
          : {}),
        ...(data.achievements !== undefined
          ? { achievements: data.achievements?.trim() ?? null }
          : {}),
        ...(data.industry !== undefined ? { industry: data.industry?.trim() ?? null } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_EMPLOYMENT_UPDATED',
      entityType: 'CandidateEmployment',
      entityId: employmentId,
      description: 'Employment record updated',
      requestId,
    });

    return updated;
  }

  async removeEmployment(
    candidateId: string,
    employmentId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateEmployment.findFirst({
      where: { id: employmentId, candidateId },
    });
    if (!existing) throw new NotFoundException('Employment record not found');

    await this.prisma.candidateEmployment.delete({ where: { id: employmentId } });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_EMPLOYMENT_REMOVED',
      entityType: 'CandidateEmployment',
      entityId: employmentId,
      description: 'Employment record removed',
      requestId,
    });

    return { removed: true };
  }

  async reorderEmployment(
    candidateId: string,
    employmentIds: string[],
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    await this.prisma.$transaction(
      employmentIds.map((id, idx) =>
        this.prisma.candidateEmployment.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return { reordered: true };
  }

  /* ══════════════════════════════════════════════════════════════
     EDUCATION
     ══════════════════════════════════════════════════════════════ */
  async addEducation(
    candidateId: string,
    data: {
      institution: string;
      level: string;
      fieldOfStudy?: string;
      status: string;
      startDate?: string;
      endDate?: string;
      grade?: string;
      description?: string;
      sortOrder?: number;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const startDate = data.startDate ? new Date(data.startDate) : null;
    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const record = await this.prisma.candidateEducation.create({
      data: {
        candidateId,
        institution: data.institution.trim(),
        level: data.level as any,
        fieldOfStudy: data.fieldOfStudy?.trim() ?? null,
        status: data.status as any,
        startDate,
        endDate,
        grade: data.grade?.trim() ?? null,
        description: data.description?.trim() ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_EDUCATION_ADDED',
      entityType: 'CandidateEducation',
      entityId: record.id,
      description: `Education at "${data.institution}" added`,
      requestId,
    });

    return record;
  }

  async getEducation(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    return this.prisma.candidateEducation.findMany({
      where: { candidateId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async removeEducation(
    candidateId: string,
    educationId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateEducation.findFirst({
      where: { id: educationId, candidateId },
    });
    if (!existing) throw new NotFoundException('Education record not found');
    await this.prisma.candidateEducation.delete({ where: { id: educationId } });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_EDUCATION_REMOVED',
      entityType: 'CandidateEducation',
      entityId: educationId,
      description: 'Education record removed',
      requestId,
    });
    return { removed: true };
  }

  async reorderEducation(
    candidateId: string,
    educationIds: string[],
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    await this.prisma.$transaction(
      educationIds.map((id, idx) =>
        this.prisma.candidateEducation.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return { reordered: true };
  }

  /* ══════════════════════════════════════════════════════════════
     CERTIFICATIONS
     ══════════════════════════════════════════════════════════════ */
  async addCertification(
    candidateId: string,
    data: {
      name: string;
      issuingOrganization: string;
      issuedAt?: string;
      expiresAt?: string;
      credentialId?: string;
      credentialUrl?: string;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const issuedAt = data.issuedAt ? new Date(data.issuedAt) : null;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw new BadRequestException('Expiry date cannot be before issue date');
    }

    const record = await this.prisma.candidateCertification.create({
      data: {
        candidateId,
        name: data.name.trim(),
        issuingOrganization: data.issuingOrganization.trim(),
        issuedAt,
        expiresAt,
        credentialId: data.credentialId?.trim() ?? null,
        credentialUrl: data.credentialUrl?.trim() ?? null,
      },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_CERTIFICATION_ADDED',
      entityType: 'CandidateCertification',
      entityId: record.id,
      description: `Certification "${data.name}" added`,
      requestId,
    });

    return record;
  }

  async getCertifications(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    return this.prisma.candidateCertification.findMany({
      where: { candidateId },
    });
  }

  async removeCertification(
    candidateId: string,
    certificationId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateCertification.findFirst({
      where: { id: certificationId, candidateId },
    });
    if (!existing) throw new NotFoundException('Certification not found');
    await this.prisma.candidateCertification.delete({ where: { id: certificationId } });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_CERTIFICATION_REMOVED',
      entityType: 'CandidateCertification',
      entityId: certificationId,
      description: 'Certification removed',
      requestId,
    });
    return { removed: true };
  }

  /* ══════════════════════════════════════════════════════════════
     LANGUAGES
     ══════════════════════════════════════════════════════════════ */
  async addLanguage(
    candidateId: string,
    data: { languageCode: string; proficiency: string; preferredInterviewLanguage?: boolean },
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const existing = await this.prisma.candidateLanguage.findUnique({
      where: { candidateId_languageCode: { candidateId, languageCode: data.languageCode } },
    });
    if (existing) throw new ConflictException('Language already exists for this candidate');

    if (data.preferredInterviewLanguage) {
      await this.prisma.candidateLanguage.updateMany({
        where: { candidateId, preferredInterviewLanguage: true },
        data: { preferredInterviewLanguage: false },
      });
    }

    const record = await this.prisma.candidateLanguage.create({
      data: {
        candidateId,
        languageCode: data.languageCode,
        proficiency: data.proficiency as any,
        preferredInterviewLanguage: data.preferredInterviewLanguage ?? false,
      },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_LANGUAGE_ADDED',
      entityType: 'CandidateLanguage',
      entityId: record.id,
      description: `Language "${data.languageCode}" added`,
      metadata: { languageCode: data.languageCode },
      requestId,
    });

    return record;
  }

  async getLanguages(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    return this.prisma.candidateLanguage.findMany({ where: { candidateId } });
  }

  async setPreferredLanguage(
    candidateId: string,
    languageId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const lang = await this.prisma.candidateLanguage.findFirst({
      where: { id: languageId, candidateId },
    });
    if (!lang) throw new NotFoundException('Language not found');

    await this.prisma.$transaction([
      this.prisma.candidateLanguage.updateMany({
        where: { candidateId, preferredInterviewLanguage: true },
        data: { preferredInterviewLanguage: false },
      }),
      this.prisma.candidateLanguage.update({
        where: { id: languageId },
        data: { preferredInterviewLanguage: true },
      }),
    ]);

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_LANGUAGE_UPDATED',
      entityType: 'CandidateLanguage',
      entityId: languageId,
      description: `Preferred interview language set to "${lang.languageCode}"`,
      requestId,
    });

    return { preferredLanguage: lang.languageCode };
  }

  async removeLanguage(
    candidateId: string,
    languageId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateLanguage.findFirst({
      where: { id: languageId, candidateId },
    });
    if (!existing) throw new NotFoundException('Language not found');
    await this.prisma.candidateLanguage.delete({ where: { id: languageId } });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_LANGUAGE_REMOVED',
      entityType: 'CandidateLanguage',
      entityId: languageId,
      description: `Language "${existing.languageCode}" removed`,
      requestId,
    });
    return { removed: true };
  }

  /* ══════════════════════════════════════════════════════════════
     CONSENTS
     ══════════════════════════════════════════════════════════════ */
  async grantConsent(
    candidateId: string,
    data: {
      type: string;
      policyVersion: string;
      companyId?: string;
      sourceIp?: string;
      userAgent?: string;
    },
    actorUserId?: string,
    actorMembershipId?: string | null,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);

    const record = await this.prisma.candidateConsent.create({
      data: {
        candidateId,
        companyId: data.companyId ?? null,
        type: data.type as any,
        status: 'GRANTED',
        policyVersion: data.policyVersion,
        grantedAt: new Date(),
        sourceIpHash: data.sourceIp ? this.hashIp(data.sourceIp) : null,
        userAgent: data.userAgent?.slice(0, 500) ?? null,
      },
    });

    await this.auditService.record({
      candidateId,
      companyId: data.companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CONSENT_GRANTED',
      entityType: 'CandidateConsent',
      entityId: record.id,
      description: `Consent "${data.type}" granted (v${data.policyVersion})`,
      metadata: { type: data.type, policyVersion: data.policyVersion },
      requestId,
    });

    return record;
  }

  async revokeConsent(
    candidateId: string,
    consentId: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    await this.assertCandidateExists(candidateId);
    const existing = await this.prisma.candidateConsent.findFirst({
      where: { id: consentId, candidateId },
    });
    if (!existing) throw new NotFoundException('Consent record not found');
    if (existing.status === 'REVOKED') return { revoked: true, status: 'already_revoked' };

    await this.prisma.candidateConsent.update({
      where: { id: consentId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await this.auditService.record({
      candidateId,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CONSENT_REVOKED',
      entityType: 'CandidateConsent',
      entityId: consentId,
      description: `Consent "${existing.type}" revoked`,
      metadata: { type: existing.type, policyVersion: existing.policyVersion },
      requestId,
    });

    return { revoked: true };
  }

  async getConsents(candidateId: string) {
    await this.assertCandidateExists(candidateId);
    const records = await this.prisma.candidateConsent.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      policyVersion: r.policyVersion,
      grantedAt: r.grantedAt,
      revokedAt: r.revokedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }
}
