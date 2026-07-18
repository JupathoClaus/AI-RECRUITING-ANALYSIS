import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { JobPublicationsService } from './job-publications.service';
import { CreatePublicationDto } from './dto/create-publication.dto';

@ApiTags('Job Publications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('jobs/:jobId/publications')
export class JobPublicationsController {
  constructor(private readonly jobPublicationsService: JobPublicationsService) {}

  @Get()
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'List publications for a job' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of job publications' })
  async findByJob(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.jobPublicationsService.findByJob(user.activeCompanyId!, jobId);
  }

  @Post()
  @RequirePermissions('jobs.publish')
  @ApiOperation({ summary: 'Publish a job to a provider' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Job published' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Already published' })
  async publish(
    @Param('jobId') jobId: string,
    @Body() dto: CreatePublicationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobPublicationsService.publish(
      user.activeCompanyId!,
      jobId,
      dto,
      user.membershipId!,
    );
  }

  @Post(':publicationId/retry')
  @RequirePermissions('jobs.publish')
  @ApiOperation({ summary: 'Retry a failed publication' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiParam({ name: 'publicationId', description: 'Publication ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Publication retry initiated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Publication not found' })
  async retry(
    @Param('jobId') jobId: string,
    @Param('publicationId') publicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobPublicationsService.retry(
      user.activeCompanyId!,
      jobId,
      publicationId,
      user.membershipId!,
    );
  }

  @Delete(':publicationId')
  @RequirePermissions('jobs.publish')
  @ApiOperation({ summary: 'Unpublish a job from a provider' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiParam({ name: 'publicationId', description: 'Publication ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Job unpublished' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Publication not found' })
  async unpublish(
    @Param('jobId') jobId: string,
    @Param('publicationId') publicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.jobPublicationsService.unpublish(
      user.activeCompanyId!,
      jobId,
      publicationId,
      user.membershipId!,
    );
  }
}
