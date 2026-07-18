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
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { JobTemplatesService } from './job-templates.service';
import { CreateJobTemplateDto } from './dto/create-job-template.dto';
import { UpdateJobTemplateDto } from './dto/update-job-template.dto';
import { JobTemplateQueryDto } from './dto/job-template-query.dto';
import { CreateJobFromTemplateDto } from './dto/create-job-from-template.dto';

@ApiTags('Job Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('jobs.manage_templates')
@Controller('job-templates')
export class JobTemplatesController {
  constructor(private readonly jobTemplatesService: JobTemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job template' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Job template created' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Duplicate template name' })
  async create(@Body() dto: CreateJobTemplateDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.jobTemplatesService.create(user.activeCompanyId!, dto, user.membershipId!);
  }

  @Get()
  @ApiOperation({ summary: 'List job templates with pagination' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated job template list' })
  async findAll(@Query() query: JobTemplateQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.jobTemplatesService.findAll(user.activeCompanyId!, query);
  }

  @Get('system')
  @ApiOperation({ summary: 'List system and company job templates' })
  @ApiResponse({ status: HttpStatus.OK, description: 'System and company templates' })
  async findAllSystem(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.jobTemplatesService.findAllSystem(user.activeCompanyId!);
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get a single job template' })
  @ApiParam({ name: 'templateId', description: 'Job template ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job template details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job template not found' })
  async findById(
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobTemplatesService.findById(user.activeCompanyId!, templateId);
  }

  @Patch(':templateId')
  @ApiOperation({ summary: 'Update a job template' })
  @ApiParam({ name: 'templateId', description: 'Job template ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job template updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job template not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'System template protected' })
  async update(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateJobTemplateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobTemplatesService.update(
      user.activeCompanyId!,
      templateId,
      dto,
      user.membershipId!,
    );
  }

  @Delete(':templateId')
  @ApiOperation({ summary: 'Soft delete a job template' })
  @ApiParam({ name: 'templateId', description: 'Job template ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job template deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job template not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'System template protected' })
  async remove(
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobTemplatesService.softDelete(user.activeCompanyId!, templateId);
  }

  @Post(':templateId/create-job')
  @ApiOperation({ summary: 'Create a job from a template' })
  @ApiParam({ name: 'templateId', description: 'Job template ID' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Job created from template' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job template not found' })
  async createJob(
    @Param('templateId') templateId: string,
    @Body() dto: CreateJobFromTemplateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobTemplatesService.createJob(
      user.activeCompanyId!,
      templateId,
      dto,
      user.membershipId!,
      user.userId,
    );
  }
}
