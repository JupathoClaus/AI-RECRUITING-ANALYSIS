import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationActorType,
  ApplicationAuditEventType,
  ApplicationAssignmentType,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';
import { CreateAssignmentDto, TransferOwnershipDto } from '../dto/assignment.dto';

@Injectable()
export class ApplicationAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async getAssignments(applicationId: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    return this.prisma.applicationAssignment.findMany({
      where: { applicationId, removedAt: null },
      include: {
        membership: {
          select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
  }

  async createAssignment(
    applicationId: string,
    companyId: string,
    dto: CreateAssignmentDto,
    membershipId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    const targetMembership = await this.prisma.companyMembership.findFirst({
      where: { id: dto.membershipId, companyId, status: 'ACTIVE' },
    });
    if (!targetMembership)
      throw new BadRequestException({
        code: 'APPLICATION_ASSIGNMENT_INVALID',
        message: 'Assignee must be an active member of this company',
      });

    const existing = await this.prisma.applicationAssignment.findFirst({
      where: { applicationId, membershipId: dto.membershipId, type: dto.type, removedAt: null },
    });
    if (existing) throw new ConflictException('Assignment already exists');

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.applicationAssignment.create({
        data: {
          applicationId,
          membershipId: dto.membershipId,
          type: dto.type,
          assignedByMembershipId: membershipId,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_ASSIGNED,
        entityType: 'ApplicationAssignment',
        entityId: assignment.id,
        description: `Member assigned as ${dto.type}`,
        requestId,
        tx,
      });
      return assignment;
    });
  }

  async removeAssignment(
    assignmentId: string,
    applicationId: string,
    companyId: string,
    membershipId: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    const assignment = await this.prisma.applicationAssignment.findFirst({
      where: { id: assignmentId, applicationId, removedAt: null },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.type === ApplicationAssignmentType.OWNER)
      throw new BadRequestException({
        code: 'APPLICATION_ASSIGNMENT_INVALID',
        message: 'Cannot remove owner assignment directly — use transfer-ownership',
      });

    return this.prisma.applicationAssignment.update({
      where: { id: assignmentId },
      data: { removedAt: new Date() },
    });
  }

  async transferOwnership(
    applicationId: string,
    companyId: string,
    dto: TransferOwnershipDto,
    membershipId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    const newOwner = await this.prisma.companyMembership.findFirst({
      where: { id: dto.newOwnerMembershipId, companyId, status: 'ACTIVE' },
    });
    if (!newOwner)
      throw new BadRequestException({
        code: 'APPLICATION_ASSIGNMENT_INVALID',
        message: 'New owner must be an active company member',
      });

    return this.prisma.$transaction(async (tx) => {
      await tx.applicationAssignment.updateMany({
        where: { applicationId, type: ApplicationAssignmentType.OWNER, removedAt: null },
        data: { removedAt: new Date() },
      });
      await tx.applicationAssignment.create({
        data: {
          applicationId,
          membershipId: dto.newOwnerMembershipId,
          type: ApplicationAssignmentType.OWNER,
          assignedByMembershipId: membershipId,
        },
      });
      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_OWNER_CHANGED,
        entityType: 'Application',
        entityId: applicationId,
        description: 'Application ownership transferred',
        requestId,
        tx,
      });
      return { transferred: true };
    });
  }
}
