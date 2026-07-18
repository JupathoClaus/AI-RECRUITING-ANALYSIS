import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { DepartmentStatus, OrganizationAuditEventType, Prisma } from '@prisma/client';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAuditService: OrganizationAuditService,
  ) {}

  async create(companyId: string, dto: CreateDepartmentDto, userId: string) {
    await this.validateDepartmentData(companyId, dto, null);

    if (dto.parentDepartmentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentDepartmentId, companyId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Parent department not found in this company');
      }
    }

    if (dto.managerMembershipId) {
      const membership = await this.prisma.companyMembership.findFirst({
        where: { id: dto.managerMembershipId, companyId, status: 'ACTIVE' },
      });
      if (!membership) {
        throw new BadRequestException('Manager membership not found or not active in this company');
      }
    }

    const department = await this.prisma.department.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code ?? null,
        description: dto.description ?? null,
        parentDepartmentId: dto.parentDepartmentId ?? null,
        managerMembershipId: dto.managerMembershipId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        createdByUserId: userId,
      },
    });

    await this.recordAudit(
      companyId,
      userId,
      OrganizationAuditEventType.DEPARTMENT_CREATED,
      department.id,
      `Department "${department.name}" created`,
    );

    return department;
  }

  async findAll(companyId: string, query: DepartmentQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      parentDepartmentId,
      managerMembershipId,
      sortBy,
      sortOrder = 'asc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.DepartmentWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (parentDepartmentId !== undefined) {
      where.parentDepartmentId = parentDepartmentId;
    }

    if (managerMembershipId) {
      where.managerMembershipId = managerMembershipId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'sortOrder', 'status'] as const;
    const orderField =
      sortBy && allowedSortFields.includes(sortBy as (typeof allowedSortFields)[number])
        ? sortBy
        : 'sortOrder';

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder } as Prisma.DepartmentOrderByWithRelationInput,
        include: {
          _count: { select: { departmentMemberships: true } },
          parentDepartment: { select: { id: true, name: true } },
          managerMembership: {
            select: {
              id: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(companyId: string, departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId, deletedAt: null },
      include: {
        _count: { select: { departmentMemberships: true } },
        parentDepartment: { select: { id: true, name: true } },
        childDepartments: {
          where: { deletedAt: null },
          select: { id: true, name: true, status: true },
        },
        managerMembership: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException(`Department with ID ${departmentId} not found`);
    }

    return department;
  }

  async getTree(companyId: string) {
    const departments = await this.prisma.department.findMany({
      where: { companyId, deletedAt: null },
      include: {
        _count: { select: { departmentMemberships: true } },
        managerMembership: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return this.buildTree(departments);
  }

  async update(companyId: string, departmentId: string, dto: UpdateDepartmentDto, userId: string) {
    await this.findById(companyId, departmentId);
    await this.validateDepartmentData(companyId, dto, departmentId);

    if (dto.parentDepartmentId) {
      if (dto.parentDepartmentId === departmentId) {
        throw new BadRequestException('A department cannot be its own parent');
      }

      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentDepartmentId, companyId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Parent department not found in this company');
      }

      const hasCircular = await this.wouldCreateCircularRef(
        departmentId,
        dto.parentDepartmentId,
        companyId,
      );
      if (hasCircular) {
        throw new BadRequestException('Moving this department would create a circular reference');
      }
    }

    if (dto.managerMembershipId) {
      const membership = await this.prisma.companyMembership.findFirst({
        where: { id: dto.managerMembershipId, companyId, status: 'ACTIVE' },
      });
      if (!membership) {
        throw new BadRequestException('Manager membership not found or not active in this company');
      }
    }

    const department = await this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...dto,
        updatedByUserId: userId,
      },
    });

    await this.recordAudit(
      companyId,
      userId,
      OrganizationAuditEventType.DEPARTMENT_UPDATED,
      department.id,
      `Department "${department.name}" updated`,
    );

    return department;
  }

  async softDelete(companyId: string, departmentId: string) {
    const department = await this.findById(companyId, departmentId);

    const activeChildren = await this.prisma.department.count({
      where: { parentDepartmentId: departmentId, deletedAt: null },
    });

    if (activeChildren > 0) {
      throw new BadRequestException('Cannot delete department with active child departments');
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { deletedAt: new Date(), updatedByUserId: undefined },
    });

    await this.recordAudit(
      companyId,
      department.createdByUserId,
      OrganizationAuditEventType.DEPARTMENT_UPDATED,
      department.id,
      `Department "${department.name}" deleted`,
    );

    return updated;
  }

  async archive(companyId: string, departmentId: string, userId: string) {
    const department = await this.findById(companyId, departmentId);

    if (department.status === DepartmentStatus.ARCHIVED) {
      throw new BadRequestException('Department is already archived');
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { status: DepartmentStatus.ARCHIVED, updatedByUserId: userId },
    });

    await this.recordAudit(
      companyId,
      userId,
      OrganizationAuditEventType.DEPARTMENT_ARCHIVED,
      department.id,
      `Department "${department.name}" archived`,
    );

    return updated;
  }

  async restore(companyId: string, departmentId: string, userId: string) {
    const department = await this.findById(companyId, departmentId);

    if (department.status === DepartmentStatus.ACTIVE) {
      throw new BadRequestException('Department is already active');
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { status: DepartmentStatus.ACTIVE, updatedByUserId: userId },
    });

    await this.recordAudit(
      companyId,
      userId,
      OrganizationAuditEventType.DEPARTMENT_RESTORED,
      department.id,
      `Department "${department.name}" restored`,
    );

    return updated;
  }

  private async validateDepartmentData(
    companyId: string,
    dto: CreateDepartmentDto | UpdateDepartmentDto,
    excludeId: string | null,
  ): Promise<void> {
    if (dto.name) {
      const duplicateName = await this.prisma.department.findFirst({
        where: {
          companyId,
          name: dto.name,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (duplicateName) {
        throw new ConflictException(
          `Department with name "${dto.name}" already exists in this company`,
        );
      }
    }

    if (dto.code) {
      const duplicateCode = await this.prisma.department.findFirst({
        where: {
          companyId,
          code: dto.code,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (duplicateCode) {
        throw new ConflictException(
          `Department with code "${dto.code}" already exists in this company`,
        );
      }
    }
  }

  private async wouldCreateCircularRef(
    departmentId: string,
    targetParentId: string,
    companyId: string,
  ): Promise<boolean> {
    const allDepts = await this.prisma.department.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, parentDepartmentId: true },
    });

    const childMap = new Map<string, string[]>();
    for (const dept of allDepts) {
      if (dept.parentDepartmentId) {
        const children = childMap.get(dept.parentDepartmentId) || [];
        children.push(dept.id);
        childMap.set(dept.parentDepartmentId, children);
      }
    }

    const visited = new Set<string>();
    const queue = [targetParentId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === departmentId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const children = childMap.get(current) || [];
      queue.push(...children);
    }

    return false;
  }

  private buildTree(
    departments: Array<{
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      parentDepartmentId: string | null;
      managerMembershipId: string | null;
      status: DepartmentStatus;
      sortOrder: number;
      _count: { departmentMemberships: number };
      managerMembership: {
        id: string;
        user: { id: string; firstName: string; lastName: string; email: string };
      } | null;
    }>,
  ) {
    const nodeMap = new Map<string, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];

    for (const dept of departments) {
      nodeMap.set(dept.id, {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        parentDepartmentId: dept.parentDepartmentId,
        managerMembershipId: dept.managerMembershipId,
        status: dept.status,
        sortOrder: dept.sortOrder,
        memberCount: dept._count.departmentMemberships,
        manager: dept.managerMembership
          ? {
              id: dept.managerMembership.id,
              user: dept.managerMembership.user,
            }
          : null,
        children: [],
      });
    }

    const visited = new Set<string>();
    for (const dept of departments) {
      if (visited.has(dept.id)) continue;
      visited.add(dept.id);

      const node = nodeMap.get(dept.id)!;
      if (dept.parentDepartmentId && nodeMap.has(dept.parentDepartmentId)) {
        const parent = nodeMap.get(dept.parentDepartmentId)!;
        if (!visited.has(dept.parentDepartmentId)) {
          roots.push(node);
        } else {
          (parent.children as unknown[]).push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async recordAudit(
    companyId: string,
    actorUserId: string,
    eventType: OrganizationAuditEventType,
    entityId: string,
    description: string,
  ): Promise<void> {
    try {
      await this.orgAuditService.record({
        companyId,
        actorUserId,
        eventType,
        entityType: 'Department',
        entityId,
        description,
      });
    } catch (error) {
      this.logger.warn(`Failed to record audit event: ${(error as Error).message}`);
    }
  }
}
