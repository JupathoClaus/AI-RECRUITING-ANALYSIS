import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions('applications.read')
  async getOverview(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('dateFrom') dateFrom?: string,
  ) {
    return this.analyticsService.getOverview(user.activeCompanyId!, dateFrom);
  }

  @Get('funnel')
  @RequirePermissions('applications.read')
  async getFunnel(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.analyticsService.getFunnel(user.activeCompanyId!);
  }

  @Get('departments')
  @RequirePermissions('applications.read')
  async getDepartments(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.analyticsService.getDepartments(user.activeCompanyId!);
  }

  @Get('sources')
  @RequirePermissions('applications.read')
  async getSources(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.analyticsService.getSources(user.activeCompanyId!);
  }

  @Get('time-to-hire')
  @RequirePermissions('applications.read')
  async getTimeToHireTrend(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.analyticsService.getTimeToHireTrend(user.activeCompanyId!);
  }
}
