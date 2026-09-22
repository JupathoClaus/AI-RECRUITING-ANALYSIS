import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { AssessmentStatus, AssessmentAssignmentStatus } from '@prisma/client';
import { AssessmentsService, AssessmentActor } from '../services/assessments.service';
import { AssessmentAssignmentsService } from '../services/assessment-assignments.service';
import { AssessmentEvaluationService } from '../services/assessment-evaluation.service';
import { AssessmentGenerationService } from '../services/assessment-generation.service';
import { AssessmentResultsService } from '../services/assessment-results.service';
import { CreateAssessmentDto, UpdateAssessmentDto } from '../dto/assessment.dto';
import { SaveQuestionsDto, ReorderQuestionsDto } from '../dto/question.dto';
import {
  AssignAssessmentDto,
  BulkAssignAssessmentDto,
  GenerateQuestionsDto,
} from '../dto/assignment.dto';

function actorOf(user: AuthenticatedPrincipal): AssessmentActor {
  return {
    companyId: user.activeCompanyId!,
    userId: user.userId,
    membershipId: user.membershipId!,
  };
}

@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assessments')
export class AssessmentsController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly assignments: AssessmentAssignmentsService,
    private readonly evaluation: AssessmentEvaluationService,
    private readonly generation: AssessmentGenerationService,
    private readonly results: AssessmentResultsService,
  ) {}

  @Post()
  @RequirePermissions('assessments.create')
  @ApiOperation({ summary: 'Create an assessment (starts a v1 draft version)' })
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.assessments.create(dto, actorOf(user), idempotencyKey || undefined);
  }

  @Get()
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'List assessments (company-scoped, paginated)' })
  async list(
    @Query('jobId') jobId: string | undefined,
    @Query('status') status: AssessmentStatus | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.list(user.activeCompanyId!, {
      jobId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'Get assessment with version history' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.assessments.get(id, user.activeCompanyId!);
  }

  @Patch(':id')
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Update assessment container fields' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.update(id, dto, actorOf(user));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Archive an assessment' })
  async archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.assessments.archive(id, actorOf(user));
  }

  @Get(':id/summary')
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'Assessment analytics summary (server aggregates)' })
  async summary(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.assessments.getSummary(id, user.activeCompanyId!);
  }

  @Post(':id/draft-version')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Create a new draft version (copy-on-write from latest)' })
  async draftVersion(@Param('id') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.assessments.createDraftVersion(id, actorOf(user));
  }

  @Post(':id/generate-questions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'AI-draft questions into the draft version (require approval)' })
  async generate(
    @Param('id') id: string,
    @Body() dto: GenerateQuestionsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.generation.generateForAssessment(id, dto, actorOf(user));
  }

  @Get('versions/:versionId')
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'Get version with full question tree (recruiter view)' })
  async getVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.getVersion(versionId, user.activeCompanyId!);
  }

  @Post('versions/:versionId/questions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Replace the draft question set' })
  async saveQuestions(
    @Param('versionId') versionId: string,
    @Body() dto: SaveQuestionsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.saveQuestions(versionId, dto, actorOf(user));
  }

  @Post('versions/:versionId/reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Reorder draft questions' })
  async reorder(
    @Param('versionId') versionId: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.reorder(versionId, dto, actorOf(user));
  }

  @Post('versions/:versionId/validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'Validate a version without publishing' })
  async validate(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.validateVersion(versionId, user.activeCompanyId!);
  }

  @Post('versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.publish')
  @ApiOperation({ summary: 'Validate and publish a version (immutable thereafter)' })
  async publish(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.assessments.publish(versionId, actorOf(user), idempotencyKey || undefined);
  }

  @Post('versions/:versionId/approve-ai')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.update')
  @ApiOperation({ summary: 'Approve AI-generated draft content' })
  async approveAi(
    @Param('versionId') versionId: string,
    @Body() body: { questionIds?: string[] },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assessments.approveAiContent(versionId, body?.questionIds, actorOf(user));
  }

  @Post('versions/:versionId/assignments')
  @RequirePermissions('assessments.assign')
  @ApiOperation({ summary: 'Assign a published version to one application' })
  async assign(
    @Param('versionId') versionId: string,
    @Body() dto: AssignAssessmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignments.assign(versionId, dto, actorOf(user));
  }

  @Post('versions/:versionId/bulk-assignments')
  @RequirePermissions('assessments.assign')
  @ApiOperation({ summary: 'Bulk-assign a published version (asynchronous)' })
  async bulkAssign(
    @Param('versionId') versionId: string,
    @Body() dto: BulkAssignAssessmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignments.bulkAssign(versionId, dto, actorOf(user));
  }

  @Get('bulk-jobs/:jobId')
  @RequirePermissions('assessments.assign')
  @ApiOperation({ summary: 'Bulk assignment job status' })
  async bulkJob(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.assignments.getBulkJob(jobId, user.activeCompanyId!);
  }

  @Get('assignments')
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'List assignments (company-scoped, paginated)' })
  async listAssignments(
    @Query('assessmentId') assessmentId: string | undefined,
    @Query('applicationId') applicationId: string | undefined,
    @Query('status') status: AssessmentAssignmentStatus | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignments.listAssignments(user.activeCompanyId!, {
      assessmentId,
      applicationId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('assignments/:assignmentId/retake')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.assign')
  @ApiOperation({ summary: 'Issue a retake session (honors maxAttempts)' })
  async retake(
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.assignments.createRetake(assignmentId, actorOf(user));
  }

  @Get('sessions/:sessionId/result')
  @RequirePermissions('assessments.review')
  @ApiOperation({ summary: 'Recruiter result review (responses + AI evaluation + score)' })
  async result(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.results.getResult(sessionId, user.activeCompanyId!, actorOf(user));
  }

  @Get('applications/:applicationId/state')
  @RequirePermissions('assessments.read')
  @ApiOperation({ summary: 'Assessment state for the Application Workspace' })
  async applicationState(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.results.getApplicationState(applicationId, user.activeCompanyId!);
  }

  @Post('sessions/:sessionId/retry-evaluation')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assessments.review')
  @ApiOperation({ summary: 'Queue a new evaluation attempt (history preserved)' })
  async retry(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.evaluation.retry(sessionId, user.activeCompanyId!, {
      userId: user.userId,
      membershipId: user.membershipId!,
    });
  }
}
