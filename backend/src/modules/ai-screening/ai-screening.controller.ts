import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantMembershipGuard } from '../auth/guards/tenant-membership.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireTenantAccess } from '../auth/decorators/tenant-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../auth/interfaces/auth.interface';
import { AiScreeningService } from './ai-screening.service';
import { RunAiScreeningDto } from './dto/run-ai-screening.dto';
import { ListAiScreeningsQueryDto } from './dto/list-ai-screenings-query.dto';

@ApiTags('AI Screening')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantMembershipGuard)
@Controller()
export class AiScreeningController {
  constructor(private readonly screeningService: AiScreeningService) {}

  @Post('applications/:applicationId/ai-screenings')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @ApiOperation({
    summary: 'Request AI screening for an application',
    description:
      'Returns 202 if a new screening is queued, 200 if an existing reusable result is returned.',
  })
  @ApiResponse({ status: 200, description: 'Existing reusable screening result' })
  @ApiResponse({ status: 202, description: 'New screening queued' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict (extraction pending/missing resume/job description)',
  })
  @ApiResponse({ status: 503, description: 'Queue unavailable' })
  async requestScreening(
    @Param('applicationId') applicationId: string,
    @Body() dto: RunAiScreeningDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.screeningService.requestScreening(
      applicationId,
      user.activeCompanyId!,
      user.userId,
      dto.forceRerun,
    );

    res.status(result.action === 'CREATED' ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return result;
  }

  @Get('applications/:applicationId/ai-screenings')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List screening attempts for an application' })
  async listScreenings(
    @Param('applicationId') applicationId: string,
    @Query() query: ListAiScreeningsQueryDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.listScreenings(
      applicationId,
      user.activeCompanyId!,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('applications/:applicationId/ai-screenings/latest')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the latest screening result for an application' })
  async getLatestScreening(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.getLatestScreening(applicationId, user.activeCompanyId!);
  }

  @Get('ai-screenings/:screeningId')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a specific screening result by ID' })
  async getScreening(
    @Param('screeningId') screeningId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.getScreening(screeningId, user.activeCompanyId!);
  }

  @Get('applications/:applicationId/resume-extraction')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get resume extraction status for an application',
    description: 'Pure read-only query. Never creates records or enqueues jobs.',
  })
  @ApiResponse({ status: 200, description: 'Extraction status' })
  @ApiResponse({ status: 404, description: 'Application or extraction not found' })
  async getExtractionStatus(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.getExtractionStatus(applicationId, user.activeCompanyId!);
  }

  @Post('applications/:applicationId/ai-screenings/retry-extraction')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry resume extraction for an application after failure' })
  @ApiResponse({ status: 200, description: 'Extraction retry initiated' })
  @ApiResponse({ status: 409, description: 'Retry limit reached or no resume file' })
  async retryExtraction(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.retryExtraction(applicationId, user.activeCompanyId!, user.userId);
  }
}
