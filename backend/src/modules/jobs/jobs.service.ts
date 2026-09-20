import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  JobStatus,
  JobVisibility,
  JobApprovalStatus,
  JobPublicationStatus,
  JobCollaboratorType,
  PipelineStageType,
  JobActivityEventType,
  ApplicationStatus,
  AiScreeningStatus,
  AiScreeningRecommendation,
  InterviewStatus,
  Prisma,
} from '@prisma/client';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobCodeService } from './job-code.service';
import { JobActivityService } from './job-activity.service';
import { JobWorkflowService } from './job-workflow.service';

interface JobQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobStatus[];
  departmentId?: string[];
  locationId?: string[];
  employmentType?: string[];
  workplaceType?: string[];
  experienceLevel?: string[];
  visibility?: JobVisibility[];
  ownerMembershipId?: string;
  collaboratorMembershipId?: string;
  createdByMembershipId?: string;
  approvalStatus?: JobApprovalStatus[];
  publicationStatus?: JobPublicationStatus[];
  applicationDeadlineFrom?: string;
  applicationDeadlineTo?: string;
  createdFrom?: string;
  createdTo?: string;
  hasSalary?: boolean;
  publishedOnly?: boolean;
  archived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface JobActivityQueryDto {
  page?: number;
  limit?: number;
  eventType?: JobActivityEventType;
  actorMembershipId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const DEFAULT_PIPELINE_STAGES: Array<{
  name: string;
  type: PipelineStageType;
  sortOrder: number;
}> = [
  { name: 'Applied', type: PipelineStageType.APPLIED, sortOrder: 0 },
  { name: 'Screening', type: PipelineStageType.SCREENING, sortOrder: 1 },
  { name: 'Interview', type: PipelineStageType.RECRUITER_INTERVIEW, sortOrder: 2 },
  { name: 'Offer', type: PipelineStageType.OFFER, sortOrder: 3 },
  { name: 'Hired', type: PipelineStageType.HIRED, sortOrder: 4 },
  { name: 'Rejected', type: PipelineStageType.REJECTED, sortOrder: 5 },
];

const ALLOWED_SORT_FIELDS = [
  'title',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'applicationDeadline',
  'status',
  'jobCode',
] as const;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAuditService: OrganizationAuditService,
    private readonly jobCodeService: JobCodeService,
    private readonly jobActivityService: JobActivityService,
    private readonly jobWorkflowService: JobWorkflowService,
  ) {}

  async create(companyId: string, dto: CreateJobDto, membershipId: string, userId: string) {
    const jobCode = await this.jobCodeService.generateCode(companyId);
    const slug = await this.jobCodeService.generateSlug(companyId, dto.title);

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!department) {
        throw new BadRequestException('JOB_DEPARTMENT_INVALID');
      }
    }

    if (dto.locationId) {
      const location = await this.prisma.companyLocation.findFirst({
        where: { id: dto.locationId, companyId },
      });
      if (!location) {
        throw new BadRequestException('JOB_LOCATION_INVALID');
      }
    }

    const ownerMembershipId = dto.ownerMembershipId ?? membershipId;
    const ownerMembership = await this.prisma.companyMembership.findFirst({
      where: { id: ownerMembershipId, companyId, status: 'ACTIVE' },
    });
    if (!ownerMembership) {
      throw new BadRequestException('JOB_OWNER_INVALID');
    }

    if (dto.salaryMin != null && dto.salaryMax != null && dto.salaryMin > dto.salaryMax) {
      throw new BadRequestException('JOB_SALARY_RANGE_INVALID');
    }

    if (dto.numberOfOpenings != null && dto.numberOfOpenings < 1) {
      throw new BadRequestException('JOB_OPENINGS_INVALID');
    }

    if (dto.applicationDeadline) {
      const deadline = new Date(dto.applicationDeadline);
      if (deadline <= new Date()) {
        throw new BadRequestException('JOB_DEADLINE_INVALID');
      }
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          companyId,
          jobCode,
          slug,
          title: dto.title,
          departmentId: dto.departmentId ?? null,
          locationId: dto.locationId ?? null,
          employmentType: dto.employmentType,
          workplaceType: dto.workplaceType,
          experienceLevel: dto.experienceLevel,
          status: JobStatus.DRAFT,
          visibility: dto.visibility ?? JobVisibility.INTERNAL,
          approvalStatus: JobApprovalStatus.NOT_REQUIRED,
          publicationStatus: JobPublicationStatus.NOT_PUBLISHED,
          description: dto.description,
          responsibilities: dto.responsibilities ?? null,
          qualifications: dto.qualifications ?? null,
          benefits: dto.benefits ?? null,
          numberOfOpenings: dto.numberOfOpenings ?? 1,
          salaryMin: dto.salaryMin ?? null,
          salaryMax: dto.salaryMax ?? null,
          salaryCurrency: dto.salaryCurrency ?? null,
          salaryPeriod: dto.salaryPeriod ?? null,
          salaryVisible: dto.salaryVisible ?? false,
          applicationDeadline: dto.applicationDeadline ? new Date(dto.applicationDeadline) : null,
          expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : null,
          ownerMembershipId,
          createdByMembershipId: membershipId,
          templateId: dto.templateId ?? null,
        },
      });

      await tx.jobScreeningConfiguration.create({
        data: {
          jobId: created.id,
          enabled: true,
          automaticShortlistingEnabled: false,
          automaticRejectionEnabled: false,
          requireRecruiterApproval: true,
          aiExplanationRequired: true,
          fairnessReviewRequired: true,
          disabledCandidateAccommodationEnabled: true,
          updatedByMembershipId: membershipId,
        },
      });

      await tx.jobAccessibilityConfiguration.create({
        data: {
          jobId: created.id,
          remoteAccommodationAvailable: false,
          signLanguageInterpreterAvailable: false,
          screenReaderCompatibleAssessmentRequired: false,
          extendedTimeAvailable: false,
          alternativeInterviewFormatAvailable: false,
          candidateDisclosureOptional: true,
          disabilityDataRestricted: true,
        },
      });

      const pipeline = await tx.jobPipeline.create({
        data: {
          jobId: created.id,
          name: 'Default Pipeline',
          createdByMembershipId: membershipId,
          stages: {
            create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
              name: stage.name,
              type: stage.type,
              sortOrder: stage.sortOrder,
            })),
          },
        },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
      });

      await tx.jobCollaborator.create({
        data: {
          jobId: created.id,
          companyMembershipId: membershipId,
          type: JobCollaboratorType.OWNER,
          canEdit: true,
          canReviewCandidates: true,
          canScheduleInterviews: true,
          canViewSalary: true,
          canPublish: true,
          assignedByMembershipId: membershipId,
        },
      });

      return created;
    });

    await this.jobActivityService.record({
      companyId,
      jobId: job.id,
      eventType: JobActivityEventType.JOB_CREATED,
      description: `Job "${job.title}" (${job.jobCode}) created`,
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: { jobCode, slug },
    });

    return this.findById(companyId, job.id);
  }

  async findAll(companyId: string, query: JobQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      departmentId,
      locationId,
      employmentType,
      workplaceType,
      experienceLevel,
      visibility,
      ownerMembershipId,
      collaboratorMembershipId,
      createdByMembershipId,
      approvalStatus,
      publicationStatus,
      applicationDeadlineFrom,
      applicationDeadlineTo,
      createdFrom,
      createdTo,
      hasSalary,
      publishedOnly,
      archived,
      sortBy,
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = { companyId };

    if (!archived) {
      where.deletedAt = null;
    }

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (departmentId && departmentId.length > 0) {
      where.departmentId = { in: departmentId };
    }

    if (locationId && locationId.length > 0) {
      where.locationId = { in: locationId };
    }

    if (employmentType && employmentType.length > 0) {
      where.employmentType = { in: employmentType as any };
    }

    if (workplaceType && workplaceType.length > 0) {
      where.workplaceType = { in: workplaceType as any };
    }

    if (experienceLevel && experienceLevel.length > 0) {
      where.experienceLevel = { in: experienceLevel as any };
    }

    if (visibility && visibility.length > 0) {
      where.visibility = { in: visibility };
    }

    if (ownerMembershipId) {
      where.ownerMembershipId = ownerMembershipId;
    }

    if (collaboratorMembershipId) {
      where.collaborators = {
        some: {
          companyMembershipId: collaboratorMembershipId,
          removedAt: null,
        },
      };
    }

    if (createdByMembershipId) {
      where.createdByMembershipId = createdByMembershipId;
    }

    if (approvalStatus && approvalStatus.length > 0) {
      where.approvalStatus = { in: approvalStatus };
    }

    if (publicationStatus && publicationStatus.length > 0) {
      where.publicationStatus = { in: publicationStatus };
    }

    if (applicationDeadlineFrom || applicationDeadlineTo) {
      where.applicationDeadline = {};
      if (applicationDeadlineFrom)
        where.applicationDeadline.gte = new Date(applicationDeadlineFrom);
      if (applicationDeadlineTo) where.applicationDeadline.lte = new Date(applicationDeadlineTo);
    }

    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = new Date(createdFrom);
      if (createdTo) where.createdAt.lte = new Date(createdTo);
    }

    if (hasSalary === true) {
      where.salaryMin = { not: null };
    } else if (hasSalary === false) {
      where.salaryMin = null;
    }

    if (publishedOnly) {
      where.status = JobStatus.PUBLISHED;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { jobCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderField =
      sortBy && (ALLOWED_SORT_FIELDS as readonly string[]).includes(sortBy) ? sortBy : 'createdAt';

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder } as Prisma.JobOrderByWithRelationInput,
        include: {
          department: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, city: true, countryCode: true } },
          ownerMembership: {
            select: {
              id: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          createdBy: {
            select: {
              id: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          _count: {
            select: {
              collaborators: { where: { removedAt: null } },
              screeningQuestions: { where: { deletedAt: null } },
              skills: true,
            },
          },
        },
      }),
      this.prisma.job.count({ where }),
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

  async findById(companyId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true } },
        location: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            city: true,
            stateOrProvince: true,
            countryCode: true,
            postalCode: true,
            timezone: true,
          },
        },
        ownerMembership: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        createdBy: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        updatedBy: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        skills: {
          include: {
            skill: { select: { id: true, displayName: true, normalizedName: true, type: true } },
          },
        },
        educationRequirements: true,
        experienceRequirements: true,
        languageRequirements: true,
        screeningQuestions: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
        screeningConfig: true,
        accessibilityConfig: true,
        pipeline: {
          include: {
            stages: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        collaborators: {
          where: { removedAt: null },
          include: {
            membership: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            assignedBy: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        approvals: {
          include: {
            requestedBy: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            assignedApprover: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            reviewedBy: {
              select: {
                id: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        publications: true,
        activityEvents: {
          take: 50,
          orderBy: { occurredAt: 'desc' },
        },
        _count: {
          select: {
            collaborators: { where: { removedAt: null } },
            screeningQuestions: { where: { deletedAt: null } },
            skills: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    return job;
  }

  async update(
    companyId: string,
    jobId: string,
    dto: UpdateJobDto,
    membershipId: string,
    userId: string,
  ) {
    const existing = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: {
        id: true,
        status: true,
        version: true,
        title: true,
        jobCode: true,
        slug: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    if (dto.expectedVersion !== undefined && dto.expectedVersion !== existing.version) {
      throw new ConflictException('JOB_STALE_VERSION');
    }

    const isPublished =
      existing.status === JobStatus.PUBLISHED || existing.status === JobStatus.PAUSED;

    const materialFields = [
      'status',
      'visibility',
      'salaryMin',
      'salaryMax',
      'salaryCurrency',
      'salaryPeriod',
    ] as const;

    if (isPublished) {
      for (const field of materialFields) {
        if ((dto as Record<string, unknown>)[field] !== undefined) {
          throw new BadRequestException(`Cannot update "${field}" on a published job`);
        }
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId, deletedAt: null },
      });
      if (!department) {
        throw new BadRequestException('JOB_DEPARTMENT_INVALID');
      }
    }

    if (dto.locationId) {
      const location = await this.prisma.companyLocation.findFirst({
        where: { id: dto.locationId, companyId },
      });
      if (!location) {
        throw new BadRequestException('JOB_LOCATION_INVALID');
      }
    }

    if (dto.salaryMin != null && dto.salaryMax != null && dto.salaryMin > dto.salaryMax) {
      throw new BadRequestException('JOB_SALARY_RANGE_INVALID');
    }

    if (dto.numberOfOpenings != null && dto.numberOfOpenings < 1) {
      throw new BadRequestException('JOB_OPENINGS_INVALID');
    }

    if (dto.applicationDeadline) {
      const deadline = new Date(dto.applicationDeadline);
      if (deadline <= new Date()) {
        throw new BadRequestException('JOB_DEADLINE_INVALID');
      }
    }

    const changedFields: string[] = [];
    for (const [key, value] of Object.entries(dto)) {
      if (key === 'expectedVersion') continue;
      if (value !== undefined) {
        changedFields.push(key);
      }
    }

    let newSlug: string | undefined;
    if (dto.title && dto.title !== existing.title) {
      newSlug = await this.jobCodeService.regenerateSlug(companyId, dto.title, jobId);
    }

    const updateData: Record<string, unknown> = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(newSlug !== undefined && { slug: newSlug }),
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId ?? null }),
      ...(dto.locationId !== undefined && { locationId: dto.locationId ?? null }),
      ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
      ...(dto.workplaceType !== undefined && { workplaceType: dto.workplaceType }),
      ...(dto.experienceLevel !== undefined && { experienceLevel: dto.experienceLevel }),
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.responsibilities !== undefined && { responsibilities: dto.responsibilities ?? null }),
      ...(dto.qualifications !== undefined && { qualifications: dto.qualifications ?? null }),
      ...(dto.benefits !== undefined && { benefits: dto.benefits ?? null }),
      ...(dto.numberOfOpenings !== undefined && { numberOfOpenings: dto.numberOfOpenings }),
      ...(dto.salaryMin !== undefined && { salaryMin: dto.salaryMin ?? null }),
      ...(dto.salaryMax !== undefined && { salaryMax: dto.salaryMax ?? null }),
      ...(dto.salaryCurrency !== undefined && { salaryCurrency: dto.salaryCurrency ?? null }),
      ...(dto.salaryPeriod !== undefined && { salaryPeriod: dto.salaryPeriod ?? null }),
      ...(dto.salaryVisible !== undefined && { salaryVisible: dto.salaryVisible }),
      ...(dto.applicationDeadline !== undefined && {
        applicationDeadline: dto.applicationDeadline ? new Date(dto.applicationDeadline) : null,
      }),
      ...(dto.expectedStartDate !== undefined && {
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : null,
      }),
      ...(dto.templateId !== undefined && { templateId: dto.templateId ?? null }),
      updatedByMembershipId: membershipId,
      version: existing.version + 1,
    };

    await this.prisma.job.update({
      where: { id: jobId },
      data: updateData as Prisma.JobUpdateInput,
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_UPDATED,
      description: `Job "${existing.title}" (${existing.jobCode}) updated`,
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: {
        changedFields,
        previousVersion: existing.version,
        newVersion: existing.version + 1,
      },
    });

    return this.findById(companyId, jobId);
  }

  async softDelete(companyId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, title: true, jobCode: true },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.DRAFT) {
      throw new BadRequestException('JOB_CANNOT_DELETE_PUBLISHED');
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Job ${jobId} soft-deleted`);
  }

  async archive(companyId: string, jobId: string, membershipId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, title: true, jobCode: true },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    if (job.status === JobStatus.ARCHIVED) {
      throw new BadRequestException('Job is already archived');
    }

    await this.jobWorkflowService.transition(companyId, jobId, JobStatus.ARCHIVED, membershipId);
  }

  async restore(companyId: string, jobId: string, membershipId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: { id: true, status: true, title: true, jobCode: true, deletedAt: true },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.ARCHIVED) {
      throw new BadRequestException('Job is not archived');
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.DRAFT,
        archivedAt: null,
        updatedByMembershipId: membershipId,
        ...(job.deletedAt ? { deletedAt: null } : {}),
      },
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_RESTORED,
      description: `Job "${job.title}" (${job.jobCode}) restored from archive`,
      actorMembershipId: membershipId,
    });
  }

  async duplicate(
    companyId: string,
    jobId: string,
    dto: Partial<CreateJobDto>,
    membershipId: string,
  ) {
    const source = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      include: {
        skills: true,
        educationRequirements: true,
        experienceRequirements: true,
        languageRequirements: true,
        screeningQuestions: {
          where: { deletedAt: null },
        },
        screeningConfig: true,
        accessibilityConfig: true,
        pipeline: {
          include: {
            stages: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!source) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    const newTitle = dto.title ?? `${source.title} (Copy)`;
    const jobCode = await this.jobCodeService.generateCode(companyId);
    const slug = await this.jobCodeService.generateSlug(companyId, newTitle);

    const duplicate = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          companyId,
          jobCode,
          slug,
          title: newTitle,
          departmentId: dto.departmentId ?? source.departmentId,
          locationId: dto.locationId ?? source.locationId,
          employmentType: dto.employmentType ?? source.employmentType,
          workplaceType: dto.workplaceType ?? source.workplaceType,
          experienceLevel: dto.experienceLevel ?? source.experienceLevel,
          status: JobStatus.DRAFT,
          visibility: dto.visibility ?? source.visibility,
          approvalStatus: JobApprovalStatus.NOT_REQUIRED,
          publicationStatus: JobPublicationStatus.NOT_PUBLISHED,
          description: dto.description ?? source.description,
          responsibilities: source.responsibilities,
          qualifications: source.qualifications,
          benefits: source.benefits,
          numberOfOpenings: source.numberOfOpenings,
          salaryMin: source.salaryMin,
          salaryMax: source.salaryMax,
          salaryCurrency: source.salaryCurrency,
          salaryPeriod: source.salaryPeriod,
          salaryVisible: source.salaryVisible,
          applicationDeadline: null,
          expectedStartDate: null,
          ownerMembershipId: membershipId,
          createdByMembershipId: membershipId,
        },
      });

      if (source.skills.length > 0) {
        await tx.jobSkill.createMany({
          data: source.skills.map((s) => ({
            jobId: created.id,
            skillId: s.skillId,
            importance: s.importance,
            minimumYears: s.minimumYears,
            proficiencyLevel: s.proficiencyLevel,
            weight: s.weight,
            notes: s.notes,
          })),
        });
      }

      if (source.educationRequirements.length > 0) {
        await tx.jobEducationRequirement.createMany({
          data: source.educationRequirements.map((e) => ({
            jobId: created.id,
            level: e.level,
            fieldOfStudy: e.fieldOfStudy,
            importance: e.importance,
            minimumGrade: e.minimumGrade,
            notes: e.notes,
          })),
        });
      }

      if (source.experienceRequirements.length > 0) {
        await tx.jobExperienceRequirement.createMany({
          data: source.experienceRequirements.map((e) => ({
            jobId: created.id,
            title: e.title,
            domain: e.domain,
            minimumYears: e.minimumYears,
            maximumYears: e.maximumYears,
            importance: e.importance,
            description: e.description,
          })),
        });
      }

      if (source.languageRequirements.length > 0) {
        await tx.jobLanguageRequirement.createMany({
          data: source.languageRequirements.map((l) => ({
            jobId: created.id,
            languageCode: l.languageCode,
            proficiency: l.proficiency,
            importance: l.importance,
            interviewAllowed: l.interviewAllowed,
          })),
        });
      }

      if (source.screeningQuestions.length > 0) {
        await tx.jobScreeningQuestion.createMany({
          data: source.screeningQuestions.map((q) => ({
            jobId: created.id,
            question: q.question,
            description: q.description,
            type: q.type,
            options: q.options as Prisma.InputJsonValue,
            required: q.required,
            disqualifying: q.disqualifying,
            minimumScore: q.minimumScore,
            maximumScore: q.maximumScore,
            weight: q.weight,
            sortOrder: q.sortOrder,
            aiEvaluationAllowed: q.aiEvaluationAllowed,
          })),
        });
      }

      if (source.screeningConfig) {
        await tx.jobScreeningConfiguration.create({
          data: {
            jobId: created.id,
            enabled: source.screeningConfig.enabled,
            automaticShortlistingEnabled: source.screeningConfig.automaticShortlistingEnabled,
            automaticRejectionEnabled: source.screeningConfig.automaticRejectionEnabled,
            requireRecruiterApproval: source.screeningConfig.requireRecruiterApproval,
            aiExplanationRequired: source.screeningConfig.aiExplanationRequired,
            fairnessReviewRequired: source.screeningConfig.fairnessReviewRequired,
            disabledCandidateAccommodationEnabled:
              source.screeningConfig.disabledCandidateAccommodationEnabled,
            updatedByMembershipId: membershipId,
          },
        });
      }

      if (source.accessibilityConfig) {
        await tx.jobAccessibilityConfiguration.create({
          data: {
            jobId: created.id,
            accommodationsSupported: source.accessibilityConfig.accommodationsSupported,
            physicalRequirements: source.accessibilityConfig.physicalRequirements,
            essentialFunctions: source.accessibilityConfig.essentialFunctions,
            remoteAccommodationAvailable: source.accessibilityConfig.remoteAccommodationAvailable,
            signLanguageInterpreterAvailable:
              source.accessibilityConfig.signLanguageInterpreterAvailable,
            screenReaderCompatibleAssessmentRequired:
              source.accessibilityConfig.screenReaderCompatibleAssessmentRequired,
            extendedTimeAvailable: source.accessibilityConfig.extendedTimeAvailable,
            alternativeInterviewFormatAvailable:
              source.accessibilityConfig.alternativeInterviewFormatAvailable,
            candidateDisclosureOptional: source.accessibilityConfig.candidateDisclosureOptional,
            disabilityDataRestricted: source.accessibilityConfig.disabilityDataRestricted,
            notesVisibleToAuthorizedRecruitersOnly:
              source.accessibilityConfig.notesVisibleToAuthorizedRecruitersOnly,
          },
        });
      }

      const pipeline = await tx.jobPipeline.create({
        data: {
          jobId: created.id,
          name: source.pipeline?.name ?? 'Default Pipeline',
          createdByMembershipId: membershipId,
          stages: {
            create: (source.pipeline?.stages ?? DEFAULT_PIPELINE_STAGES).map((stage) => ({
              name: stage.name,
              type: stage.type,
              description: (stage as any).description ?? null,
              sortOrder: stage.sortOrder,
              required: (stage as any).required ?? true,
              autoAdvanceEnabled: (stage as any).autoAdvanceEnabled ?? false,
              requiresRecruiterApproval: (stage as any).requiresRecruiterApproval ?? false,
              slaHours: (stage as any).slaHours ?? null,
            })),
          },
        },
      });

      await tx.jobCollaborator.create({
        data: {
          jobId: created.id,
          companyMembershipId: membershipId,
          type: JobCollaboratorType.OWNER,
          canEdit: true,
          canReviewCandidates: true,
          canScheduleInterviews: true,
          canViewSalary: true,
          canPublish: true,
          assignedByMembershipId: membershipId,
        },
      });

      return created;
    });

    await this.jobActivityService.record({
      companyId,
      jobId: duplicate.id,
      eventType: JobActivityEventType.JOB_DUPLICATED,
      description: `Job duplicated from "${source.title}" (${source.jobCode})`,
      actorMembershipId: membershipId,
      metadata: { sourceJobId: jobId, sourceJobCode: source.jobCode },
    });

    return this.findById(companyId, duplicate.id);
  }

  async getSummary(companyId: string) {
    const [
      totalJobs,
      statusCounts,
      departmentCounts,
      employmentTypeCounts,
      workplaceTypeCounts,
      recentJobs,
    ] = await Promise.all([
      this.prisma.job.count({
        where: { companyId, deletedAt: null },
      }),
      this.prisma.job.groupBy({
        by: ['status'],
        where: { companyId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.job.groupBy({
        by: ['departmentId'],
        where: { companyId, deletedAt: null, departmentId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.job.groupBy({
        by: ['employmentType'],
        where: { companyId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.job.groupBy({
        by: ['workplaceType'],
        where: { companyId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.job.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          jobCode: true,
          title: true,
          status: true,
          employmentType: true,
          workplaceType: true,
          createdAt: true,
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true, city: true } },
        },
      }),
    ]);

    const statusSummary = Object.fromEntries(statusCounts.map((s) => [s.status, s._count.id]));

    return {
      totalJobs,
      byStatus: statusSummary,
      byEmploymentType: Object.fromEntries(
        employmentTypeCounts.map((e) => [e.employmentType, e._count.id]),
      ),
      byWorkplaceType: Object.fromEntries(
        workplaceTypeCounts.map((w) => [w.workplaceType, w._count.id]),
      ),
      byDepartment: departmentCounts.map((d) => ({
        departmentId: d.departmentId,
        count: d._count.id,
      })),
      recentJobs,
      summary: {
        draft: statusSummary[JobStatus.DRAFT] ?? 0,
        published: statusSummary[JobStatus.PUBLISHED] ?? 0,
        closed: statusSummary[JobStatus.CLOSED] ?? 0,
        filled: statusSummary[JobStatus.FILLED] ?? 0,
        archived: statusSummary[JobStatus.ARCHIVED] ?? 0,
      },
    };
  }

  /**
   * Truthful, tenant-scoped job analytics computed entirely from backend
   * aggregates. Nothing here is derived from a paginated page dataset. Counts
   * with no underlying data return 0 and averages with no data return null
   * rather than being estimated.
   */
  async getAnalytics(companyId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, numberOfOpenings: true },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    const terminalApplicationStatuses: ApplicationStatus[] = [
      ApplicationStatus.HIRED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
      ApplicationStatus.DISQUALIFIED,
      ApplicationStatus.ARCHIVED,
    ];

    const applicationWhere: Prisma.ApplicationWhereInput = {
      companyId,
      jobId,
      deletedAt: null,
    };
    const screeningWhere: Prisma.AiScreeningResultWhereInput = {
      companyId,
      jobId,
      application: { deletedAt: null },
    };
    const interviewWhere: Prisma.InterviewWhereInput = { companyId, jobId, deletedAt: null };
    const aiInterviewWhere: Prisma.AiInterviewWhereInput = {
      companyId,
      application: { jobId, deletedAt: null },
    };

    const [
      applicationTotal,
      applicationsByStatus,
      stageGroups,
      pipelineStages,
      hiredApplications,
      screeningTotal,
      screeningByStatus,
      screeningByRecommendation,
      screeningScore,
      interviewTotal,
      interviewsByStatus,
      interviewsByResult,
      upcomingInterviews,
      aiInterviewTotal,
      aiInterviewsByStatus,
    ] = await Promise.all([
      this.prisma.application.count({ where: applicationWhere }),
      this.prisma.application.groupBy({
        by: ['status'],
        where: applicationWhere,
        _count: { id: true },
      }),
      this.prisma.application.groupBy({
        by: ['currentStageId'],
        where: { ...applicationWhere, currentStageId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.jobPipelineStage.findMany({
        where: { pipeline: { jobId }, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sortOrder: true },
      }),
      this.prisma.application.findMany({
        where: {
          ...applicationWhere,
          status: ApplicationStatus.HIRED,
          hiredAt: { not: null },
        },
        select: { createdAt: true, hiredAt: true },
      }),
      this.prisma.aiScreeningResult.count({ where: screeningWhere }),
      this.prisma.aiScreeningResult.groupBy({
        by: ['status'],
        where: screeningWhere,
        _count: { id: true },
      }),
      this.prisma.aiScreeningResult.groupBy({
        by: ['recommendation'],
        where: { ...screeningWhere, status: AiScreeningStatus.COMPLETED },
        _count: { id: true },
      }),
      this.prisma.aiScreeningResult.aggregate({
        where: {
          ...screeningWhere,
          status: AiScreeningStatus.COMPLETED,
          overallScore: { not: null },
        },
        _avg: { overallScore: true },
        _count: { _all: true },
      }),
      this.prisma.interview.count({ where: interviewWhere }),
      this.prisma.interview.groupBy({
        by: ['status'],
        where: interviewWhere,
        _count: { id: true },
      }),
      this.prisma.interview.groupBy({
        by: ['result'],
        where: interviewWhere,
        _count: { id: true },
      }),
      this.prisma.interview.count({
        where: {
          ...interviewWhere,
          scheduledAt: { gte: new Date() },
          status: {
            notIn: [
              InterviewStatus.CANCELLED,
              InterviewStatus.COMPLETED,
              InterviewStatus.NO_SHOW,
              InterviewStatus.EXPIRED,
            ],
          },
        },
      }),
      this.prisma.aiInterview.count({ where: aiInterviewWhere }),
      this.prisma.aiInterview.groupBy({
        by: ['status'],
        where: aiInterviewWhere,
        _count: { id: true },
      }),
    ]);

    const applicationStatusMap: Record<string, number> = {};
    for (const row of applicationsByStatus) {
      applicationStatusMap[row.status] = row._count.id;
    }

    const stageCountMap = new Map<string, number>();
    for (const row of stageGroups) {
      if (row.currentStageId) stageCountMap.set(row.currentStageId, row._count.id);
    }
    const byStage = pipelineStages.map((stage) => ({
      stageId: stage.id,
      name: stage.name,
      count: stageCountMap.get(stage.id) ?? 0,
    }));

    const terminalCount = terminalApplicationStatuses.reduce(
      (sum, status) => sum + (applicationStatusMap[status] ?? 0),
      0,
    );

    const screeningStatusMap: Record<string, number> = {};
    for (const row of screeningByStatus) {
      screeningStatusMap[row.status] = row._count.id;
    }

    const screeningRecommendationMap: Record<string, number> = {};
    for (const row of screeningByRecommendation) {
      if (row.recommendation) screeningRecommendationMap[row.recommendation] = row._count.id;
    }

    const interviewStatusMap: Record<string, number> = {};
    for (const row of interviewsByStatus) {
      interviewStatusMap[row.status] = row._count.id;
    }

    const interviewResultMap: Record<string, number> = {};
    for (const row of interviewsByResult) {
      interviewResultMap[row.result] = row._count.id;
    }

    const aiInterviewStatusMap: Record<string, number> = {};
    for (const row of aiInterviewsByStatus) {
      aiInterviewStatusMap[row.status] = row._count.id;
    }

    let timeToHireDays: number | null = null;
    let validHiredCount = 0;
    let totalDays = 0;
    for (const application of hiredApplications) {
      if (!application.hiredAt) continue;
      const diff = application.hiredAt.getTime() - application.createdAt.getTime();
      if (diff <= 0) continue;
      totalDays += Math.round(diff / (1000 * 60 * 60 * 24));
      validHiredCount += 1;
    }
    if (validHiredCount > 0) {
      timeToHireDays = Math.round(totalDays / validHiredCount);
    }

    const averageScore = screeningScore._avg.overallScore;

    return {
      jobId: job.id,
      numberOfOpenings: job.numberOfOpenings,
      applications: {
        total: applicationTotal,
        active: applicationTotal - terminalCount,
        byStatus: applicationStatusMap,
        byStage,
      },
      screening: {
        total: screeningTotal,
        completed: screeningStatusMap[AiScreeningStatus.COMPLETED] ?? 0,
        failed: screeningStatusMap[AiScreeningStatus.FAILED] ?? 0,
        pending:
          (screeningStatusMap[AiScreeningStatus.PENDING] ?? 0) +
          (screeningStatusMap[AiScreeningStatus.RUNNING] ?? 0),
        scored: screeningScore._count._all,
        averageScore: averageScore === null ? null : Math.round(averageScore),
        byRecommendation: {
          [AiScreeningRecommendation.SHORTLIST]:
            screeningRecommendationMap[AiScreeningRecommendation.SHORTLIST] ?? 0,
          [AiScreeningRecommendation.NOT_SHORTLIST]:
            screeningRecommendationMap[AiScreeningRecommendation.NOT_SHORTLIST] ?? 0,
          [AiScreeningRecommendation.HUMAN_REVIEW]:
            screeningRecommendationMap[AiScreeningRecommendation.HUMAN_REVIEW] ?? 0,
        },
      },
      interviews: {
        total: interviewTotal,
        upcoming: upcomingInterviews,
        byStatus: interviewStatusMap,
        byResult: interviewResultMap,
      },
      aiInterviews: {
        total: aiInterviewTotal,
        byStatus: aiInterviewStatusMap,
      },
      timeToHireDays,
      generatedAt: new Date().toISOString(),
    };
  }

  async getActivity(companyId: string, jobId: string, query: JobActivityQueryDto) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!job) {
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    return this.jobActivityService.getByJob(companyId, jobId, query);
  }

  async updateRequirements(
    companyId: string,
    jobId: string,
    dto: {
      skills?: Array<{
        skillId: string;
        importance: string;
        minimumYears?: number;
        proficiencyLevel?: string;
        weight?: number;
        notes?: string;
      }>;
      education?: Array<{
        level: string;
        fieldOfStudy?: string;
        importance: string;
        minimumGrade?: string;
        notes?: string;
      }>;
      experience?: Array<{
        title?: string;
        domain?: string;
        minimumYears: number;
        maximumYears?: number;
        importance: string;
        description?: string;
      }>;
      languages?: Array<{
        languageCode: string;
        proficiency: string;
        importance: string;
        interviewAllowed?: boolean;
      }>;
    },
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.skills) {
        await tx.jobSkill.deleteMany({ where: { jobId } });
        for (const skill of dto.skills) {
          const sk = await tx.skill.findFirst({ where: { id: skill.skillId } });
          if (!sk) throw new BadRequestException('JOB_SKILL_INVALID');
          if (!sk.isGlobal && sk.companyId !== companyId)
            throw new BadRequestException('JOB_CROSS_TENANT_ACCESS');
        }
        if (dto.skills.length > 0) {
          await tx.jobSkill.createMany({
            data: dto.skills.map((s) => ({
              jobId,
              skillId: s.skillId,
              importance: s.importance as any,
              minimumYears: s.minimumYears ?? null,
              proficiencyLevel: s.proficiencyLevel ?? null,
              weight: s.weight ?? null,
              notes: s.notes ?? null,
            })),
          });
        }
      }

      if (dto.education) {
        await tx.jobEducationRequirement.deleteMany({ where: { jobId } });
        if (dto.education.length > 0) {
          await tx.jobEducationRequirement.createMany({
            data: dto.education.map((e) => ({
              jobId,
              level: e.level as any,
              fieldOfStudy: e.fieldOfStudy ?? null,
              importance: e.importance as any,
              minimumGrade: e.minimumGrade ?? null,
              notes: e.notes ?? null,
            })),
          });
        }
      }

      if (dto.experience) {
        await tx.jobExperienceRequirement.deleteMany({ where: { jobId } });
        for (const exp of dto.experience) {
          if (exp.maximumYears != null && exp.maximumYears < exp.minimumYears) {
            throw new BadRequestException('JOB_REQUIREMENT_INVALID');
          }
        }
        if (dto.experience.length > 0) {
          await tx.jobExperienceRequirement.createMany({
            data: dto.experience.map((e) => ({
              jobId,
              title: e.title ?? null,
              domain: e.domain ?? null,
              minimumYears: e.minimumYears,
              maximumYears: e.maximumYears ?? null,
              importance: e.importance as any,
              description: e.description ?? null,
            })),
          });
        }
      }

      if (dto.languages) {
        await tx.jobLanguageRequirement.deleteMany({ where: { jobId } });
        if (dto.languages.length > 0) {
          const seen = new Set<string>();
          for (const lang of dto.languages) {
            if (seen.has(lang.languageCode))
              throw new BadRequestException('JOB_REQUIREMENT_INVALID');
            seen.add(lang.languageCode);
            if (lang.languageCode.length !== 2)
              throw new BadRequestException('JOB_REQUIREMENT_INVALID');
          }
          await tx.jobLanguageRequirement.createMany({
            data: dto.languages.map((l) => ({
              jobId,
              languageCode: l.languageCode,
              proficiency: l.proficiency,
              importance: l.importance as any,
              interviewAllowed: l.interviewAllowed ?? true,
            })),
          });
        }
      }

      await tx.job.update({
        where: { id: jobId },
        data: { updatedByMembershipId: membershipId, version: { increment: 1 } },
      });

      await this.jobActivityService.record({
        companyId,
        jobId,
        eventType: JobActivityEventType.JOB_UPDATED,
        description: 'Job requirements updated',
        actorMembershipId: membershipId,
        metadata: {
          changes: {
            skills: dto.skills?.length ?? 0,
            education: dto.education?.length ?? 0,
            experience: dto.experience?.length ?? 0,
            languages: dto.languages?.length ?? 0,
          },
        },
      });

      return this.findById(companyId, jobId);
    });
  }

  async updateScreeningConfig(
    companyId: string,
    jobId: string,
    dto: Record<string, unknown>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const updated = await this.prisma.jobScreeningConfiguration.update({
      where: { jobId },
      data: { ...dto, updatedByMembershipId: membershipId } as any,
    });
    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.SCREENING_CONFIG_UPDATED,
      description: 'Screening configuration updated',
      actorMembershipId: membershipId,
    });
    return updated;
  }

  async addScreeningQuestions(
    companyId: string,
    jobId: string,
    questions: Array<{
      question: string;
      type: string;
      sortOrder?: number;
      [key: string]: unknown;
    }>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const maxSort = await this.prisma.jobScreeningQuestion.aggregate({
      where: { jobId, deletedAt: null },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    const created: Record<string, unknown>[] = [];
    for (const q of questions) {
      const question = await this.prisma.jobScreeningQuestion.create({
        data: {
          jobId,
          question: q.question,
          type: q.type as any,
          description: (q.description as string) ?? null,
          options: q.options ? (q.options as any) : undefined,
          required: (q.required as boolean) ?? true,
          disqualifying: (q.disqualifying as boolean) ?? false,
          expectedAnswer: q.expectedAnswer ? (q.expectedAnswer as any) : undefined,
          minimumScore: (q.minimumScore as number) ?? null,
          maximumScore: (q.maximumScore as number) ?? null,
          weight: (q.weight as number) ?? null,
          sortOrder: q.sortOrder ?? nextSort,
          aiEvaluationAllowed: (q.aiEvaluationAllowed as boolean) ?? false,
        } as any,
      });
      created.push(question);
      nextSort++;
    }
    return created;
  }

  async updateScreeningQuestion(
    companyId: string,
    jobId: string,
    questionId: string,
    dto: Record<string, unknown>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const existing = await this.prisma.jobScreeningQuestion.findFirst({
      where: { id: questionId, jobId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobScreeningQuestion.update({
      where: { id: questionId },
      data: dto as any,
    });
  }

  async deleteScreeningQuestion(
    companyId: string,
    jobId: string,
    questionId: string,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const existing = await this.prisma.jobScreeningQuestion.findFirst({
      where: { id: questionId, jobId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobScreeningQuestion.update({
      where: { id: questionId },
      data: { deletedAt: new Date() },
    });
  }

  async reorderScreeningQuestions(
    companyId: string,
    jobId: string,
    items: Array<{ id: string; sortOrder: number }>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.jobScreeningQuestion.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async updateAccessibility(
    companyId: string,
    jobId: string,
    dto: Record<string, unknown>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    return this.prisma.jobAccessibilityConfiguration.update({
      where: { jobId },
      data: dto as any,
    });
  }

  async updatePipeline(
    companyId: string,
    jobId: string,
    dto: { name?: string; description?: string },
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const updated = await this.prisma.jobPipeline.update({
      where: { jobId },
      data: { ...dto, updatedByMembershipId: membershipId },
    });
    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.PIPELINE_UPDATED,
      description: 'Pipeline updated',
      actorMembershipId: membershipId,
    });
    return updated;
  }

  async addPipelineStage(
    companyId: string,
    jobId: string,
    dto: { name: string; type: string; sortOrder: number; [key: string]: unknown },
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const pipeline = await this.prisma.jobPipeline.findUnique({ where: { jobId } });
    if (!pipeline) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobPipelineStage.create({
      data: {
        pipelineId: pipeline.id,
        name: dto.name,
        type: dto.type as any,
        sortOrder: dto.sortOrder,
        required: (dto.required as boolean) ?? true,
        autoAdvanceEnabled: (dto.autoAdvanceEnabled as boolean) ?? false,
        requiresRecruiterApproval: (dto.requiresRecruiterApproval as boolean) ?? false,
        slaHours: (dto.slaHours as number) ?? null,
        interviewType: (dto.interviewType as string) ?? null,
        assessmentTemplateId: (dto.assessmentTemplateId as string) ?? null,
        configuration: dto.configuration ? (dto.configuration as any) : undefined,
      } as any,
    });
  }

  async updatePipelineStage(
    companyId: string,
    jobId: string,
    stageId: string,
    dto: Record<string, unknown>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const stage = await this.prisma.jobPipelineStage.findFirst({
      where: { id: stageId, deletedAt: null, pipeline: { jobId } },
    });
    if (!stage) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobPipelineStage.update({
      where: { id: stageId },
      data: dto as any,
    });
  }

  async deletePipelineStage(
    companyId: string,
    jobId: string,
    stageId: string,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const stage = await this.prisma.jobPipelineStage.findFirst({
      where: { id: stageId, deletedAt: null, pipeline: { jobId } },
    });
    if (!stage) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobPipelineStage.update({
      where: { id: stageId },
      data: { deletedAt: new Date() },
    });
  }

  async reorderPipelineStages(
    companyId: string,
    jobId: string,
    items: Array<{ id: string; sortOrder: number }>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.jobPipelineStage.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async addCollaborator(
    companyId: string,
    jobId: string,
    dto: {
      membershipId: string;
      type: string;
      canEdit?: boolean;
      canReviewCandidates?: boolean;
      canScheduleInterviews?: boolean;
      canViewSalary?: boolean;
      canPublish?: boolean;
    },
    assignedByMembershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const membership = await this.prisma.companyMembership.findFirst({
      where: { id: dto.membershipId, companyId, status: 'ACTIVE' },
    });
    if (!membership) throw new BadRequestException('JOB_COLLABORATOR_INVALID');

    return this.prisma.jobCollaborator.create({
      data: {
        jobId,
        companyMembershipId: dto.membershipId,
        type: dto.type as any,
        canEdit: dto.canEdit ?? false,
        canReviewCandidates: dto.canReviewCandidates ?? false,
        canScheduleInterviews: dto.canScheduleInterviews ?? false,
        canViewSalary: dto.canViewSalary ?? false,
        canPublish: dto.canPublish ?? false,
        assignedByMembershipId,
      } as any,
    });
  }

  async updateCollaborator(
    companyId: string,
    jobId: string,
    collaboratorId: string,
    dto: Record<string, unknown>,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const collab = await this.prisma.jobCollaborator.findFirst({
      where: { id: collaboratorId, jobId, removedAt: null },
    });
    if (!collab) throw new NotFoundException('JOB_NOT_FOUND');
    return this.prisma.jobCollaborator.update({
      where: { id: collaboratorId },
      data: dto as any,
    });
  }

  async removeCollaborator(
    companyId: string,
    jobId: string,
    collaboratorId: string,
    membershipId: string,
  ) {
    await this.findById(companyId, jobId);
    const collab = await this.prisma.jobCollaborator.findFirst({
      where: { id: collaboratorId, jobId, removedAt: null },
    });
    if (!collab) throw new NotFoundException('JOB_NOT_FOUND');

    const ownerCount = await this.prisma.jobCollaborator.count({
      where: { jobId, type: 'OWNER', removedAt: null },
    });
    if (collab.type === 'OWNER' && ownerCount <= 1) {
      throw new BadRequestException('JOB_FINAL_OWNER_PROTECTED');
    }

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.COLLABORATOR_REMOVED,
      description: 'Collaborator removed',
      actorMembershipId: membershipId,
    });

    return this.prisma.jobCollaborator.update({
      where: { id: collaboratorId },
      data: { removedAt: new Date() },
    });
  }

  async transferOwnership(
    companyId: string,
    jobId: string,
    newOwnerMembershipId: string,
    currentMembershipId: string,
  ) {
    const job = await this.findById(companyId, jobId);
    const newOwner = await this.prisma.companyMembership.findFirst({
      where: { id: newOwnerMembershipId, companyId, status: 'ACTIVE' },
    });
    if (!newOwner) throw new BadRequestException('JOB_OWNER_INVALID');

    return this.prisma.$transaction(async (tx) => {
      await tx.jobCollaborator.updateMany({
        where: { jobId, type: 'OWNER', removedAt: null },
        data: { removedAt: new Date() },
      });

      const existingCollab = await tx.jobCollaborator.findFirst({
        where: { jobId, companyMembershipId: newOwnerMembershipId, removedAt: null },
      });
      if (existingCollab) {
        await tx.jobCollaborator.update({
          where: { id: existingCollab.id },
          data: { type: 'OWNER', removedAt: null },
        });
      } else {
        await tx.jobCollaborator.create({
          data: {
            jobId,
            companyMembershipId: newOwnerMembershipId,
            type: 'OWNER',
            canEdit: true,
            canReviewCandidates: true,
            canScheduleInterviews: true,
            canViewSalary: true,
            canPublish: true,
            assignedByMembershipId: currentMembershipId,
          } as any,
        });
      }

      await tx.job.update({
        where: { id: jobId },
        data: {
          ownerMembershipId: newOwnerMembershipId,
          updatedByMembershipId: currentMembershipId,
        },
      });

      await this.jobActivityService.record({
        companyId,
        jobId,
        eventType: JobActivityEventType.COLLABORATOR_UPDATED,
        description: 'Job ownership transferred',
        actorMembershipId: currentMembershipId,
      });
    });

    return this.findById(companyId, jobId);
  }

  async saveAsTemplate(
    companyId: string,
    jobId: string,
    dto: { name: string; description?: string; category?: string },
    membershipId: string,
  ) {
    const job = await this.findById(companyId, jobId);
    const existing = await this.prisma.jobTemplate.findFirst({
      where: { companyId, name: dto.name, deletedAt: null },
    });
    if (existing) throw new ConflictException('JOB_TEMPLATE_NAME_EXISTS');

    return this.prisma.jobTemplate.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        departmentId: (job as any).departmentId ?? null,
        employmentType: (job as any).employmentType,
        workplaceType: (job as any).workplaceType,
        experienceLevel: (job as any).experienceLevel,
        titleTemplate: job.title,
        descriptionTemplate: (job as any).description ?? '',
        responsibilitiesTemplate: (job as any).responsibilities ?? null,
        qualificationsTemplate: (job as any).qualifications ?? null,
        benefitsTemplate: (job as any).benefits ?? null,
        createdByMembershipId: membershipId,
      } as any,
    });
  }
}
