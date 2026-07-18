import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma, MembershipStatus, OrganizationAuditEventType } from '@prisma/client';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { AuthorizationCacheService } from '@modules/organization/authorization-cache.service';
import { SessionService } from '@modules/auth/services/session.service';
import { toCompanyResponse, toSettingsResponse, toMemberResponse } from './mappers/company.mapper';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAuditService: OrganizationAuditService,
    private readonly authCacheService: AuthorizationCacheService,
    private readonly sessionService: SessionService,
  ) {}

  async findById(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async findBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({ where: { slug } });
    if (!company) {
      throw new NotFoundException(`Company with slug "${slug}" not found`);
    }
    return company;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateRandomSuffix(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  async create(data: Prisma.CompanyCreateInput) {
    let slug = this.generateSlug(data.name);

    const existing = await this.prisma.company.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${this.generateRandomSuffix()}`;
    }

    return this.prisma.company.create({
      data: { ...data, slug },
    });
  }

  async update(id: string, data: Prisma.CompanyUpdateInput) {
    await this.findById(id);
    return this.prisma.company.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getMembers(companyId: string) {
    await this.findById(companyId);
    return this.prisma.companyMembership.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
          },
        },
        role: true,
      },
    });
  }

  async isMember(userId: string, companyId: string): Promise<boolean> {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    return !!membership;
  }

  async findByEmailDomain(emailDomain: string) {
    const company = await this.prisma.company.findFirst({
      where: { emailDomain },
    });
    if (!company) {
      throw new NotFoundException(`Company with email domain "${emailDomain}" not found`);
    }
    return company;
  }

  async getCompanyProfile(companyId: string, _membershipId?: string) {
    const company = await this.findById(companyId);

    const [primaryLocation, memberCount, departmentCount] = await Promise.all([
      this.prisma.companyLocation.findFirst({
        where: { companyId, isPrimary: true, deletedAt: null },
      }),
      this.prisma.companyMembership.count({
        where: { companyId, status: MembershipStatus.ACTIVE },
      }),
      this.prisma.department.count({
        where: { companyId, deletedAt: null },
      }),
    ]);

    return {
      ...toCompanyResponse(company),
      primaryLocation: primaryLocation ?? null,
      memberCount,
      departmentCount,
      onboardingCompleted: !!company.onboardingCompletedAt,
    };
  }

  async updateCompany(
    companyId: string,
    data: Record<string, unknown>,
    updatedByUserId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const company = await this.findById(companyId);

    const allowedFields = [
      'name',
      'legalName',
      'registrationNumber',
      'taxNumber',
      'industry',
      'companySize',
      'website',
      'phone',
      'supportEmail',
      'description',
      'addressLine1',
      'addressLine2',
      'city',
      'stateOrProvince',
      'postalCode',
      'countryCode',
      'defaultLanguage',
      'timezone',
      'dateFormat',
      'timeFormat',
      'currencyCode',
      'recruitmentEmail',
      'logoFileId',
      'coverImageFileId',
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in data) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    updateData.updatedByUserId = updatedByUserId;

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });

    await this.orgAuditService.record({
      companyId,
      actorUserId: updatedByUserId,
      eventType: OrganizationAuditEventType.COMPANY_PROFILE_UPDATED,
      entityType: 'company',
      entityId: companyId,
      description: `Company profile updated`,
      metadata: { previous: { name: company.name }, changes: updateData } as Record<
        string,
        unknown
      >,
      requestId,
      ipAddress,
    });

    return toCompanyResponse(updated);
  }

  async completeOnboarding(companyId: string) {
    const company = await this.findById(companyId);

    if (company.onboardingCompletedAt) {
      throw new ConflictException('Onboarding already completed');
    }

    const [memberCount, locationCount] = await Promise.all([
      this.prisma.companyMembership.count({
        where: { companyId, status: MembershipStatus.ACTIVE },
      }),
      this.prisma.companyLocation.count({
        where: { companyId, deletedAt: null },
      }),
    ]);

    if (memberCount === 0) {
      throw new BadRequestException('Company must have at least one active member');
    }

    if (locationCount === 0) {
      throw new BadRequestException('Company must have at least one location');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { onboardingCompletedAt: new Date() },
    });

    await this.orgAuditService.record({
      companyId,
      eventType: OrganizationAuditEventType.ONBOARDING_COMPLETED,
      entityType: 'company',
      entityId: companyId,
      description: 'Company onboarding completed',
    });

    return toCompanyResponse(updated);
  }

  async getSettings(companyId: string) {
    await this.findById(companyId);

    let settings = await this.prisma.companySettings.findUnique({
      where: { companyId },
    });

    if (!settings) {
      settings = await this.prisma.companySettings.create({
        data: { companyId },
      });
    }

    return toSettingsResponse(settings);
  }

  async updateSettings(
    companyId: string,
    data: Record<string, unknown>,
    updatedByUserId: string,
    actorMembershipId?: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.findById(companyId);

    await this.getSettings(companyId);

    const allowedFields = [
      'requireEmailVerification',
      'allowCustomRoles',
      'allowCandidateDataExport',
      'defaultApplicationRetentionDays',
      'defaultInterviewDurationMinutes',
      'defaultInterviewTimezone',
      'defaultInterviewLanguage',
      'aiScreeningEnabled',
      'aiInterviewEnabled',
      'recruiterOverrideRequired',
      'notifyRecruiterOnNewApplication',
      'notifyCandidateOnStatusChange',
      'emailSenderName',
      'emailReplyTo',
      'brandPrimaryColor',
      'brandSecondaryColor',
      'dataRetentionEnabled',
      'candidateDataRetentionDays',
      'interviewRecordingRetentionDays',
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in data) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    updateData.updatedByUserId = updatedByUserId;

    const updated = await this.prisma.companySettings.update({
      where: { companyId },
      data: updateData,
    });

    await this.orgAuditService.record({
      companyId,
      actorUserId: updatedByUserId,
      actorMembershipId: actorMembershipId ?? null,
      eventType: OrganizationAuditEventType.COMPANY_SETTINGS_UPDATED,
      entityType: 'company_settings',
      entityId: companyId,
      description: 'Company settings updated',
      metadata: { changes: Object.keys(updateData) } as Record<string, unknown>,
      requestId,
      ipAddress,
    });

    return toSettingsResponse(updated);
  }

  async getMembersList(
    companyId: string,
    query: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      roleId?: string;
      departmentId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    await this.findById(companyId);

    const { page, limit, search, status, roleId, departmentId, startDate, endDate } = query;

    const where: Prisma.CompanyMembershipWhereInput = { companyId };

    if (status) {
      where.status = status as MembershipStatus;
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (departmentId) {
      where.departmentMemberships = {
        some: { departmentId },
      };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.companyMembership.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              status: true,
            },
          },
          role: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              isSystem: true,
            },
          },
          departmentMemberships: {
            include: {
              department: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.companyMembership.count({ where }),
    ]);

    return {
      items: items.map(toMemberResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMember(companyId: string, membershipId: string) {
    await this.findById(companyId);

    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isSystem: true,
          },
        },
        departmentMemberships: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found in this company`);
    }

    return toMemberResponse(membership);
  }

  async updateMember(companyId: string, membershipId: string, data: Record<string, unknown>) {
    await this.findById(companyId);

    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found in this company`);
    }

    const allowedFields = ['jobTitle', 'roleId'];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in data) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    if (updateData.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: updateData.roleId as string, companyId },
      });
      if (!role) {
        throw new BadRequestException('Role not found in this company');
      }
    }

    const updated = await this.prisma.companyMembership.update({
      where: { id: membershipId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isSystem: true,
          },
        },
        departmentMemberships: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (updateData.roleId) {
      await Promise.all([
        this.orgAuditService.record({
          companyId,
          actorMembershipId: membershipId,
          eventType: OrganizationAuditEventType.MEMBER_ROLE_CHANGED,
          entityType: 'membership',
          entityId: membershipId,
          description: `Member role changed`,
          metadata: { previousRoleId: membership.roleId, newRoleId: updateData.roleId } as Record<
            string,
            unknown
          >,
        }),
        this.authCacheService.clearMemberCache(membershipId),
      ]);
    }

    return toMemberResponse(updated);
  }

  async suspendMember(
    companyId: string,
    membershipId: string,
    actorUserId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.findById(companyId);

    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId },
      include: { role: true },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found in this company`);
    }

    if (membership.status === MembershipStatus.SUSPENDED) {
      throw new BadRequestException('Member is already suspended');
    }

    await this.ensureNotFinalAdmin(companyId, membership);

    const updated = await this.prisma.companyMembership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.SUSPENDED },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isSystem: true,
          },
        },
        departmentMemberships: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    await this.orgAuditService.record({
      companyId,
      actorUserId,
      actorMembershipId: membershipId,
      eventType: OrganizationAuditEventType.MEMBER_SUSPENDED,
      entityType: 'membership',
      entityId: membershipId,
      description: `Member suspended`,
      requestId,
      ipAddress,
    });

    await this.authCacheService.clearMemberCache(membershipId);

    return toMemberResponse(updated);
  }

  async reactivateMember(
    companyId: string,
    membershipId: string,
    actorUserId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.findById(companyId);

    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found in this company`);
    }

    if (membership.status !== MembershipStatus.SUSPENDED) {
      throw new BadRequestException('Member is not suspended');
    }

    const updated = await this.prisma.companyMembership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.ACTIVE },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isSystem: true,
          },
        },
        departmentMemberships: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    await this.orgAuditService.record({
      companyId,
      actorUserId,
      actorMembershipId: membershipId,
      eventType: OrganizationAuditEventType.MEMBER_REACTIVATED,
      entityType: 'membership',
      entityId: membershipId,
      description: `Member reactivated`,
      requestId,
      ipAddress,
    });

    await this.authCacheService.clearMemberCache(membershipId);

    return toMemberResponse(updated);
  }

  async removeMember(
    companyId: string,
    membershipId: string,
    actorUserId: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.findById(companyId);

    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: membershipId, companyId },
      include: { role: true },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found in this company`);
    }

    await this.ensureNotFinalAdmin(companyId, membership);

    await this.prisma.companyMembership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.REMOVED },
    });

    const sessions = await this.prisma.userSession.findMany({
      where: { userId: membership.userId, activeCompanyId: companyId },
      select: { id: true },
    });

    await Promise.all(
      sessions.map((s) => this.sessionService.revoke(s.id, 'User removed from company')),
    );

    await this.orgAuditService.record({
      companyId,
      actorUserId,
      actorMembershipId: membershipId,
      eventType: OrganizationAuditEventType.MEMBER_REMOVED,
      entityType: 'membership',
      entityId: membershipId,
      description: `Member removed from company`,
      requestId,
      ipAddress,
    });

    await this.authCacheService.clearMemberCache(membershipId);
    await this.authCacheService.clearCompanyMemberCache(companyId);

    return { message: 'Member removed successfully' };
  }

  async bulkMemberAction(
    companyId: string,
    action: string,
    membershipIds: string[],
    actorUserId: string,
    extraData: { roleId?: string; departmentId?: string },
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.findById(companyId);

    const memberships = await this.prisma.companyMembership.findMany({
      where: { id: { in: membershipIds }, companyId },
      include: { role: true },
    });

    const foundIds = memberships.map((m) => m.id);
    const notFound = membershipIds.filter((id) => !foundIds.includes(id));
    if (notFound.length > 0) {
      throw new NotFoundException(`Memberships not found: ${notFound.join(', ')}`);
    }

    switch (action) {
      case 'SUSPEND': {
        for (const m of memberships) {
          await this.ensureNotFinalAdmin(companyId, m);
        }
        await this.prisma.companyMembership.updateMany({
          where: { id: { in: membershipIds }, status: { not: MembershipStatus.SUSPENDED } },
          data: { status: MembershipStatus.SUSPENDED },
        });
        break;
      }
      case 'REACTIVATE': {
        await this.prisma.companyMembership.updateMany({
          where: { id: { in: membershipIds }, status: MembershipStatus.SUSPENDED },
          data: { status: MembershipStatus.ACTIVE },
        });
        break;
      }
      case 'REMOVE': {
        for (const m of memberships) {
          await this.ensureNotFinalAdmin(companyId, m);
        }
        await this.prisma.companyMembership.updateMany({
          where: { id: { in: membershipIds } },
          data: { status: MembershipStatus.REMOVED },
        });
        break;
      }
      case 'ASSIGN_ROLE': {
        if (!extraData.roleId) {
          throw new BadRequestException('roleId is required for ASSIGN_ROLE action');
        }
        const role = await this.prisma.role.findFirst({
          where: { id: extraData.roleId, companyId },
        });
        if (!role) {
          throw new BadRequestException('Role not found in this company');
        }
        await this.prisma.companyMembership.updateMany({
          where: { id: { in: membershipIds } },
          data: { roleId: extraData.roleId },
        });
        break;
      }
      case 'ASSIGN_DEPARTMENT': {
        if (!extraData.departmentId) {
          throw new BadRequestException('departmentId is required for ASSIGN_DEPARTMENT action');
        }
        const department = await this.prisma.department.findFirst({
          where: { id: extraData.departmentId, companyId },
        });
        if (!department) {
          throw new BadRequestException('Department not found in this company');
        }
        for (const membershipId of membershipIds) {
          const existing = await this.prisma.departmentMembership.findUnique({
            where: {
              companyMembershipId_departmentId: {
                companyMembershipId: membershipId,
                departmentId: extraData.departmentId,
              },
            },
          });
          if (!existing) {
            await this.prisma.departmentMembership.create({
              data: {
                companyMembershipId: membershipId,
                departmentId: extraData.departmentId,
              },
            });
          }
        }
        break;
      }
      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }

    for (const membershipId of membershipIds) {
      await this.authCacheService.clearMemberCache(membershipId);
    }
    await this.authCacheService.clearCompanyMemberCache(companyId);

    await this.orgAuditService.record({
      companyId,
      actorUserId,
      eventType: this.getBulkAuditEventType(action),
      entityType: 'membership',
      description: `Bulk ${action.toLowerCase()} performed on ${membershipIds.length} member(s)`,
      metadata: { action, membershipIds, extraData } as Record<string, unknown>,
      requestId,
      ipAddress,
    });

    return {
      message: `Bulk ${action.toLowerCase()} completed for ${membershipIds.length} member(s)`,
    };
  }

  async getCompanyRoles(companyId: string) {
    await this.findById(companyId);

    return this.prisma.role.findMany({
      where: {
        OR: [{ companyId }, { scope: 'PLATFORM' }],
      },
      orderBy: { name: 'asc' },
    });
  }

  async getCompanyPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async getAuditEvents(
    companyId: string,
    query: {
      page: number;
      limit: number;
      eventType?: string;
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    await this.findById(companyId);

    const {
      page,
      limit,
      eventType,
      entityType,
      entityId,
      actorUserId,
      startDate,
      endDate,
      search,
    } = query;

    const where: Prisma.OrganizationAuditEventWhereInput = { companyId };

    if (eventType) where.eventType = eventType as OrganizationAuditEventType;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorUserId) where.actorUserId = actorUserId;

    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate);
      if (endDate) where.occurredAt.lte = new Date(endDate);
    }

    if (search) {
      where.description = { contains: search, mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.organizationAuditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.organizationAuditEvent.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async ensureNotFinalAdmin(
    companyId: string,
    membership: { id: string; roleId: string; role?: { isSystem: boolean } | null },
  ): Promise<void> {
    const isAdminRole = membership.role?.isSystem === true;

    if (isAdminRole) {
      const adminCount = await this.prisma.companyMembership.count({
        where: {
          companyId,
          roleId: membership.roleId,
          status: { not: MembershipStatus.REMOVED },
        },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot remove or suspend the final admin of the company');
      }
    }
  }

  private getBulkAuditEventType(action: string): OrganizationAuditEventType {
    switch (action) {
      case 'SUSPEND':
        return OrganizationAuditEventType.MEMBER_SUSPENDED;
      case 'REACTIVATE':
        return OrganizationAuditEventType.MEMBER_REACTIVATED;
      case 'REMOVE':
        return OrganizationAuditEventType.MEMBER_REMOVED;
      case 'ASSIGN_ROLE':
        return OrganizationAuditEventType.MEMBER_ROLE_CHANGED;
      case 'ASSIGN_DEPARTMENT':
        return OrganizationAuditEventType.MEMBER_DEPARTMENT_ASSIGNED;
      default:
        return OrganizationAuditEventType.COMPANY_PROFILE_UPDATED;
    }
  }
}
