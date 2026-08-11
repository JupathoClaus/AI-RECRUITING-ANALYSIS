import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobStatus, JobVisibility, Prisma } from '@prisma/client';
import { toPublicJobResponse } from './mappers/job.mapper';

@ApiTags('Public Jobs')
@Controller('public/companies')
export class PublicJobsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':companySlug/jobs')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'List published jobs for a company (public)' })
  @ApiParam({ name: 'companySlug' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Public job list' })
  async findPublished(
    @Param('companySlug') companySlug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { slug: companySlug, status: 'ACTIVE', deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const take = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const skip = (Math.max(parseInt(page || '1', 10), 1) - 1) * take;

    const where: Prisma.JobWhereInput = {
      companyId: company.id,
      status: JobStatus.PUBLISHED,
      visibility: { in: [JobVisibility.PUBLIC, JobVisibility.UNLISTED] },
      deletedAt: null,
      archivedAt: null,
      OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
    };

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: { publishedAt: 'desc' },
        include: {
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true, city: true, countryCode: true } },
          accessibilityConfig: {
            select: {
              accommodationsSupported: true,
              remoteAccommodationAvailable: true,
              signLanguageInterpreterAvailable: true,
              alternativeInterviewFormatAvailable: true,
              screenReaderCompatibleAssessmentRequired: true,
            },
          },
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: data.map((job) => toPublicJobResponse(job as unknown as Record<string, unknown>)),
      meta: {
        total,
        page: Math.max(parseInt(page || '1', 10), 1),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  @Get(':companySlug/jobs/:jobSlug')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get a single published job (public)' })
  @ApiParam({ name: 'companySlug' })
  @ApiParam({ name: 'jobSlug' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Public job detail' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job not found' })
  async findBySlug(@Param('companySlug') companySlug: string, @Param('jobSlug') jobSlug: string) {
    const company = await this.prisma.company.findFirst({
      where: { slug: companySlug, status: 'ACTIVE', deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const job = await this.prisma.job.findFirst({
      where: {
        companyId: company.id,
        slug: jobSlug,
        status: JobStatus.PUBLISHED,
        visibility: { in: [JobVisibility.PUBLIC, JobVisibility.UNLISTED] },
        deletedAt: null,
        archivedAt: null,
        OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
      },
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, city: true, countryCode: true } },
        accessibilityConfig: {
          select: {
            accommodationsSupported: true,
            remoteAccommodationAvailable: true,
            signLanguageInterpreterAvailable: true,
            alternativeInterviewFormatAvailable: true,
            screenReaderCompatibleAssessmentRequired: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return toPublicJobResponse(job as unknown as Record<string, unknown>);
  }
}
