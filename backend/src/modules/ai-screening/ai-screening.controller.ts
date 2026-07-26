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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireTenantAccess } from '../auth/decorators/tenant-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../auth/interfaces/auth.interface';
import { AiScreeningService } from './ai-screening.service';
import { RunAiScreeningDto } from './dto/run-ai-screening.dto';
import { ListAiScreeningsQueryDto } from './dto/list-ai-screenings-query.dto';


@ApiTags('AI Screening')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AiScreeningController {
  constructor(private readonly screeningService: AiScreeningService) {}

  @Post('applications/:applicationId/ai-screenings')
  @Roles('COMPANY_ADMIN', 'RECRUITER', 'HR_MANAGER')
  @RequireTenantAccess()
  @ApiOperation({
    summary: 'Request AI screening for an application',
    description: 'Returns 202 if a new screening is queued, 200 if an existing reusable result is returned.',
  })
  @ApiResponse({ status: 200, description: 'Existing reusable screening result' })
  @ApiResponse({ status: 202, description: 'New screening queued' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @ApiResponse({ status: 409, description: 'Conflict (missing resume or job description)' })
  @ApiResponse({ status: 503, description: 'Queue unavailable' })
  async requestScreening(
    @Param('applicationId') applicationId: string,
    @Body() dto: RunAiScreeningDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const result = await this.screeningService.requestScreening(
      applicationId,
      user.activeCompanyId!,
      user.userId,
      dto.forceRerun,
    );

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
}
