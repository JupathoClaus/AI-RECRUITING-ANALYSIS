import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { RequestWithId } from '@common/types/request.types';

import { InvitationsService } from './invitations.service';
import { CreateInvitationDto, AcceptInvitationDto, InvitationQueryDto } from './dto';

@ApiTags('Company Invitations')
@Controller('company/invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new invitation' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Invitation created' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User already a member or pending invitation exists',
  })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.invitationsService.create(user.activeCompanyId!, dto, user.userId, requestId, ip);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invitations' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated list of invitations' })
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: InvitationQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.invitationsService.findAll(user.activeCompanyId!, query);
  }

  @Get(':invitationId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single invitation' })
  @ApiParam({ name: 'invitationId', description: 'Invitation ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invitation details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invitation not found' })
  @HttpCode(HttpStatus.OK)
  async findById(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.invitationsService.findById(user.activeCompanyId!, invitationId);
  }

  @Post(':invitationId/resend')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend invitation email' })
  @ApiParam({ name: 'invitationId', description: 'Invitation ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invitation resent' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invitation not pending or expired' })
  @HttpCode(HttpStatus.OK)
  async resend(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.invitationsService.resend(
      user.activeCompanyId!,
      invitationId,
      user.userId,
      requestId,
      ip,
    );
  }

  @Post(':invitationId/revoke')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation' })
  @ApiParam({ name: 'invitationId', description: 'Invitation ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invitation revoked' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot revoke accepted/expired invitation',
  })
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const requestId = (req as unknown as RequestWithId)?.requestId || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    return this.invitationsService.revoke(
      user.activeCompanyId!,
      invitationId,
      user.userId,
      requestId,
      ip,
    );
  }

  @Get('validate')
  @Public()
  @ApiOperation({ summary: 'Validate an invitation token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Token is valid' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired token' })
  @HttpCode(HttpStatus.OK)
  async validateToken(@Query('token') token: string) {
    return this.invitationsService.validateToken(token);
  }

  @Post('accept')
  @Public()
  @ApiOperation({ summary: 'Accept an invitation' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invitation accepted' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired token, or validation failed',
  })
  @HttpCode(HttpStatus.OK)
  async accept(@Body() dto: AcceptInvitationDto) {
    if (dto.firstName && dto.lastName && dto.password) {
      return this.invitationsService.acceptAsNewUser(dto.token, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
        passwordConfirmation: dto.passwordConfirmation || '',
        timezone: dto.timezone,
        preferredLocale: dto.preferredLocale,
      });
    }

    return { message: 'Authentication required to accept invitation', requiresAuth: true };
  }

  @Post('accept-authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invitation as an authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invitation accepted' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired token' })
  @HttpCode(HttpStatus.OK)
  async acceptAuthenticated(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.invitationsService.acceptExistingUser(dto.token, user.userId);
  }
}
