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
import { PrismaService } from '@database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { IsUUID, IsInt, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ApplicationWorkflowService } from '@modules/applications/services/application-workflow.service';
import { ApplicationActorType, ApplicationStatus } from '@prisma/client';

class PipelineMoveDto {
  @ApiProperty() @IsUUID() applicationId: string;
  @ApiProperty() @IsUUID() fromStageId: string;
  @ApiProperty() @IsUUID() toStageId: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reasonCode?: string;
}

@ApiTags('Pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: ApplicationWorkflowService,
  ) {}

  @Get('jobs/:jobId')
  @RequirePermissions('pipeline.read')
  @ApiOperation({ summary: 'Get pipeline board — applications grouped by stage' })
  async getBoard(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    const companyId = user.activeCompanyId!;

    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      include: {
        pipeline: {
          include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    const applications = await this.prisma.application.findMany({
      where: {
        jobId,
        companyId,
        deletedAt: null,
        status: { notIn: [ApplicationStatus.ARCHIVED, ApplicationStatus.WITHDRAWN] },
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, headline: true } },
        companyCandidate: {
          include: {
            tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
          },
        },
        assignments: {
          where: { removedAt: null, type: 'OWNER' },
          include: {
            membership: {
              select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
        flags: { where: { resolved: false }, select: { id: true, type: true, severity: true } },
      },
    });

    // Group by currentStageId
    const stageMap = new Map<string | null, typeof applications>();
    for (const app of applications) {
      const key = app.currentStageId;
      if (!stageMap.has(key)) stageMap.set(key, []);
      stageMap.get(key)!.push(app);
    }

    const stages = (job.pipeline?.stages ?? []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      type: stage.type,
      sortOrder: stage.sortOrder,
      applications: (stageMap.get(stage.id) ?? []).map((app) => ({
        id: app.id,
        applicationNumber: app.applicationNumber,
        status: app.status,
        submittedAt: app.submittedAt,
        version: app.version,
        candidate: app.candidate
          ? {
              id: app.candidate.id,
              displayName: `${app.candidate.firstName} ${app.candidate.lastName}`,
              headline: app.candidate.headline,
            }
          : null,
        owner: app.assignments[0]?.membership ?? null,
        tags: (app.companyCandidate?.tags ?? []).map((t: any) => ({
          id: t.id,
          name: t.tag?.name,
          color: t.tag?.color,
        })),
        flags: app.flags,
      })),
    }));

    return {
      jobId,
      pipeline: job.pipeline ? { id: job.pipeline.id, name: job.pipeline.name } : null,
      stages,
    };
  }

  @Post('jobs/:jobId/move')
  @RequirePermissions('applications.move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move application on pipeline board' })
  async moveApplication(
    @Param('jobId') jobId: string,
    @Body() dto: PipelineMoveDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.workflowService.transition({
      applicationId: dto.applicationId,
      companyId: user.activeCompanyId!,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      toStageId: dto.toStageId,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: user.userId,
      actorMembershipId: user.membershipId!,
      expectedVersion: dto.expectedVersion,
      reasonCode: dto.reasonCode,
    });
  }
}
