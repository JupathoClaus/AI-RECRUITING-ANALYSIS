import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsIn, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TenantMembershipGuard } from '../../auth/guards/tenant-membership.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireTenantAccess } from '../../auth/decorators/tenant-access.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../../auth/interfaces/auth.interface';
import { BulkScreeningService } from '../services/bulk-screening.service';

export class BulkScreeningRequestDto {
  @IsIn(['SELECTED', 'ALL_FOR_JOB', 'UNSCREENED_FOR_JOB', 'ALL_UNSCREENED_OPEN_JOBS'])
  mode!: 'SELECTED' | 'ALL_FOR_JOB' | 'UNSCREENED_FOR_JOB' | 'ALL_UNSCREENED_OPEN_JOBS';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicationIds?: string[];

  @IsOptional()
  @IsUUID('4')
  jobId?: string;
}

@ApiTags('AI Screening')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantMembershipGuard)
@Controller('ai-screenings')
export class BulkScreeningController {
  constructor(private readonly bulkService: BulkScreeningService) {}

  /**
   * POST /ai-screenings/bulk
   *
   * Starts a bulk screening operation. Returns immediately with a batchId.
   * Each application is queued individually via BullMQ — no synchronous model calls.
   *
   * Every application is evaluated against its own job.
   * No cross-application or cross-job state is shared.
   */
  @Post('bulk')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start bulk AI screening',
    description:
      'Queues AI screening for multiple applications. Each is evaluated against its own job. Returns immediately with batchId.',
  })
  async startBulkScreening(
    @Body() dto: BulkScreeningRequestDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.bulkService.startBulk(
      {
        mode: dto.mode,
        applicationIds: dto.applicationIds,
        jobId: dto.jobId,
      },
      user.activeCompanyId!,
      user.userId,
    );
  }

  /**
   * GET /ai-screenings/batches/recent
   *
   * Returns the most recent non-terminal batch for the requesting company
   * (scoped to the initiating user when available). Lets the frontend
   * rediscover an active batch after navigation or a browser reload.
   *
   * NOTE: must be declared BEFORE batches/:batchId so 'recent' is not captured
   * by the UUID parameter route.
   */
  @Get('batches/recent')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get most recent active bulk screening batch' })
  async getRecentBatch(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.bulkService.getRecentBatch(user.activeCompanyId!, user.userId);
  }

  /**
   * GET /ai-screenings/batches/:batchId
   *
   * Returns live progress for a bulk screening batch.
   * Counts are derived from individual AiScreeningBatchItem records and their
   * linked screening results — always authoritative.
   */
  @Get('batches/:batchId')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get bulk screening batch progress' })
  async getBatchProgress(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.bulkService.getBatchProgress(batchId, user.activeCompanyId!);
  }
}
