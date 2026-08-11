import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationAuditEventType, ApplicationActorType, CandidateTagType } from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';

export interface CreateTagDto {
  name: string;
  type?: CandidateTagType;
  description?: string;
  color?: string;
}
export interface UpdateTagDto {
  name?: string;
  type?: CandidateTagType;
  description?: string;
  color?: string;
}

@Injectable()
export class CandidateTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async listTags(companyId: string) {
    return this.prisma.candidateTag.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createTag(companyId: string, dto: CreateTagDto, membershipId: string) {
    const normalizedName = dto.name.trim().toLowerCase();
    if (dto.color && !/^#[0-9A-Fa-f]{6}$/.test(dto.color)) {
      throw new BadRequestException({
        code: 'CANDIDATE_TAG_EXISTS',
        message: 'Color must be a valid hex color (e.g. #FF5733)',
      });
    }
    const existing = await this.prisma.candidateTag.findFirst({
      where: { companyId, normalizedName, deletedAt: null },
    });
    if (existing)
      throw new ConflictException({
        code: 'CANDIDATE_TAG_EXISTS',
        message: 'A tag with this name already exists',
      });

    return this.prisma.candidateTag.create({
      data: {
        companyId,
        name: dto.name.trim(),
        normalizedName,
        type: dto.type ?? CandidateTagType.GENERAL,
        description: dto.description ?? null,
        color: dto.color ?? null,
        createdByMembershipId: membershipId,
      },
    });
  }

  async updateTag(tagId: string, companyId: string, dto: UpdateTagDto, membershipId: string) {
    const tag = await this.prisma.candidateTag.findFirst({
      where: { id: tagId, companyId, deletedAt: null },
    });
    if (!tag)
      throw new NotFoundException({ code: 'CANDIDATE_TAG_NOT_FOUND', message: 'Tag not found' });
    if (dto.color && !/^#[0-9A-Fa-f]{6}$/.test(dto.color))
      throw new BadRequestException('Invalid hex color');

    const updateData: Record<string, unknown> = {};
    if (dto.name) {
      updateData.name = dto.name.trim();
      updateData.normalizedName = dto.name.trim().toLowerCase();
    }
    if (dto.type) updateData.type = dto.type;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.color !== undefined) updateData.color = dto.color;

    return this.prisma.candidateTag.update({ where: { id: tagId }, data: updateData as any });
  }

  async deleteTag(tagId: string, companyId: string) {
    const tag = await this.prisma.candidateTag.findFirst({
      where: { id: tagId, companyId, deletedAt: null },
    });
    if (!tag)
      throw new NotFoundException({ code: 'CANDIDATE_TAG_NOT_FOUND', message: 'Tag not found' });
    return this.prisma.candidateTag.update({
      where: { id: tagId },
      data: { deletedAt: new Date() },
    });
  }

  async assignTagToCandidate(
    candidateId: string,
    tagId: string,
    companyId: string,
    membershipId: string,
  ) {
    const tag = await this.prisma.candidateTag.findFirst({
      where: { id: tagId, companyId, deletedAt: null },
    });
    if (!tag)
      throw new NotFoundException({ code: 'CANDIDATE_TAG_NOT_FOUND', message: 'Tag not found' });

    const cc = await this.prisma.companyCandidate.findFirst({
      where: { candidateId, companyId, deletedAt: null },
    });
    if (!cc)
      throw new NotFoundException({
        code: 'COMPANY_CANDIDATE_NOT_FOUND',
        message: 'Candidate not linked to this company',
      });

    const existing = await this.prisma.companyCandidateTag.findUnique({
      where: { companyCandidateId_tagId: { companyCandidateId: cc.id, tagId } },
    });
    if (existing)
      throw new ConflictException({
        code: 'CANDIDATE_TAG_EXISTS',
        message: 'Tag already assigned',
      });

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.companyCandidateTag.create({
        data: { companyCandidateId: cc.id, tagId, assignedByMembershipId: membershipId },
      });
      await this.auditService.record({
        companyId,
        companyCandidateId: cc.id,
        candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_TAG_ADDED,
        entityType: 'CompanyCandidateTag',
        entityId: assignment.id,
        description: `Tag "${tag.name}" added to candidate`,
        metadata: { tagId, tagName: tag.name },
        tx,
      });
      return assignment;
    });
  }

  async removeTagFromCandidate(
    candidateId: string,
    tagId: string,
    companyId: string,
    membershipId: string,
  ) {
    const tag = await this.prisma.candidateTag.findFirst({
      where: { id: tagId, companyId, deletedAt: null },
    });
    if (!tag)
      throw new NotFoundException({ code: 'CANDIDATE_TAG_NOT_FOUND', message: 'Tag not found' });

    const cc = await this.prisma.companyCandidate.findFirst({
      where: { candidateId, companyId, deletedAt: null },
    });
    if (!cc)
      throw new NotFoundException({
        code: 'COMPANY_CANDIDATE_NOT_FOUND',
        message: 'Candidate not linked to this company',
      });

    const assignment = await this.prisma.companyCandidateTag.findUnique({
      where: { companyCandidateId_tagId: { companyCandidateId: cc.id, tagId } },
    });
    if (!assignment) throw new NotFoundException('Tag assignment not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.companyCandidateTag.delete({ where: { id: assignment.id } });
      await this.auditService.record({
        companyId,
        companyCandidateId: cc.id,
        candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.COMPANY_CANDIDATE_TAG_REMOVED,
        entityType: 'CompanyCandidateTag',
        entityId: assignment.id,
        description: `Tag "${tag.name}" removed from candidate`,
        tx,
      });
      return { removed: true };
    });
  }
}
