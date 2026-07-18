import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  CompanyCandidateStatus,
  CandidateSource,
  ApplicationAuditEventType,
  ApplicationActorType,
  Prisma,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';

export interface LinkCandidateDto {
  source?: CandidateSource;
  sourceDetail?: string;
  ownerMembershipId?: string;
  talentPoolEnabled?: boolean;
}

export interface UpdateCompanyProfileDto {
  ownerMembershipId?: string | null;
  talentPoolEnabled?: boolean;
  doNotContact?: boolean;
  doNotContactReason?: string | null;
  rating?: number | null;
  internalSummary?: string | null;
  sourceDetail?: string | null;
  expectedVersion: number;
}

@Injectable()
export class CompanyCandidateService {
  private readonly logger = new Logger(CompanyCandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  /** Find or create a CompanyCandidate record. Used by Application creation flow. */
  async findOrCreate(
    companyId: string,
    candidateId: string,
    source: CandidateSource,
    sourceDetail?: string,
    ownerMembershipId?: string,
    membershipId?: string,
    userId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const existing = await (client as any).companyCandidate.findUnique({
      where: { companyId_candidateId: { companyId, candidateId } },
    });

    if (existing) {
      // Update lastActivityAt
      await (client as any).companyCandidate.update({
        where: { id: existing.id },
        data: { lastActivityAt: new Date() },
      });
      return existing;
    }

    // Validate candidate exists
    const candidate = await (client as any).candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const cc = await (client as any).companyCandidate.create({
      data: {
        companyId,
        candidateId,
        status: CompanyCandidateStatus.ACTIVE,
        source,
        sourceDetail: sourceDetail ?? null,
        ownerMembershipId: ownerMembershipId ?? null,
        createdByMembershipId: membershipId ?? null,
        firstSeenAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await this.auditService.record({
      companyId,
      eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_CREATED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'CompanyCandidate',
      entityId: cc.id,
      description: 'Candidate linked to company',
      companyCandidateId: cc.id,
      candidateId,
      actorUserId: userId,
      actorMembershipId: membershipId,
      tx: tx as any,
    });

    return cc;
  }

  async linkCandidate(
    candidateId: string,
    companyId: string,
    dto: LinkCandidateDto,
    userId: string,
    membershipId: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.companyCandidate.findUnique({
      where: { companyId_candidateId: { companyId, candidateId } },
    });
    if (existing && existing.deletedAt === null) {
      throw new ConflictException({
        code: 'COMPANY_CANDIDATE_EXISTS',
        message: 'Candidate already linked to this company',
      });
    }

    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found');

    if (dto.ownerMembershipId) {
      const owner = await this.prisma.companyMembership.findFirst({
        where: { id: dto.ownerMembershipId, companyId, status: 'ACTIVE' },
      });
      if (!owner)
        throw new BadRequestException({
          code: 'COMPANY_CANDIDATE_OWNER_INVALID',
          message: 'Owner must be an active member of this company',
        });
    }

    return this.prisma.$transaction(async (tx) => {
      const cc = await tx.companyCandidate.upsert({
        where: { companyId_candidateId: { companyId, candidateId } },
        update: {
          deletedAt: null,
          status: CompanyCandidateStatus.ACTIVE,
          lastActivityAt: new Date(),
        },
        create: {
          companyId,
          candidateId,
          status: CompanyCandidateStatus.ACTIVE,
          source: dto.source ?? candidate.source,
          sourceDetail: dto.sourceDetail ?? null,
          ownerMembershipId: dto.ownerMembershipId ?? null,
          createdByMembershipId: membershipId,
          firstSeenAt: new Date(),
          lastActivityAt: new Date(),
          talentPoolEnabled: dto.talentPoolEnabled ?? false,
        },
      });

      await this.auditService.record({
        companyId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_CREATED,
        actorType: ApplicationActorType.RECRUITER,
        entityType: 'CompanyCandidate',
        entityId: cc.id,
        description: 'Candidate linked to company',
        companyCandidateId: cc.id,
        candidateId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        requestId,
        tx,
      });

      return cc;
    });
  }

  async archive(
    candidateId: string,
    companyId: string,
    expectedVersion: number,
    reason?: string,
    userId?: string,
    membershipId?: string,
    requestId?: string,
  ) {
    const cc = await this.prisma.companyCandidate.findFirst({
      where: { candidateId, companyId, deletedAt: null },
    });
    if (!cc)
      throw new NotFoundException({
        code: 'COMPANY_CANDIDATE_NOT_FOUND',
        message: 'Company-candidate relationship not found',
      });
    if (cc.version !== expectedVersion) {
      throw new ConflictException({
        code: 'COMPANY_CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: cc.version,
      });
    }
    if (cc.status === CompanyCandidateStatus.ARCHIVED)
      return { archived: true, status: 'already_archived' };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyCandidate.update({
        where: { id: cc.id },
        data: {
          status: CompanyCandidateStatus.ARCHIVED,
          deletedAt: new Date(),
          version: cc.version + 1,
        },
      });

      await this.auditService.record({
        companyId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_ARCHIVED,
        actorType: ApplicationActorType.RECRUITER,
        entityType: 'CompanyCandidate',
        entityId: cc.id,
        description: 'Candidate archived at company level',
        companyCandidateId: cc.id,
        candidateId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        metadata: reason ? { reason } : undefined,
        requestId,
        tx,
      });

      return { archived: true, version: updated.version };
    });
  }

  async restore(
    candidateId: string,
    companyId: string,
    expectedVersion: number,
    userId?: string,
    membershipId?: string,
    requestId?: string,
  ) {
    const cc = await this.prisma.companyCandidate.findFirst({
      where: { candidateId, companyId },
    });
    if (!cc)
      throw new NotFoundException({
        code: 'COMPANY_CANDIDATE_NOT_FOUND',
        message: 'Company-candidate relationship not found',
      });
    if (cc.version !== expectedVersion) {
      throw new ConflictException({
        code: 'COMPANY_CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: cc.version,
      });
    }
    if (cc.status !== CompanyCandidateStatus.ARCHIVED)
      return { restored: true, status: 'not_archived' };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyCandidate.update({
        where: { id: cc.id },
        data: { status: CompanyCandidateStatus.ACTIVE, deletedAt: null, version: cc.version + 1 },
      });

      await this.auditService.record({
        companyId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_RESTORED,
        actorType: ApplicationActorType.RECRUITER,
        entityType: 'CompanyCandidate',
        entityId: cc.id,
        description: 'Candidate restored at company level',
        companyCandidateId: cc.id,
        candidateId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        requestId,
        tx,
      });

      return { restored: true, version: updated.version };
    });
  }

