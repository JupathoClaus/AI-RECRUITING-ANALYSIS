import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { QueueService } from '@modules/queue/queue.service';
import { PasswordService } from '@modules/auth/services/password.service';
import {
  InvitationStatus,
  OrganizationAuditEventType,
  UserStatus,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationQueryDto } from './dto/invitation-query.dto';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly nodeEnv: string;
  private readonly isDevOrTest: boolean;
  private readonly defaultExpiresInDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly organizationAuditService: OrganizationAuditService,
    private readonly queueService: QueueService,
    private readonly passwordService: PasswordService,
  ) {
    this.nodeEnv = this.configService.get<string>('app.env') || 'development';
    this.isDevOrTest = this.nodeEnv === 'development' || this.nodeEnv === 'test';
    this.defaultExpiresInDays =
      this.configService.get<number>('invitations.defaultExpiresInDays') ?? 30;
  }

  async create(
    companyId: string,
    data: CreateInvitationDto,
    invitedByUserId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const expiresInDays = data.expiresInDays ?? this.defaultExpiresInDays;

    const role = await this.prisma.role.findFirst({
      where: { id: data.roleId, companyId },
    });
    if (!role) {
      throw new BadRequestException('Role not found or does not belong to this company');
    }

    if (data.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: data.departmentId, companyId },
      });
      if (!department) {
        throw new BadRequestException('Department not found or does not belong to this company');
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        memberships: {
          where: { companyId, status: MembershipStatus.ACTIVE },
        },
      },
    });

    if (existingUser && existingUser.memberships.length > 0) {
      throw new ConflictException('This user is already an active member of this company');
    }

    const existingPending = await this.prisma.companyInvitation.findFirst({
      where: {
        normalizedEmail,
        companyId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      if (
        existingPending.roleId !== data.roleId ||
        existingPending.departmentId !== data.departmentId
      ) {
        await this.prisma.companyInvitation.update({
          where: { id: existingPending.id },
          data: {
            status: InvitationStatus.REVOKED,
            revokedAt: new Date(),
          },
        });

        await this.organizationAuditService.record({
          companyId,
          actorUserId: invitedByUserId,
          eventType: OrganizationAuditEventType.INVITATION_REVOKED,
          entityType: 'CompanyInvitation',
          entityId: existingPending.id,
          description: 'Previous invitation revoked due to new invitation for same email',
          requestId,
          ipAddress,
        });
      } else {
        throw new ConflictException(
          'A pending invitation already exists for this email in this company',
        );
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invitation = await this.prisma.companyInvitation.create({
      data: {
        companyId,
        email: data.email,
        normalizedEmail,
        roleId: data.roleId,
        departmentId: data.departmentId ?? null,
        jobTitle: data.jobTitle ?? null,
        invitedByUserId,
        tokenHash,
        expiresAt,
        status: InvitationStatus.PENDING,
        sendCount: 1,
        lastSentAt: new Date(),
      },
      include: {
        company: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.queueService.addEmailJob('organization.invitation', {
      email: normalizedEmail,
      invitationId: invitation.id,
      companyId,
      companyName: invitation.company.name,
      roleName: invitation.role.name,
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      type: 'company-invitation',
    });

    await this.organizationAuditService.record({
      companyId,
      actorUserId: invitedByUserId,
      eventType: OrganizationAuditEventType.MEMBER_INVITED,
      entityType: 'CompanyInvitation',
      entityId: invitation.id,
      description: `Invitation sent to ${normalizedEmail} for role ${invitation.role.name}`,
      metadata: { email: normalizedEmail, roleId: data.roleId, roleName: invitation.role.name },
      requestId,
      ipAddress,
    });

    this.logger.log(
      `Invitation created: ${invitation.id} for ${normalizedEmail} in company ${companyId}`,
    );

    return this.sanitizeInvitation(invitation, rawToken);
  }

  async findAll(companyId: string, query: InvitationQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      roleId,
      departmentId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.CompanyInvitationWhereInput = { companyId };

    if (status) where.status = status;
    if (roleId) where.roleId = roleId;
    if (departmentId) where.departmentId = departmentId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { normalizedEmail: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.companyInvitation.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: {
          role: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true } },
          invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          membership: { select: { id: true, userId: true, joinedAt: true } },
        },
      }),
      this.prisma.companyInvitation.count({ where }),
    ]);

    const sanitizedItems = items.map((item) => this.sanitizeInvitation(item));

    return {
      items: sanitizedItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(companyId: string, invitationId: string) {
    const invitation = await this.prisma.companyInvitation.findFirst({
      where: { id: invitationId, companyId },
      include: {
        role: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        membership: { select: { id: true, userId: true, joinedAt: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return this.sanitizeInvitation(invitation);
  }

  async resend(
    companyId: string,
    invitationId: string,
    userId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const invitation = await this.prisma.companyInvitation.findFirst({
      where: { id: invitationId, companyId },
      include: {
        company: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot resend invitation with status ${invitation.status}`);
    }

    if (invitation.expiresAt <= new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.defaultExpiresInDays);

    await this.prisma.companyInvitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt,
        sendCount: invitation.sendCount + 1,
        lastSentAt: new Date(),
      },
    });

    await this.queueService.addEmailJob('organization.invitation', {
      email: invitation.normalizedEmail,
      invitationId: invitation.id,
      companyId,
      companyName: invitation.company.name,
      roleName: invitation.role.name,
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      type: 'company-invitation',
    });

    await this.organizationAuditService.record({
      companyId,
      actorUserId: userId,
      eventType: OrganizationAuditEventType.INVITATION_RESENT,
      entityType: 'CompanyInvitation',
      entityId: invitationId,
      description: `Invitation resent to ${invitation.normalizedEmail}`,
      requestId,
      ipAddress,
    });

    this.logger.log(`Invitation resent: ${invitationId}`);
  }

  async revoke(
    companyId: string,
    invitationId: string,
    userId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const invitation = await this.prisma.companyInvitation.findFirst({
      where: { id: invitationId, companyId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      return;
    }

    if (
      invitation.status === InvitationStatus.ACCEPTED ||
      invitation.status === InvitationStatus.EXPIRED
    ) {
      throw new BadRequestException(`Cannot revoke invitation with status ${invitation.status}`);
    }

    await this.prisma.companyInvitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.organizationAuditService.record({
      companyId,
      actorUserId: userId,
      eventType: OrganizationAuditEventType.INVITATION_REVOKED,
      entityType: 'CompanyInvitation',
      entityId: invitationId,
      description: `Invitation revoked for ${invitation.normalizedEmail}`,
      requestId,
      ipAddress,
    });

    this.logger.log(`Invitation revoked: ${invitationId}`);
  }

  async validateToken(token: string) {
    const tokenHash = this.hashToken(token);

    const invitation = await this.prisma.companyInvitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        company: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    return {
      valid: true,
      companyId: invitation.companyId,
      companyName: invitation.company.name,
      email: invitation.email,
      maskedEmail: this.maskEmail(invitation.email),
      roleId: invitation.roleId,
      roleName: invitation.role.name,
      departmentId: invitation.departmentId,
      departmentName: invitation.department?.name ?? null,
      expiresAt: invitation.expiresAt,
      hasExistingAccount: false,
    };
  }

  async acceptAsNewUser(
    token: string,
    data: {
      firstName: string;
      lastName: string;
      password: string;
      passwordConfirmation: string;
      timezone?: string;
      preferredLocale?: string;
    },
  ) {
    if (data.password !== data.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    const passwordValidation = this.passwordService.validatePasswordPolicy(
      data.password,
      undefined,
      data.firstName,
      data.lastName,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        message: 'Password does not meet policy requirements',
        errors: passwordValidation.errors,
      });
    }

    const tokenHash = this.hashToken(token);

    const invitation = await this.prisma.companyInvitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        company: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
      },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const passwordHash = await this.passwordService.hashPassword(data.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          timezone: data.timezone ?? 'UTC',
          preferredLocale: data.preferredLocale ?? 'en',
        },
      });

      const membership = await tx.companyMembership.create({
        data: {
          userId: user.id,
          companyId: invitation.companyId,
          roleId: invitation.roleId,
          status: MembershipStatus.ACTIVE,
          jobTitle: invitation.jobTitle,
          invitedByUserId: invitation.invitedByUserId,
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      });

      if (invitation.departmentId) {
        await tx.departmentMembership.create({
          data: {
            companyMembershipId: membership.id,
            departmentId: invitation.departmentId,
            isPrimary: true,
          },
        });

        await tx.organizationAuditEvent.create({
          data: {
            companyId: invitation.companyId,
            actorUserId: user.id,
            actorMembershipId: membership.id,
            eventType: OrganizationAuditEventType.MEMBER_DEPARTMENT_ASSIGNED,
            entityType: 'DepartmentMembership',
            entityId: invitation.departmentId,
            description: `User ${invitation.normalizedEmail} assigned to department`,
            requestId: null,
            ipAddress: null,
          },
        });
      }

      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          membershipId: membership.id,
        },
      });

      return { user, membership };
    });

    await this.organizationAuditService.record({
      companyId: invitation.companyId,
      actorUserId: result.user.id,
      actorMembershipId: result.membership.id,
      eventType: OrganizationAuditEventType.INVITATION_ACCEPTED,
      entityType: 'CompanyInvitation',
      entityId: invitation.id,
      description: `Invitation accepted by ${invitation.normalizedEmail}`,
    });

    await this.queueService.addNotificationJob('organization.member-added', {
      companyId: invitation.companyId,
      companyName: invitation.company.name,
      userId: result.user.id,
      membershipId: result.membership.id,
      email: invitation.normalizedEmail,
      firstName: data.firstName,
      lastName: data.lastName,
      roleName: invitation.role.name,
      type: 'member-added',
    });

    this.logger.log(`Invitation accepted (new user): ${invitation.id} -> user ${result.user.id}`);

    return {
      userId: result.user.id,
      membershipId: result.membership.id,
      companyId: invitation.companyId,
      companyName: invitation.company.name,
    };
  }

  async acceptExistingUser(token: string, authenticatedUserId: string) {
    const tokenHash = this.hashToken(token);

    const invitation = await this.prisma.companyInvitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        company: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
      },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authenticatedUserId },
    });

    if (!user) {
      throw new BadRequestException('Authenticated user not found');
    }

    if (user.normalizedEmail !== invitation.normalizedEmail) {
      throw new BadRequestException('This invitation was sent to a different email address');
    }

    const existingMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: authenticatedUserId,
          companyId: invitation.companyId,
        },
      },
    });

    if (existingMembership && existingMembership.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('You are already an active member of this company');
    }

    let membership;
    if (existingMembership) {
      membership = await this.prisma.companyMembership.update({
        where: { id: existingMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          roleId: invitation.roleId,
          jobTitle: invitation.jobTitle,
          invitedByUserId: invitation.invitedByUserId,
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      });
    } else {
      membership = await this.prisma.companyMembership.create({
        data: {
          userId: authenticatedUserId,
          companyId: invitation.companyId,
          roleId: invitation.roleId,
          status: MembershipStatus.ACTIVE,
          jobTitle: invitation.jobTitle,
          invitedByUserId: invitation.invitedByUserId,
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      });
    }

    if (invitation.departmentId) {
      const existingDept = await this.prisma.departmentMembership.findUnique({
        where: {
          companyMembershipId_departmentId: {
            companyMembershipId: membership.id,
            departmentId: invitation.departmentId,
          },
        },
      });

      if (!existingDept) {
        await this.prisma.departmentMembership.create({
          data: {
            companyMembershipId: membership.id,
            departmentId: invitation.departmentId,
            isPrimary: true,
          },
        });

        await this.organizationAuditService.record({
          companyId: invitation.companyId,
          actorUserId: authenticatedUserId,
          actorMembershipId: membership.id,
          eventType: OrganizationAuditEventType.MEMBER_DEPARTMENT_ASSIGNED,
          entityType: 'DepartmentMembership',
          entityId: invitation.departmentId,
          description: `User ${invitation.normalizedEmail} assigned to department`,
        });
      }
    }

    await this.prisma.companyInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
        membershipId: membership.id,
      },
    });

    await this.organizationAuditService.record({
      companyId: invitation.companyId,
      actorUserId: authenticatedUserId,
      actorMembershipId: membership.id,
      eventType: OrganizationAuditEventType.INVITATION_ACCEPTED,
      entityType: 'CompanyInvitation',
      entityId: invitation.id,
      description: `Invitation accepted by ${invitation.normalizedEmail}`,
    });

    await this.queueService.addNotificationJob('organization.member-added', {
      companyId: invitation.companyId,
      companyName: invitation.company.name,
      userId: authenticatedUserId,
      membershipId: membership.id,
      email: invitation.normalizedEmail,
      roleName: invitation.role.name,
      type: 'member-added',
    });

    this.logger.log(`Invitation accepted (existing user): ${invitation.id}`);

    return {
      userId: authenticatedUserId,
      membershipId: membership.id,
      companyId: invitation.companyId,
      companyName: invitation.company.name,
    };
  }

  private sanitizeInvitation(invitation: Record<string, unknown>, rawToken?: string) {
    const { tokenHash: _tokenHash, ...safe } = invitation as {
      tokenHash: string;
      [key: string]: unknown;
    };
    const result = { ...safe };

    if (this.isDevOrTest && rawToken) {
      (result as Record<string, unknown>).rawToken = rawToken;
    }

    return result;
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
  }
}
