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
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getOverview(user.activeCompanyId!, dateFrom, dateTo);
  }

  @Get('funnel')
  @RequirePermissions('applications.read')
  async getFunnel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getFunnel(user.activeCompanyId!, dateFrom, dateTo);
  }

  @Get('departments')
  @RequirePermissions('applications.read')
  async getDepartments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getDepartments(user.activeCompanyId!, dateFrom, dateTo);
  }

  @Get('sources')
  @RequirePermissions('applications.read')
  async getSources(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getSources(user.activeCompanyId!, dateFrom, dateTo);
  }

  @Get('time-to-hire')
  @RequirePermissions('applications.read')
  async getTimeToHireTrend(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getTimeToHireTrend(user.activeCompanyId!, dateFrom, dateTo);
  }

  @Get('applications-over-time')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Daily application counts for the last N days (default 14)' })
  async getApplicationsOverTime(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 14;
    return this.analyticsService.getApplicationsOverTime(
      user.activeCompanyId!,
      isNaN(parsedDays) || parsedDays < 1 ? 14 : Math.min(parsedDays, 90),
    );
  }

  @Get('recent-activity')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Recent application audit events for the activity feed' })
  async getRecentActivity(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.analyticsService.getRecentActivity(
      user.activeCompanyId!,
      isNaN(parsedLimit) || parsedLimit < 1 ? 20 : Math.min(parsedLimit, 50),
    );
  }
}
