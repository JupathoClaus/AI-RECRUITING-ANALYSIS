import {
  Controller,
  Post,
  Get,
  NotFoundException,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import {
  PublicApplicationSubmissionService,
  type PublicSubmissionFile,
} from '../services/public-application-submission.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { PublicApplicationMultipartDto } from '../dto/public-application.dto';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

interface UploadedPublicResume {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('Public Applications')
@Controller('public')
export class PublicApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissionService: PublicApplicationSubmissionService,
  ) {}

  @Post('companies/:companySlug/jobs/:jobSlug/applications')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES } }))
  @ApiOperation({
    summary: 'Public candidate application submission (atomic, CV included)',
    description:
      'Creates or reuses the candidate, creates the application at the initial pipeline stage, stores screening answers and the uploaded CV, and queues resume extraction — all in one idempotent request.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiResponse({
    status: 201,
    description: 'Application submitted — returns public reference and application number only',
  })
  async submitPublic(
    @Param('companySlug') companySlug: string,
    @Param('jobSlug') jobSlug: string,
    @Body() dto: PublicApplicationMultipartDto,
    @UploadedFile() file?: UploadedPublicResume,
  ) {
    const submissionFile: PublicSubmissionFile | undefined = file
      ? { buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype }
      : undefined;

    return this.submissionService.submit(companySlug, jobSlug, dto, submissionFile);
  }

  @Get('applications/:publicReference/status')
  @Public()
  @ApiOperation({ summary: 'Get safe public application status' })
  async getStatus(@Param('publicReference') ref: string) {
    const app = await this.prisma.application.findFirst({
      where: { publicReference: ref },
      select: { status: true, submittedAt: true, jobId: true },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_PUBLIC_REFERENCE_INVALID',
        message: 'Application not found',
      });

    // Safe status mapping — no internal details
    const safeStatus: Record<string, string> = {
      DRAFT: 'received',
      SUBMITTED: 'received',
      UNDER_REVIEW: 'under_review',
      SCREENING: 'under_review',
      SHORTLISTED: 'in_progress',
      ASSESSMENT: 'in_progress',
      INTERVIEW: 'in_progress',
      OFFER: 'in_progress',
      HIRED: 'closed',
      REJECTED: 'closed',
      WITHDRAWN: 'withdrawn',
      DISQUALIFIED: 'closed',
      ON_HOLD: 'under_review',
      ARCHIVED: 'closed',
    };
    return { status: safeStatus[app.status] ?? 'received', submittedAt: app.submittedAt };
  }
}
