import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
import { JobsService } from './jobs.service';
import { JobWorkflowService } from './job-workflow.service';
import { JobActivityService } from './job-activity.service';
import { ScreeningEthicsValidator } from './validators/screening-ethics.validator';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { DuplicateJobDto } from './dto/duplicate-job.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { CreateScreeningQuestionDto } from './dto/create-screening-question.dto';
import { UpdateScreeningQuestionDto } from './dto/update-screening-question.dto';
import { UpdateScreeningConfigDto } from './dto/update-screening-config.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { UpdateAccessibilityDto } from './dto/update-accessibility.dto';
import { UpdateRequirementsDto } from './dto/update-requirements.dto';
import { AddCollaboratorDto, UpdateCollaboratorDto } from './dto/collaborator.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import {
  UpdatePipelineDto,
  CreatePipelineStageDto,
  UpdatePipelineStageDto,
  ReorderStagesDto,
} from './dto/pipeline.dto';
import { SubmitApprovalDto } from './dto/submit-approval.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';
import { SchedulePublicationDto } from './dto/schedule-publication.dto';
import { Prisma, JobActivityEventType } from '@prisma/client';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobWorkflowService: JobWorkflowService,
    private readonly jobActivityService: JobActivityService,
    private readonly screeningEthicsValidator: ScreeningEthicsValidator,
  ) {}

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

  private extractRequestMetadata(req: Request): { requestId: string; ipAddress: string } {
    return {
      requestId: (req as unknown as RequestWithId)?.requestId || '',
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    };
  }

  @Post()
  @RequirePermissions('jobs.create')
  @ApiOperation({ summary: 'Create a new job draft' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Job draft created' })
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    return this.jobsService.create(activeCompanyId, dto, membershipId, userId);
  }

  @Get()
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'List jobs with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated job list' })
  async findAll(@Query() query: JobQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.jobsService.findAll(activeCompanyId, query as any);
  }

  @Get('summary')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get recruiter dashboard job summary' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job summary aggregates' })
  async getSummary(@CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.jobsService.getSummary(activeCompanyId);
  }

  @Get(':jobId')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get a single job with full details' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'JOB_NOT_FOUND' })
  async findById(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.jobsService.findById(activeCompanyId, jobId);
  }

  @Patch(':jobId')
  @RequirePermissions('jobs.update')
  @ApiOperation({ summary: 'Update a job with optimistic version control' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job updated' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'JOB_STALE_VERSION' })
  async update(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    return this.jobsService.update(activeCompanyId, jobId, dto as any, membershipId, userId);
  }

  @Post(':jobId/duplicate')
  @RequirePermissions('jobs.create')
  @ApiOperation({ summary: 'Duplicate a job' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Job duplicated' })
  async duplicate(
    @Param('jobId') jobId: string,
    @Body() dto: DuplicateJobDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.duplicate(activeCompanyId, jobId, dto as any, membershipId);
  }

  @Delete(':jobId')
  @RequirePermissions('jobs.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a draft job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job deleted' })
  async remove(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    return this.jobsService.softDelete(activeCompanyId, jobId);
  }

  @Post(':jobId/archive')
  @RequirePermissions('jobs.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job archived' })
  async archive(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.archive(activeCompanyId, jobId, membershipId);
  }

  @Post(':jobId/restore')
  @RequirePermissions('jobs.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived job to draft' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job restored to draft' })
  async restore(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.restore(activeCompanyId, jobId, membershipId);
  }

  @Post(':jobId/submit-for-approval')
  @RequirePermissions('jobs.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit job for approval' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job submitted for approval' })
  async submitForApproval(
    @Param('jobId') jobId: string,
    @Body() dto: SubmitApprovalDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.submitForApproval(
      activeCompanyId,
      jobId,
      dto.approverMembershipId || membershipId,
      membershipId,
      userId,
      dto.message,
      requestId,
    );
  }

  @Post(':jobId/approve')
  @RequirePermissions('jobs.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job approved' })
  async approve(
    @Param('jobId') jobId: string,
    @Body() dto: ReviewApprovalDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.approve(
      activeCompanyId,
      jobId,
      membershipId,
      userId,
      dto.reviewNotes,
      requestId,
    );
  }

  @Post(':jobId/reject')
  @RequirePermissions('jobs.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job rejected' })
  async reject(
    @Param('jobId') jobId: string,
    @Body() dto: ReviewApprovalDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.reject(
      activeCompanyId,
      jobId,
      membershipId,
      userId,
      dto.reviewNotes,
      requestId,
    );
  }

  @Post(':jobId/request-changes')
  @RequirePermissions('jobs.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request changes to a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Changes requested' })
  async requestChanges(
    @Param('jobId') jobId: string,
    @Body() dto: ReviewApprovalDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.requestChanges(
      activeCompanyId,
      jobId,
      membershipId,
      userId,
      dto.reviewNotes,
      requestId,
    );
  }

  @Post(':jobId/publish')
  @RequirePermissions('jobs.publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job publish initiated' })
  async publish(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.publish(activeCompanyId, jobId, membershipId, userId, requestId);
  }

  @Post(':jobId/schedule-publication')
  @RequirePermissions('jobs.publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule job publication' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Publication scheduled' })
  async schedulePublish(
    @Param('jobId') jobId: string,
    @Body() dto: SchedulePublicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.schedulePublish(
      activeCompanyId,
      jobId,
      new Date(dto.scheduledAt),
      membershipId,
      userId,
      requestId,
    );
  }

  @Post(':jobId/pause')
  @RequirePermissions('jobs.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a published job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job paused' })
  async pause(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'PAUSED' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Post(':jobId/resume')
  @RequirePermissions('jobs.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job resumed' })
  async resume(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'PUBLISHED' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Post(':jobId/close')
  @RequirePermissions('jobs.close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job closed' })
  async close(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'CLOSED' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Post(':jobId/mark-filled')
  @RequirePermissions('jobs.close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark job as filled' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job marked as filled' })
  async markFilled(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'FILLED' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Post(':jobId/cancel')
  @RequirePermissions('jobs.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job cancelled' })
  async cancel(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'CANCELLED' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Post(':jobId/reopen')
  @RequirePermissions('jobs.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a closed or cancelled job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job reopened' })
  async reopen(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const { activeCompanyId, membershipId, userId } = this.validateTenant(user);
    const { requestId } = this.extractRequestMetadata(req);
    return this.jobWorkflowService.transition(
      activeCompanyId,
      jobId,
      'DRAFT' as any,
      membershipId,
      userId,
      { requestId },
    );
  }

  @Get(':jobId/requirements')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get job requirements' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job requirements' })
  async getRequirements(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const job = await this.jobsService.findById(activeCompanyId, jobId);
    return {
      skills: job.skills,
      education: job.educationRequirements,
      experience: job.experienceRequirements,
      languages: job.languageRequirements,
    };
  }

  @Put(':jobId/requirements')
  @RequirePermissions('jobs.update')
  @ApiOperation({ summary: 'Replace job requirements transactionally' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Requirements updated' })
  async updateRequirements(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateRequirementsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updateRequirements(activeCompanyId, jobId, dto, membershipId);
  }

  @Get(':jobId/screening')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get job screening configuration and questions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Screening config' })
  async getScreening(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    const job = await this.jobsService.findById(activeCompanyId, jobId);
    return {
      config: job.screeningConfig,
      questions: job.screeningQuestions,
    };
  }

  @Patch(':jobId/screening')
  @RequirePermissions('jobs.manage_screening')
  @ApiOperation({ summary: 'Update screening configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Screening config updated' })
  async updateScreeningConfig(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateScreeningConfigDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updateScreeningConfig(activeCompanyId, jobId, dto as any, membershipId);
  }

  @Post(':jobId/screening/questions')
  @RequirePermissions('jobs.manage_screening')
  @ApiOperation({ summary: 'Add screening questions' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Questions added' })
  async addScreeningQuestions(
    @Param('jobId') jobId: string,
    @Body() dto: { questions: CreateScreeningQuestionDto[] },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    const result = this.screeningEthicsValidator.validateProhibitedCriteria(dto.questions);
    const questions = await this.jobsService.addScreeningQuestions(
      activeCompanyId,
      jobId,
      dto.questions as any,
      membershipId,
    );
    if (result.warnings.length > 0) {
      return { warnings: result.warnings, questions };
    }
    return questions;
  }

  @Patch(':jobId/screening/questions/:questionId')
  @RequirePermissions('jobs.manage_screening')
  @ApiOperation({ summary: 'Update a screening question' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Question updated' })
  async updateScreeningQuestion(
    @Param('jobId') jobId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateScreeningQuestionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updateScreeningQuestion(
      activeCompanyId,
      jobId,
      questionId,
      dto as any,
      membershipId,
    );
  }

  @Delete(':jobId/screening/questions/:questionId')
  @RequirePermissions('jobs.manage_screening')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a screening question' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Question deleted' })
  async deleteScreeningQuestion(
    @Param('jobId') jobId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.deleteScreeningQuestion(
      activeCompanyId,
      jobId,
      questionId,
      membershipId,
    );
  }

  @Post(':jobId/screening/questions/reorder')
  @RequirePermissions('jobs.manage_screening')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder screening questions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Questions reordered' })
  async reorderScreeningQuestions(
    @Param('jobId') jobId: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.reorderScreeningQuestions(
      activeCompanyId,
      jobId,
      dto.items,
      membershipId,
    );
  }

  @Get(':jobId/accessibility')
  @RequirePermissions('jobs.manage_screening')
  @ApiOperation({ summary: 'Get job accessibility configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Accessibility config' })
  async getAccessibility(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const job = await this.jobsService.findById(activeCompanyId, jobId);
    return job.accessibilityConfig;
  }

  @Patch(':jobId/accessibility')
  @RequirePermissions('jobs.manage_screening')
  @ApiOperation({ summary: 'Update accessibility configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Accessibility updated' })
  async updateAccessibility(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateAccessibilityDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updateAccessibility(activeCompanyId, jobId, dto as any, membershipId);
  }

  @Get(':jobId/pipeline')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get job pipeline with stages' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Pipeline with stages' })
  async getPipeline(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const { activeCompanyId } = this.validateTenant(user);
    const job = await this.jobsService.findById(activeCompanyId, jobId);
    return job.pipeline;
  }

  @Put(':jobId/pipeline')
  @RequirePermissions('jobs.manage_pipeline')
  @ApiOperation({ summary: 'Update pipeline details' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Pipeline updated' })
  async updatePipeline(
    @Param('jobId') jobId: string,
    @Body() dto: UpdatePipelineDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updatePipeline(activeCompanyId, jobId, dto, membershipId);
  }

  @Post(':jobId/pipeline/stages')
  @RequirePermissions('jobs.manage_pipeline')
  @ApiOperation({ summary: 'Add pipeline stage' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Stage added' })
  async addPipelineStage(
    @Param('jobId') jobId: string,
    @Body() dto: CreatePipelineStageDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.addPipelineStage(activeCompanyId, jobId, dto as any, membershipId);
  }

  @Patch(':jobId/pipeline/stages/:stageId')
  @RequirePermissions('jobs.manage_pipeline')
  @ApiOperation({ summary: 'Update pipeline stage' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stage updated' })
  async updatePipelineStage(
    @Param('jobId') jobId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdatePipelineStageDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updatePipelineStage(
      activeCompanyId,
      jobId,
      stageId,
      dto as any,
      membershipId,
    );
  }

  @Delete(':jobId/pipeline/stages/:stageId')
  @RequirePermissions('jobs.manage_pipeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete pipeline stage' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stage deleted' })
  async deletePipelineStage(
    @Param('jobId') jobId: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.deletePipelineStage(activeCompanyId, jobId, stageId, membershipId);
  }

  @Post(':jobId/pipeline/reorder')
  @RequirePermissions('jobs.manage_pipeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder pipeline stages' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stages reordered' })
  async reorderPipelineStages(
    @Param('jobId') jobId: string,
    @Body() dto: ReorderStagesDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.reorderPipelineStages(activeCompanyId, jobId, dto.items, membershipId);
  }

  @Get(':jobId/collaborators')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get job collaborators' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collaborator list' })
  async getCollaborators(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const job = await this.jobsService.findById(activeCompanyId, jobId);
    return job.collaborators;
  }

  @Post(':jobId/collaborators')
  @RequirePermissions('jobs.manage_collaborators')
  @ApiOperation({ summary: 'Add collaborator to job' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Collaborator added' })
  async addCollaborator(
    @Param('jobId') jobId: string,
    @Body() dto: AddCollaboratorDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.addCollaborator(activeCompanyId, jobId, dto, membershipId);
  }

  @Patch(':jobId/collaborators/:collaboratorId')
  @RequirePermissions('jobs.manage_collaborators')
  @ApiOperation({ summary: 'Update collaborator permissions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collaborator updated' })
  async updateCollaborator(
    @Param('jobId') jobId: string,
    @Param('collaboratorId') collaboratorId: string,
    @Body() dto: UpdateCollaboratorDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.updateCollaborator(
      activeCompanyId,
      jobId,
      collaboratorId,
      dto as any,
      membershipId,
    );
  }

  @Delete(':jobId/collaborators/:collaboratorId')
  @RequirePermissions('jobs.manage_collaborators')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove collaborator from job' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collaborator removed' })
  async removeCollaborator(
    @Param('jobId') jobId: string,
    @Param('collaboratorId') collaboratorId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.removeCollaborator(
      activeCompanyId,
      jobId,
      collaboratorId,
      membershipId,
    );
  }

  @Post(':jobId/transfer-ownership')
  @RequirePermissions('jobs.manage_collaborators')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer job ownership' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ownership transferred' })
  async transferOwnership(
    @Param('jobId') jobId: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.transferOwnership(
      activeCompanyId,
      jobId,
      dto.newOwnerMembershipId,
      membershipId,
    );
  }

  @Get(':jobId/activity')
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'Get job activity history' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Activity events' })
  async getActivity(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
    @Query('actorMembershipId') actorMembershipId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const { activeCompanyId } = this.validateTenant(user);
    const query = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      eventType: eventType as JobActivityEventType | undefined,
      actorMembershipId,
      dateFrom,
      dateTo,
    };
    return this.jobActivityService.getByJob(activeCompanyId, jobId, query as any);
  }

  @Post(':jobId/save-as-template')
  @RequirePermissions('jobs.manage_templates')
  @ApiOperation({ summary: 'Save job as template' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Template created from job' })
  async saveAsTemplate(
    @Param('jobId') jobId: string,
    @Body() dto: { name: string; description?: string; category?: string },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const { activeCompanyId, membershipId } = this.validateTenant(user);
    return this.jobsService.saveAsTemplate(activeCompanyId, jobId, dto, membershipId);
  }
}
