import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma, JobStatus, JobPublicationStatus } from '@prisma/client';
import { CreateJobTemplateDto } from './dto/create-job-template.dto';
import { UpdateJobTemplateDto } from './dto/update-job-template.dto';
import { JobTemplateQueryDto } from './dto/job-template-query.dto';
import { CreateJobFromTemplateDto } from './dto/create-job-from-template.dto';
import * as crypto from 'crypto';

@Injectable()
export class JobTemplatesService {
  private readonly logger = new Logger(JobTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateJobTemplateDto, membershipId: string) {
    const existing = await this.prisma.jobTemplate.findFirst({
      where: { companyId, name: dto.name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `Job template with name "${dto.name}" already exists in this company`,
      );
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!department) {
        throw new BadRequestException('Department not found in this company');
      }
    }

    const template = await this.prisma.jobTemplate.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        departmentId: dto.departmentId ?? null,
        employmentType: dto.employmentType ?? null,
        workplaceType: dto.workplaceType ?? null,
        experienceLevel: dto.experienceLevel ?? null,
        titleTemplate: dto.titleTemplate ?? null,
        descriptionTemplate: dto.descriptionTemplate,
        responsibilitiesTemplate: dto.responsibilitiesTemplate ?? null,
        qualificationsTemplate: dto.qualificationsTemplate ?? null,
        benefitsTemplate: dto.benefitsTemplate ?? null,
        createdByMembershipId: membershipId,
      },
    });

    this.logger.log(`Job template "${template.name}" created in company ${companyId}`);
    return template;
  }

  async findAll(companyId: string, query: JobTemplateQueryDto) {
    const { page = 1, limit = 20, search, isActive, category, sortBy, sortOrder = 'asc' } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.JobTemplateWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'usageCount'] as const;
    const orderField =
      sortBy && allowedSortFields.includes(sortBy as (typeof allowedSortFields)[number])
        ? sortBy
        : 'createdAt';

    const [data, total] = await Promise.all([
      this.prisma.jobTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder } as Prisma.JobTemplateOrderByWithRelationInput,
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { jobs: true } },
        },
      }),
      this.prisma.jobTemplate.count({ where }),
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

  async findById(companyId: string, templateId: string) {
    const template = await this.prisma.jobTemplate.findFirst({
      where: { id: templateId, companyId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { jobs: true } },
      },
    });

    if (!template) {
      throw new NotFoundException(`Job template with ID ${templateId} not found`);
    }

    return template;
  }

  async update(
    companyId: string,
    templateId: string,
    dto: UpdateJobTemplateDto,
    membershipId: string,
  ) {
    const template = await this.findById(companyId, templateId);

    if (template.isSystem) {
      throw new BadRequestException('JOB_TEMPLATE_SYSTEM_PROTECTED');
    }

    if (dto.name && dto.name !== template.name) {
      const duplicate = await this.prisma.jobTemplate.findFirst({
        where: { companyId, name: dto.name, deletedAt: null, id: { not: templateId } },
      });
      if (duplicate) {
        throw new ConflictException(
          `Job template with name "${dto.name}" already exists in this company`,
        );
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!department) {
        throw new BadRequestException('Department not found in this company');
      }
    }

    const updated = await this.prisma.jobTemplate.update({
      where: { id: templateId },
      data: {
        ...dto,
        updatedByMembershipId: membershipId,
      },
    });

    this.logger.log(`Job template "${template.name}" updated in company ${companyId}`);
    return updated;
  }

  async softDelete(companyId: string, templateId: string) {
    const template = await this.findById(companyId, templateId);

    if (template.isSystem) {
      throw new BadRequestException('JOB_TEMPLATE_SYSTEM_PROTECTED');
    }

    const updated = await this.prisma.jobTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date(), updatedByMembershipId: undefined },
    });

    this.logger.log(`Job template "${template.name}" soft deleted in company ${companyId}`);
    return updated;
  }

  async createJob(
    companyId: string,
    templateId: string,
    dto: CreateJobFromTemplateDto,
    membershipId: string,
    _userId: string,
  ) {
    const template = await this.findById(companyId, templateId);

    const jobCode = await this.generateJobCode(companyId);
    const slug = await this.generateSlug(dto.title, companyId);

    const job = await this.prisma.job.create({
      data: {
        companyId,
        jobCode,
        slug,
        title: dto.title,
        departmentId: dto.departmentId ?? template.departmentId ?? null,
        employmentType: dto.employmentType ?? template.employmentType ?? 'FULL_TIME',
        workplaceType: dto.workplaceType ?? template.workplaceType ?? 'ON_SITE',
        experienceLevel: dto.experienceLevel ?? template.experienceLevel ?? 'NOT_SPECIFIED',
        description: dto.description ?? template.descriptionTemplate,
        responsibilities: dto.responsibilities ?? template.responsibilitiesTemplate,
        qualifications: dto.qualifications ?? template.qualificationsTemplate,
        benefits: dto.benefits ?? template.benefitsTemplate,
        templateId: template.id,
        ownerMembershipId: dto.ownerMembershipId ?? membershipId,
        createdByMembershipId: membershipId,
        status: JobStatus.DRAFT,
        publicationStatus: JobPublicationStatus.NOT_PUBLISHED,
      },
    });

    await this.prisma.jobTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    this.logger.log(
      `Job "${job.title}" created from template "${template.name}" in company ${companyId}`,
    );
    return job;
  }

  async findAllSystem(companyId: string) {
    const templates = await this.prisma.jobTemplate.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ companyId }, { companyId: null as unknown as string, isSystem: true }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
      },
    });
    return templates;
  }

  private async generateJobCode(companyId: string): Promise<string> {
    const count = await this.prisma.job.count({ where: { companyId } });
    const shortId = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `JOB-${shortId}-${(count + 1).toString().padStart(4, '0')}`;
  }

  private async generateSlug(title: string, _companyId: string): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${baseSlug}-${suffix}`;
  }
}
