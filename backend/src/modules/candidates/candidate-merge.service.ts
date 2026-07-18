import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { CandidateAuditService } from './candidate-audit.service';
import { CandidateAuditEventType, Prisma } from '@prisma/client';

@Injectable()
export class CandidateMergeService {
  private readonly logger = new Logger(CandidateMergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: CandidateAuditService,
  ) {}

  async buildMergePreview(primaryId: string, mergedId: string) {
    if (primaryId === mergedId) {
      throw new BadRequestException('Cannot merge a candidate with itself');
    }

    const [primary, merged] = await Promise.all([
      this.prisma.candidate.findUnique({ where: { id: primaryId } }),
      this.prisma.candidate.findUnique({ where: { id: mergedId } }),
    ]);

    if (!primary || !merged) {
      throw new BadRequestException('One or both candidates not found');
    }

    if (
      primary.status === 'MERGED' ||
      primary.status === 'DELETED' ||
      primary.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException('Primary candidate cannot be merged, deleted, or anonymized');
    }

    if (
      merged.status === 'MERGED' ||
      merged.status === 'DELETED' ||
      merged.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException(
        'Merged candidate cannot already be merged, deleted, or anonymized',
      );
    }

    const [
      primarySkills,
      mergedSkills,
      primaryEmployment,
      mergedEmployment,
      primaryEducation,
      mergedEducation,
      primaryCerts,
      mergedCerts,
      primaryLanguages,
      mergedLanguages,
      primaryConsents,
      mergedConsents,
    ] = await Promise.all([
      this.prisma.candidateSkill.findMany({
        where: { candidateId: primaryId },
        include: { skill: true },
      }),
      this.prisma.candidateSkill.findMany({
        where: { candidateId: mergedId },
        include: { skill: true },
      }),
      this.prisma.candidateEmployment.findMany({
        where: { candidateId: primaryId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.candidateEmployment.findMany({
        where: { candidateId: mergedId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.candidateEducation.findMany({
        where: { candidateId: primaryId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.candidateEducation.findMany({
        where: { candidateId: mergedId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.candidateCertification.findMany({ where: { candidateId: primaryId } }),
      this.prisma.candidateCertification.findMany({ where: { candidateId: mergedId } }),
      this.prisma.candidateLanguage.findMany({ where: { candidateId: primaryId } }),
      this.prisma.candidateLanguage.findMany({ where: { candidateId: mergedId } }),
      this.prisma.candidateConsent.findMany({ where: { candidateId: primaryId } }),
      this.prisma.candidateConsent.findMany({ where: { candidateId: mergedId } }),
    ]);

    const fieldComparison: Record<
      string,
      { primary: unknown; merged: unknown; conflict: boolean }
    > = {};
    const fields = [
      'firstName',
      'middleName',
      'lastName',
      'email',
      'phone',
      'city',
      'countryCode',
      'headline',
      'summary',
      'currentJobTitle',
      'currentEmployer',
      'totalExperienceYears',
      'preferredLocale',
      'timezone',
      'linkedInUrl',
      'portfolioUrl',
      'personalWebsiteUrl',
    ];

    for (const field of fields) {
      const pVal = (primary as any)[field];
      const mVal = (merged as any)[field];
      if (
        pVal !== null &&
        pVal !== undefined &&
        mVal !== null &&
        mVal !== undefined &&
        pVal !== mVal
      ) {
        fieldComparison[field] = { primary: pVal, merged: mVal, conflict: true };
      }
    }

    const preferredLangPrimary = primaryLanguages.find((l) => l.preferredInterviewLanguage);
    const preferredLangMerged = mergedLanguages.find((l) => l.preferredInterviewLanguage);

    return {
      primary: {
        id: primary.id,
        version: primary.version,
        status: primary.status,
        displayName: `${primary.firstName} ${primary.lastName}`,
      },
      merged: {
        id: merged.id,
        version: merged.version,
        status: merged.status,
        displayName: `${merged.firstName} ${merged.lastName}`,
      },
      fieldConflicts: fieldComparison,
      skills: {
        primary: primarySkills.length,
        merged: mergedSkills.length,
        uniqueOnMerge: primarySkills.filter(
          (ps) => !mergedSkills.some((ms) => ms.skillId === ps.skillId),
        ).length,
      },
      employment: { primary: primaryEmployment.length, merged: mergedEmployment.length },
      education: { primary: primaryEducation.length, merged: mergedEducation.length },
      certifications: { primary: primaryCerts.length, merged: mergedCerts.length },
      languages: {
        primary: primaryLanguages.length,
        merged: mergedLanguages.length,
        preferredPrimary: preferredLangPrimary?.languageCode ?? null,
        preferredMerged: preferredLangMerged?.languageCode ?? null,
      },
      consents: { primary: primaryConsents.length, merged: mergedConsents.length },
    };
  }

  async executeMerge(
    primaryCandidateId: string,
    mergedCandidateId: string,
    reason: string | undefined,
    fieldResolution: Record<string, 'primary' | 'merged'> | undefined,
    expectedPrimaryVersion: number,
    expectedMergedVersion: number,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    if (primaryCandidateId === mergedCandidateId) {
      throw new BadRequestException('Cannot merge a candidate with itself');
    }

    const [primary, merged] = await Promise.all([
      this.prisma.candidate.findUnique({ where: { id: primaryCandidateId } }),
      this.prisma.candidate.findUnique({ where: { id: mergedCandidateId } }),
    ]);

    if (!primary || !merged) throw new BadRequestException('Candidate(s) not found');

    if (primary.version !== expectedPrimaryVersion) {
      throw new ConflictException('Primary candidate has stale version');
    }
    if (merged.version !== expectedMergedVersion) {
      throw new ConflictException('Merged candidate has stale version');
    }

    if (
      primary.status === 'MERGED' ||
      primary.status === 'DELETED' ||
      primary.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException('Primary candidate cannot be merged, deleted, or anonymized');
    }
    if (
      merged.status === 'MERGED' ||
      merged.status === 'DELETED' ||
      merged.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException(
        'Merged candidate cannot already be merged, deleted, or anonymized',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        version: primary.version + 1,
        lastProfileUpdatedAt: new Date(),
      };
      const fields = [
        'firstName',
        'middleName',
        'lastName',
        'email',
        'normalizedEmail',
        'phone',
        'normalizedPhone',
        'alternatePhone',
        'city',
        'stateOrProvince',
        'countryCode',
        'postalCode',
        'headline',
        'summary',
        'currentJobTitle',
        'currentEmployer',
        'totalExperienceYears',
        'preferredLocale',
        'timezone',
        'linkedInUrl',
        'portfolioUrl',
        'personalWebsiteUrl',
        'willingToRelocate',
        'remoteWorkPreference',
        'salaryExpectationMin',
        'salaryExpectationMax',
        'salaryCurrency',
        'noticePeriodDays',
        'availableFrom',
      ];

      for (const field of fields) {
        const primaryVal = (primary as any)[field];
        const mergedVal = (merged as any)[field];

        if (
          fieldResolution &&
          fieldResolution[field] === 'merged' &&
          mergedVal !== null &&
          mergedVal !== undefined
        ) {
          updateData[field] = mergedVal;
        } else if (primaryVal === null || primaryVal === undefined) {
          if (mergedVal !== null && mergedVal !== undefined) {
            updateData[field] = mergedVal;
          }
        }
      }

      const [primarySkills, mergedSkills] = await Promise.all([
        tx.candidateSkill.findMany({ where: { candidateId: primaryCandidateId } }),
        tx.candidateSkill.findMany({ where: { candidateId: mergedCandidateId } }),
      ]);

      const newSkills = mergedSkills.filter(
        (ms) => !primarySkills.some((ps) => ps.skillId === ms.skillId),
      );

      if (newSkills.length > 0) {
        await tx.candidateSkill.updateMany({
          where: { id: { in: newSkills.map((s) => s.id) } },
          data: { candidateId: primaryCandidateId },
        });
      }

      await tx.candidateEmployment.updateMany({
        where: { candidateId: mergedCandidateId },
        data: { candidateId: primaryCandidateId },
      });

      await tx.candidateEducation.updateMany({
        where: { candidateId: mergedCandidateId },
        data: { candidateId: primaryCandidateId },
      });

      await tx.candidateCertification.updateMany({
        where: { candidateId: mergedCandidateId },
        data: { candidateId: primaryCandidateId },
      });

      const [primaryLangs, mergedLangs] = await Promise.all([
        tx.candidateLanguage.findMany({ where: { candidateId: primaryCandidateId } }),
        tx.candidateLanguage.findMany({ where: { candidateId: mergedCandidateId } }),
      ]);

      const primaryCodes = new Set(primaryLangs.map((l) => l.languageCode));
      const newLangs = mergedLangs.filter((ml) => !primaryCodes.has(ml.languageCode));
      const duplicateLangs = mergedLangs.filter((ml) => primaryCodes.has(ml.languageCode));

      if (duplicateLangs.length > 0) {
        await tx.candidateLanguage.deleteMany({
          where: { id: { in: duplicateLangs.map((l) => l.id) } },
        });
      }
      if (newLangs.length > 0) {
        await tx.candidateLanguage.updateMany({
          where: { id: { in: newLangs.map((l) => l.id) } },
          data: { candidateId: primaryCandidateId },
        });
      }

      await tx.candidateConsent.updateMany({
        where: { candidateId: mergedCandidateId },
        data: { candidateId: primaryCandidateId },
      });

      const updated = await tx.candidate.update({
        where: { id: primaryCandidateId },
        data: updateData as any,
      });

      await tx.candidate.update({
        where: { id: mergedCandidateId },
        data: {
          status: 'MERGED',
          mergedIntoCandidateId: primaryCandidateId,
          version: merged.version + 1,
        },
      });

      await tx.candidateMergeRecord.create({
        data: {
          primaryCandidateId,
          mergedCandidateId,
          mergedByUserId: actorUserId ?? null,
          mergedByMembershipId: actorMembershipId ?? null,
          reason: reason ?? null,
          fieldResolution: (fieldResolution ?? undefined) as Prisma.InputJsonValue,
        },
      });

      await tx.candidateAuditEvent.createMany({
        data: [
          {
            candidateId: primaryCandidateId,
            companyId: companyId ?? null,
            actorUserId: actorUserId ?? null,
            actorMembershipId: actorMembershipId ?? null,
            eventType: 'CANDIDATE_MERGED' as CandidateAuditEventType,
            entityType: 'Candidate',
            entityId: mergedCandidateId,
            description: `Candidate merged into primary candidate ${primaryCandidateId}`,
            metadata: (fieldResolution
              ? { resolvedFields: Object.keys(fieldResolution) }
              : undefined) as Prisma.InputJsonValue,
            requestId: requestId ?? null,
          },
          {
            candidateId: mergedCandidateId,
            companyId: companyId ?? null,
            actorUserId: actorUserId ?? null,
            actorMembershipId: actorMembershipId ?? null,
            eventType: 'CANDIDATE_MERGED' as CandidateAuditEventType,
            entityType: 'Candidate',
            entityId: primaryCandidateId,
            description: 'Candidate merged into another profile',
            requestId: requestId ?? null,
          },
        ],
      });

      return updated;
    });
  }
}
