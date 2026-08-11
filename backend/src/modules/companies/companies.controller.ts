import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';

import { RequestWithId } from '@common/types/request.types';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { MemberActionDto } from './dto/member-action.dto';

@ApiTags('Company')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('company')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions('company.read')
  @ApiOperation({ summary: 'Get company profile with summary data' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Company profile retrieved' })
  async getProfile(@CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.companiesService.getCompanyProfile(activeCompanyId, membershipId);
  }

  @Patch()
  @RequirePermissions('company.update')
  @ApiOperation({ summary: 'Update company profile fields' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Company profile updated' })
  async updateProfile(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.updateCompany(
      activeCompanyId,
      dto as Record<string, unknown>,
      userId,
      requestId,
      ipAddress,
    );
  }

  @Post('complete-onboarding')
  @RequirePermissions('company.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete company onboarding' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onboarding completed' })
  async completeOnboarding(@CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.companiesService.completeOnboarding(activeCompanyId);
  }

  @Get('settings')
  @RequirePermissions('settings.read')
  @ApiOperation({ summary: 'Get company settings' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Company settings retrieved' })
  async getSettings(@CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.companiesService.getSettings(activeCompanyId);
  }

  @Patch('settings')
  @RequirePermissions('settings.update')
  @ApiOperation({ summary: 'Update company settings' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Company settings updated' })
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.updateSettings(
      activeCompanyId,
      dto as Record<string, unknown>,
      userId,
      membershipId,
      requestId,
      ipAddress,
    );
  }

  @Get('members')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List company members with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'roleId', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Members list retrieved' })
  async getMembers(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('roleId') roleId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const query = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
      roleId,
      departmentId,
      startDate,
      endDate,
    };
    return this.companiesService.getMembersList(activeCompanyId, query);
  }

  @Get('members/:membershipId')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get a single company member' })
  @ApiParam({ name: 'membershipId', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member retrieved' })
  async getMember(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.companiesService.getMember(activeCompanyId, membershipId);
  }

  @Patch('members/:membershipId')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Update a company member' })
  @ApiParam({ name: 'membershipId', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member updated' })
  async updateMember(
    @Param('membershipId') membershipId: string,
    @Body() data: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.companiesService.updateMember(activeCompanyId, membershipId, data);
  }

  @Post('members/:membershipId/suspend')
  @RequirePermissions('users.suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a company member' })
  @ApiParam({ name: 'membershipId', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member suspended' })
  async suspendMember(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.suspendMember(
      activeCompanyId,
      membershipId,
      userId,
      requestId,
      ipAddress,
    );
  }

  @Post('members/:membershipId/reactivate')
  @RequirePermissions('users.suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended company member' })
  @ApiParam({ name: 'membershipId', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member reactivated' })
  async reactivateMember(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.reactivateMember(
      activeCompanyId,
      membershipId,
      userId,
      requestId,
      ipAddress,
    );
  }

  @Delete('members/:membershipId')
  @RequirePermissions('company.manage_members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a company member' })
  @ApiParam({ name: 'membershipId', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Member removed' })
  async removeMember(
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.removeMember(
      activeCompanyId,
      membershipId,
      userId,
      requestId,
      ipAddress,
    );
  }

  @Post('members/bulk')
  @RequirePermissions('company.manage_members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk member operations' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bulk action completed' })
  async bulkMemberAction(
    @Body() dto: MemberActionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, userId } = this.validateTenant(user);
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.companiesService.bulkMemberAction(
      activeCompanyId,
      dto.action,
      dto.membershipIds,
      userId,
      { roleId: dto.roleId, departmentId: dto.departmentId },
      requestId,
      ipAddress,
    );
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'List company roles' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Roles list retrieved' })
  async getRoles(@CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.companiesService.getCompanyRoles(activeCompanyId);
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'List all permissions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Permissions list retrieved' })
  async getPermissions() {
    return this.companiesService.getCompanyPermissions();
  }

  @Get('audit-events')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Get paginated organization audit events' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'actorUserId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Audit events retrieved' })
  async getAuditEvents(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const query = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      eventType,
      entityType,
      entityId,
      actorUserId,
      startDate,
      endDate,
      search,
    };
    return this.companiesService.getAuditEvents(activeCompanyId, query);
  }

  private validateTenant(user: AuthenticatedPrincipal): {
    activeCompanyId: string;
    membershipId: string;
    userId: string;
  } {
    if (!user.activeCompanyId || !user.membershipId) {
      throw new ForbiddenException('No active company context');
    }
    return {
      activeCompanyId: user.activeCompanyId,
      membershipId: user.membershipId,
      userId: user.userId,
    };
  }
}
