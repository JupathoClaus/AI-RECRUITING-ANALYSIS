import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { AiScreeningService } from './ai-screening.service';
import { RunScreeningDto } from './dto/run-screening.dto';
import { ListScreeningResultsQueryDto } from './dto/list-screening-results-query.dto';

@ApiTags('AI Screening')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai-screenings')
export class AiScreeningController {
  constructor(private readonly screeningService: AiScreeningService) {}

  @Post('applications/:applicationId')
  @RequirePermissions('applications.screen')
  @ApiOperation({ summary: 'Run AI screening for an application' })
  @ApiResponse({ status: 201, description: 'Screening completed' })
  @ApiResponse({ status: 400, description: 'Insufficient job or resume data' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async runScreening(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() _dto: RunScreeningDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const result = await this.screeningService.runScreening(
      applicationId,
      user.activeCompanyId!,
      user.userId,
      undefined,
    );
    return { statusCode: HttpStatus.CREATED, data: result };
  }

  @Get('applications/:applicationId')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'List screening results for an application' })
  async listByApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Query() query: ListScreeningResultsQueryDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.findByApplication(
      applicationId,
      user.activeCompanyId!,
      query.page,
      query.limit,
    );
  }

  @Get('applications/:applicationId/latest')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get latest screening result for an application' })
  async getLatest(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.findLatest(applicationId, user.activeCompanyId!);
  }

  @Get(':screeningId')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get a specific screening result by ID' })
  async getById(
    @Param('screeningId', ParseUUIDPipe) screeningId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningService.findById(screeningId, user.activeCompanyId!);
  }
}
