import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { RecruiterCandidateWorkflowDto } from './dto/recruiter-candidate-workflow.dto';
import { RecruiterCandidateWorkflowService } from './recruiter-candidate-workflow.service';

interface UploadedResumeFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * POST /candidates/recruiter-workflow
 *
 * The recruiter "Add Candidate" submission. One atomic, idempotent request
 * that creates (or reuses) the candidate, creates the application, stores the
 * resume, links the file to the application and queues resume extraction.
 *
 * Failure before the database commit leaves NOTHING behind; failure after
 * commit (e.g. lost response) is safe to retry with the same Idempotency-Key.
 */
@ApiTags('Candidates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('candidates')
export class RecruiterCandidateWorkflowController {
  constructor(private readonly workflowService: RecruiterCandidateWorkflowService) {}

  @Post('recruiter-workflow')
  @RequirePermissions('candidates.create', 'applications.create')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add candidate + application + resume in one atomic workflow',
    description:
      'Creates or reuses the candidate, creates the application for the job, stores the resume, links it and queues resume extraction. Idempotent under the Idempotency-Key header.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['firstName', 'lastName', 'email', 'jobId', 'file'],
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        totalExperienceYears: { type: 'number' },
        jobId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async createWithApplication(
    @Body() dto: RecruiterCandidateWorkflowDto,
    @UploadedFile() file: UploadedResumeFile | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!user.activeCompanyId) {
      throw new UnauthorizedException('No active company for this user');
    }
    return this.workflowService.create(
      dto,
      user.activeCompanyId,
      user.userId,
      user.membershipId ?? '',
      file
        ? { buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype }
        : undefined,
      idempotencyKey || undefined,
    );
  }
}
