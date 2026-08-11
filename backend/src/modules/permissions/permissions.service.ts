import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.permission.findMany({ orderBy: { resource: 'asc' } });
  }

  async findByCode(code: string) {
    const permission = await this.prisma.permission.findUnique({ where: { code } });
    if (!permission) {
      throw new NotFoundException(`Permission with code "${code}" not found`);
    }
    return permission;
  }

  async findOrCreate(code: string, name: string, resource: string, action: string) {
    const existing = await this.prisma.permission.findUnique({ where: { code } });
    if (existing) return existing;

    return this.prisma.permission.create({
      data: { code, name, resource, action },
    });
  }

  async getByResource(resource: string) {
    return this.prisma.permission.findMany({
      where: { resource },
      orderBy: { code: 'asc' },
    });
  }
}
