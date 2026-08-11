import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { AiInterviewsService } from '../services/ai-interviews.service';
import { CreateAiInterviewDto } from '../dto/create-ai-interview.dto';
import { SendInvitationDto } from '../dto/send-invitation.dto';

@ApiTags('AI Interviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai-interviews')
export class AiInterviewsController {
  constructor(private readonly aiInterviewsService: AiInterviewsService) {}

  @Post()
  @RequirePermissions('interviews.create')
  @ApiOperation({ summary: 'Create an AI interview for an application' })
  async create(@Body() dto: CreateAiInterviewDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.create(dto, user.activeCompanyId!, user.membershipId!);
  }

  @Get()
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'List AI interviews for the active company' })
  async findAll(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.findAll(user.activeCompanyId!);
  }

  @Get(':id')
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'Get AI interview by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.findById(id, user.activeCompanyId!);
  }

  @Get('by-application/:applicationId')
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'Get AI interviews for an application' })
  async findByApplication(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.aiInterviewsService.findByApplication(applicationId, user.activeCompanyId!);
  }

  @Get(':id/preview')
  @RequirePermissions('interviews.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview interview invitation details' })
  async previewInvitation(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.previewInvitation(id, user.activeCompanyId!);
  }

  @Post(':id/regenerate-code')
  @RequirePermissions('interviews.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate interview code' })
  async regenerateCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.regenerateCode(id, user.activeCompanyId!);
  }

  @Post(':id/send')
  @RequirePermissions('interviews.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send interview invitation email' })
  async sendInvitation(
    @Param('id') id: string,
    @Body() dto: SendInvitationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.aiInterviewsService.sendInvitation(id, dto, user.activeCompanyId!);
  }

  @Post(':id/cancel')
  @RequirePermissions('interviews.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel AI interview' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.aiInterviewsService.cancel(id, user.activeCompanyId!);
  }
}
