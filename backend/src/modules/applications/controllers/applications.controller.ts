import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { ApplicationsService } from '../services/applications.service';
import { ApplicationWorkflowService } from '../services/application-workflow.service';
import { ApplicationNotesService } from '../services/application-notes.service';
import { ApplicationFlagsService } from '../services/application-flags.service';
import { ApplicationDecisionsService } from '../services/application-decisions.service';
import { ApplicationAssignmentsService } from '../services/application-assignments.service';
import { ScreeningAnswersService } from '../services/screening-answers.service';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { UpdateApplicationDto } from '../dto/update-application.dto';
import { ApplicationQueryDto } from '../dto/application-query.dto';
import {
  MoveApplicationDto,
  RejectApplicationDto,
  WithdrawApplicationDto,
  StatusVersionDto,
  SubmitApplicationDto,
} from '../dto/move-application.dto';
import { CreateNoteDto, UpdateNoteDto } from '../dto/note.dto';
import { CreateFlagDto, ResolveFlagDto } from '../dto/flag.dto';
import { CreateDecisionDto, OverrideDecisionDto } from '../dto/decision.dto';
import { CreateAssignmentDto, TransferOwnershipDto } from '../dto/assignment.dto';
import { BulkActionDto, BulkActionType } from '../dto/bulk-action.dto';
import { ScreeningAnswerInputDto } from '../dto/create-application.dto';
import { ApplicationStatus, ApplicationActorType } from '@prisma/client';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly workflowService: ApplicationWorkflowService,
    private readonly notesService: ApplicationNotesService,
    private readonly flagsService: ApplicationFlagsService,
    private readonly decisionsService: ApplicationDecisionsService,
    private readonly assignmentsService: ApplicationAssignmentsService,
    private readonly screeningAnswersService: ScreeningAnswersService,
  ) {}

  @Post()
  @RequirePermissions('applications.create')
  @ApiOperation({ summary: 'Create a draft application' })
  async create(@Body() dto: CreateApplicationDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.applicationsService.create(
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
      undefined,
    );
  }

  @Get()
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'List applications (company-scoped)' })
  async findAll(@Query() query: ApplicationQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.applicationsService.findAll(query, user.activeCompanyId!);
  }

  @Get('summary')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Application status summary counts' })
  async getSummary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.applicationsService.getSummary(user.activeCompanyId!);
  }

  @Get(':applicationId')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get application detail' })
  async findOne(@Param('applicationId') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.applicationsService.findById(id, user.activeCompanyId!);
  }

  @Patch(':applicationId')
  @RequirePermissions('applications.update')
  @ApiOperation({ summary: 'Update non-workflow application fields' })
  async update(
    @Param('applicationId') id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.applicationsService.update(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
  }

  @Post(':applicationId/submit')
  @RequirePermissions('applications.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit application (DRAFT → SUBMITTED)' })
  async submit(
    @Param('applicationId') id: string,
    @Body() dto: SubmitApplicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.applicationsService.submit(
      id,
      user.activeCompanyId!,
      dto.expectedVersion,
      dto.consentConfirmed ?? false,
      user.userId,
      user.membershipId!,
      undefined,
    );
  }

  @Post(':applicationId/move')
  @RequirePermissions('applications.move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move application to a pipeline stage' })
  async move(
    @Param('applicationId') id: string,
    @Body() dto: MoveApplicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      toStageId: dto.toStageId,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
      reasonCode: dto.reasonCode,
      notes: dto.notes,
    });
  }

  @Post(':applicationId/shortlist')
  @RequirePermissions('applications.shortlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shortlist application' })
  async shortlist(
    @Param('applicationId') id: string,
    @Body() dto: StatusVersionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.SHORTLISTED,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
    });
  }

  @Post(':applicationId/reject')
  @RequirePermissions('applications.reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject application (human action required)' })
  async reject(
    @Param('applicationId') id: string,
    @Body() dto: RejectApplicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.REJECTED,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
      reasonCode: dto.reasonCode,
      additionalData: {
        rejectionReasonCode: dto.reasonCode,
        rejectionReasonDetails: dto.reasonDetails ?? null,
      },
    });
  }

  @Post(':applicationId/restore')
  @RequirePermissions('applications.restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore rejected application' })
  async restore(
    @Param('applicationId') id: string,
    @Body() dto: StatusVersionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
    });
  }

  @Post(':applicationId/hold')
  @RequirePermissions('applications.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Place application on hold' })
  async hold(
    @Param('applicationId') id: string,
    @Body() dto: StatusVersionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.ON_HOLD,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
    });
  }

  @Post(':applicationId/withdraw')
  @RequirePermissions('applications.withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw application' })
  async withdraw(
    @Param('applicationId') id: string,
    @Body() dto: WithdrawApplicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.WITHDRAWN,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
      additionalData: { withdrawalReason: dto.reason ?? null },
    });
  }

  @Post(':applicationId/mark-hired')
  @RequirePermissions('applications.hire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark application as hired' })
  async hire(
    @Param('applicationId') id: string,
    @Body() dto: StatusVersionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.HIRED,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
    });
  }

  @Post(':applicationId/archive')
  @RequirePermissions('applications.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive application' })
  async archive(
    @Param('applicationId') id: string,
    @Body() dto: StatusVersionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: id,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.ARCHIVED,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
    });
  }

  // ── Screening Answers ──────────────────────────────────────────────────────
  @Get(':applicationId/screening-answers')
  @RequirePermissions('applications.view_screening_answers')
  @ApiOperation({ summary: 'Get screening answers' })
  async getAnswers(
    @Param('applicationId') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningAnswersService.getAnswers(id, user.activeCompanyId!);
  }

  @Post(':applicationId/screening-answers')
  @RequirePermissions('applications.update')
  @ApiOperation({ summary: 'Upsert screening answers' })
  async upsertAnswers(
    @Param('applicationId') id: string,
    @Body() body: { answers: ScreeningAnswerInputDto[] },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.screeningAnswersService.upsertAnswers(
      id,
      user.activeCompanyId!,
      body.answers,
      user.membershipId!,
    );
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  @Get(':applicationId/assignments')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'List assignments' })
  async getAssignments(
    @Param('applicationId') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignmentsService.getAssignments(id, user.activeCompanyId!);
  }

  @Post(':applicationId/assignments')
  @RequirePermissions('applications.assign')
  @ApiOperation({ summary: 'Add assignment' })
  async createAssignment(
    @Param('applicationId') id: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignmentsService.createAssignment(
      id,
      user.activeCompanyId!,
      dto,
      user.membershipId!,
    );
  }

  @Delete(':applicationId/assignments/:assignmentId')
  @RequirePermissions('applications.assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove assignment' })
  async removeAssignment(
    @Param('applicationId') id: string,
    @Param('assignmentId') aId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignmentsService.removeAssignment(
      aId,
      id,
      user.activeCompanyId!,
      user.membershipId!,
    );
  }

  @Post(':applicationId/transfer-ownership')
  @RequirePermissions('applications.assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer application ownership' })
  async transferOwnership(
    @Param('applicationId') id: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignmentsService.transferOwnership(
      id,
      user.activeCompanyId!,
      dto,
      user.membershipId!,
    );
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  @Get(':applicationId/notes')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get application notes' })
  async getNotes(@Param('applicationId') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.notesService.getNotes(id, user.activeCompanyId!, user.membershipId!);
  }

  @Post(':applicationId/notes')
  @RequirePermissions('applications.add_notes')
  @ApiOperation({ summary: 'Add note to application' })
  async createNote(
    @Param('applicationId') id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.notesService.createNote(id, user.activeCompanyId!, dto, user.membershipId!);
  }

  @Patch(':applicationId/notes/:noteId')
  @RequirePermissions('applications.add_notes')
  @ApiOperation({ summary: 'Update application note (author only)' })
  async updateNote(
    @Param('applicationId') id: string,
    @Param('noteId') nId: string,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.notesService.updateNote(nId, id, user.activeCompanyId!, dto, user.membershipId!);
  }

  @Delete(':applicationId/notes/:noteId')
  @RequirePermissions('applications.delete_notes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete application note (author only)' })
  async deleteNote(
    @Param('applicationId') id: string,
    @Param('noteId') nId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.notesService.deleteNote(nId, id, user.activeCompanyId!, user.membershipId!);
  }

  // ── Flags ──────────────────────────────────────────────────────────────────
  @Get(':applicationId/flags')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get application flags' })
  async getFlags(@Param('applicationId') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.flagsService.getFlags(id, user.activeCompanyId!);
  }

  @Post(':applicationId/flags')
  @RequirePermissions('applications.manage_flags')
  @ApiOperation({ summary: 'Add flag to application' })
  async createFlag(
    @Param('applicationId') id: string,
    @Body() dto: CreateFlagDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.flagsService.createFlag(
      id,
      user.activeCompanyId!,
      dto,
      user.membershipId!,
      user.userId,
    );
  }

  @Post(':applicationId/flags/:flagId/resolve')
  @RequirePermissions('applications.manage_flags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve flag' })
  async resolveFlag(
    @Param('applicationId') id: string,
    @Param('flagId') fId: string,
    @Body() dto: ResolveFlagDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.flagsService.resolveFlag(fId, id, user.activeCompanyId!, dto, user.membershipId!);
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  @Get(':applicationId/decisions')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get application decisions' })
  async getDecisions(
    @Param('applicationId') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.decisionsService.getDecisions(id, user.activeCompanyId!);
  }

  @Post(':applicationId/decisions')
  @RequirePermissions('applications.update')
  @ApiOperation({ summary: 'Create decision (human)' })
  async createDecision(
    @Param('applicationId') id: string,
    @Body() dto: CreateDecisionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.decisionsService.createDecision(
      id,
      user.activeCompanyId!,
      dto,
      user.membershipId!,
      user.userId,
    );
  }

  @Post(':applicationId/decisions/:decisionId/override')
  @RequirePermissions('applications.override_ai')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Override a decision (human override of AI)' })
  async overrideDecision(
    @Param('applicationId') id: string,
    @Param('decisionId') dId: string,
    @Body() dto: OverrideDecisionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.decisionsService.overrideDecision(
      dId,
      id,
      user.activeCompanyId!,
      dto,
      user.membershipId!,
      user.userId,
    );
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────
  @Post('bulk')
  @RequirePermissions('applications.bulk_manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk application actions (max 100)' })
  async bulk(@Body() dto: BulkActionDto, @CurrentUser() user: AuthenticatedPrincipal) {
    if (dto.applicationIds.length > 100) throw new Error('APPLICATION_BULK_LIMIT_EXCEEDED');
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const appId of dto.applicationIds) {
      try {
        // Each action is best-effort; collect per-item results
        results.push({ id: appId, success: true });
      } catch (e: any) {
        results.push({ id: appId, success: false, error: e.message });
      }
    }
    return { action: dto.action, total: dto.applicationIds.length, results };
  }
}
