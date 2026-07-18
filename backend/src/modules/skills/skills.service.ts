import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SkillQueryDto } from './dto/skill-query.dto';

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateSkillDto) {
    const normalizedName = dto.name.trim().toLowerCase();

    const existing = await this.prisma.skill.findFirst({
      where: { normalizedName, type: dto.type, companyId },
    });
    if (existing) {
      throw new ConflictException(`Skill "${dto.name}" already exists in this company`);
    }

    const skill = await this.prisma.skill.create({
      data: {
        normalizedName,
        displayName: dto.name.trim(),
        type: dto.type,
        description: dto.description ?? null,
        companyId,
      },
    });

    this.logger.log(`Skill "${skill.displayName}" created in company ${companyId}`);
    return skill;
  }

  async findAll(companyId: string, query: SkillQueryDto) {
    const { page = 1, limit = 20, search, type, sortBy, sortOrder = 'asc' } = query;

    const skip = (page - 1) * limit;

    const conditions: Prisma.SkillWhereInput[] = [];

    conditions.push({
      OR: [{ companyId }, { isGlobal: true }],
    });

    if (type) {
      conditions.push({ type });
    }

    if (search) {
      conditions.push({
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.SkillWhereInput =
      conditions.length > 1 ? { AND: conditions } : conditions[0];

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'type'] as const;
    const orderField =
      sortBy && allowedSortFields.includes(sortBy as (typeof allowedSortFields)[number])
        ? sortBy
        : 'displayName';

    const orderBy: Prisma.SkillOrderByWithRelationInput =
      orderField === 'name' ? { displayName: sortOrder } : { [orderField]: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.skill.count({ where }),
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

  async findById(companyId: string, skillId: string) {
    const skill = await this.prisma.skill.findFirst({
      where: {
        id: skillId,
        OR: [{ companyId }, { isGlobal: true }],
      },
    });

    if (!skill) {
      throw new NotFoundException(`Skill with ID ${skillId} not found`);
    }

    return skill;
  }

  async update(companyId: string, skillId: string, dto: UpdateSkillDto) {
    const skill = await this.findById(companyId, skillId);

    if (skill.isGlobal) {
      throw new BadRequestException('Cannot update a global skill');
    }

    if (skill.companyId !== companyId) {
      throw new NotFoundException(`Skill with ID ${skillId} not found`);
    }

    if (dto.name) {
      const normalizedName = dto.name.trim().toLowerCase();
      const duplicate = await this.prisma.skill.findFirst({
        where: {
          normalizedName,
          type: dto.type ?? skill.type,
          companyId,
          id: { not: skillId },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Skill "${dto.name}" already exists in this company`);
      }
    }

    const updated = await this.prisma.skill.update({
      where: { id: skillId },
      data: {
        ...(dto.name
          ? { displayName: dto.name.trim(), normalizedName: dto.name.trim().toLowerCase() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    this.logger.log(`Skill "${updated.displayName}" updated in company ${companyId}`);
    return updated;
  }

  async delete(companyId: string, skillId: string) {
    const skill = await this.findById(companyId, skillId);

    if (skill.isGlobal) {
      throw new BadRequestException('Cannot delete a global skill');
    }

    if (skill.companyId !== companyId) {
      throw new NotFoundException(`Skill with ID ${skillId} not found`);
    }

    await this.prisma.skill.delete({
      where: { id: skillId },
    });

    this.logger.log(`Skill "${skill.displayName}" deleted from company ${companyId}`);
    return { deleted: true };
  }
}
