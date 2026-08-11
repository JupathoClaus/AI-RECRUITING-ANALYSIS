import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsUUID,
  IsEnum,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  JobStatus,
  EmploymentType,
  WorkplaceType,
  ExperienceLevel,
  JobVisibility,
  JobApprovalStatus,
  JobPublicationStatus,
} from '@prisma/client';

export class JobQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: JobStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(JobStatus, { each: true })
  status?: JobStatus[];

  @ApiPropertyOptional({ isArray: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  departmentId?: string[];

  @ApiPropertyOptional({ isArray: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  locationId?: string[];

  @ApiPropertyOptional({ enum: EmploymentType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(EmploymentType, { each: true })
  employmentType?: EmploymentType[];

  @ApiPropertyOptional({ enum: WorkplaceType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(WorkplaceType, { each: true })
  workplaceType?: WorkplaceType[];

  @ApiPropertyOptional({ enum: ExperienceLevel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ExperienceLevel, { each: true })
  experienceLevel?: ExperienceLevel[];

  @ApiPropertyOptional({ enum: JobVisibility, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(JobVisibility, { each: true })
  visibility?: JobVisibility[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  collaboratorMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  createdByMembershipId?: string;

  @ApiPropertyOptional({ enum: JobApprovalStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(JobApprovalStatus, { each: true })
  approvalStatus?: JobApprovalStatus[];

  @ApiPropertyOptional({ enum: JobPublicationStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(JobPublicationStatus, { each: true })
  publicationStatus?: JobPublicationStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicationDeadlineFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicationDeadlineTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSalary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishedOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    enum: ['title', 'createdAt', 'updatedAt', 'publishedAt', 'applicationDeadline', 'status'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['title', 'createdAt', 'updatedAt', 'publishedAt', 'applicationDeadline', 'status'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