  async updateCompanyProfile(
    candidateId: string,
    companyId: string,
    dto: UpdateCompanyProfileDto,
    userId: string,
    membershipId: string,
    requestId?: string,
  ) {
    const cc = await this.prisma.companyCandidate.findFirst({
      where: { candidateId, companyId, deletedAt: null },
    });
    if (!cc)
      throw new NotFoundException({
        code: 'COMPANY_CANDIDATE_NOT_FOUND',
        message: 'Relationship not found',
      });
    if (cc.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'COMPANY_CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: cc.version,
      });
    }

    if (dto.ownerMembershipId) {
      const owner = await this.prisma.companyMembership.findFirst({
        where: { id: dto.ownerMembershipId, companyId, status: 'ACTIVE' },
      });
      if (!owner)
        throw new BadRequestException({
          code: 'COMPANY_CANDIDATE_OWNER_INVALID',
          message: 'Owner must be an active company member',
        });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyCandidate.update({
        where: { id: cc.id },
        data: {
          ...(dto.ownerMembershipId !== undefined
            ? { ownerMembershipId: dto.ownerMembershipId }
            : {}),
          ...(dto.talentPoolEnabled !== undefined
            ? { talentPoolEnabled: dto.talentPoolEnabled }
            : {}),
          ...(dto.doNotContact !== undefined ? { doNotContact: dto.doNotContact } : {}),
          ...(dto.doNotContactReason !== undefined
            ? { doNotContactReason: dto.doNotContactReason }
            : {}),
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.internalSummary !== undefined ? { internalSummary: dto.internalSummary } : {}),
          ...(dto.sourceDetail !== undefined ? { sourceDetail: dto.sourceDetail } : {}),
          updatedByMembershipId: membershipId,
          version: cc.version + 1,
          lastActivityAt: new Date(),
        },
      });

      await this.auditService.record({
        companyId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_UPDATED,
        actorType: ApplicationActorType.RECRUITER,
        entityType: 'CompanyCandidate',
        entityId: cc.id,
        description: 'Company candidate profile updated',
        companyCandidateId: cc.id,
        candidateId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        requestId,
        tx,
      });

      return updated;
    });
  }

  async findByCompanyAndCandidate(companyId: string, candidateId: string) {
    return this.prisma.companyCandidate.findFirst({
      where: { companyId, candidateId, deletedAt: null },
      include: {
        owner: {
          select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
        },
        tags: { include: { tag: true } },
      },
    });
  }
}
