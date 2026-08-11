import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { RoleScope } from '@prisma/client';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findSystemRole(code: string) {
    const role = await this.prisma.role.findFirst({
      where: { code, scope: RoleScope.PLATFORM },
    });
    if (!role) {
      throw new NotFoundException(`System role with code "${code}" not found`);
    }
    return role;
  }

  async findCompanyRole(code: string, companyId: string) {
    const role = await this.prisma.role.findFirst({
      where: { code, scope: RoleScope.COMPANY, companyId },
    });
    if (!role) {
      throw new NotFoundException(`Company role with code "${code}" not found`);
    }
    return role;
  }

  async findOrCreateSystemRole(code: string, name: string) {
    const existing = await this.prisma.role.findFirst({
      where: { code, scope: RoleScope.PLATFORM },
    });
    if (existing) return existing;

    return this.prisma.role.create({
      data: { code, name, scope: RoleScope.PLATFORM, isSystem: true },
    });
  }

  async findOrCreateCompanyRole(code: string, name: string, companyId: string) {
    const existing = await this.prisma.role.findFirst({
      where: { code, scope: RoleScope.COMPANY, companyId },
    });
    if (existing) return existing;

    return this.prisma.role.create({
      data: { code, name, scope: RoleScope.COMPANY, companyId },
    });
  }

  async getCompanyRoles(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId, scope: RoleScope.COMPANY },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async assignPermissions(roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    const foundCodes = permissions.map((p) => p.code);
    const missingCodes = permissionCodes.filter((c) => !foundCodes.includes(c));
    if (missingCodes.length > 0) {
      throw new BadRequestException(`Permissions not found: ${missingCodes.join(', ')}`);
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissions.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
    }

    return this.getRolePermissions(roleId);
  }

  async getRolePermissions(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    return this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
  }

  async ensureDefaultRoles(companyId: string) {
    const allPermissions = await this.prisma.permission.findMany();

    const existing = await this.prisma.role.findFirst({
      where: { code: 'COMPANY_ADMIN', scope: RoleScope.COMPANY, companyId },
    });
    if (existing) return existing;

    const adminRole = await this.prisma.role.create({
      data: {
        code: 'COMPANY_ADMIN',
        name: 'Company Admin',
        scope: RoleScope.COMPANY,
        companyId,
      },
    });

    if (allPermissions.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: allPermissions.map((p) => ({
          roleId: adminRole.id,
          permissionId: p.id,
        })),
      });
    }

    return adminRole;
  }
}
