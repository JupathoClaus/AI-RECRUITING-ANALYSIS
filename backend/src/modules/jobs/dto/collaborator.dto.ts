import { IsOptional, IsString, IsEnum, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobCollaboratorType } from '@prisma/client';

export class AddCollaboratorDto {
  @ApiProperty()
  @IsUUID()
  membershipId: string;

  @ApiProperty({ enum: JobCollaboratorType })
  @IsEnum(JobCollaboratorType)
  type: JobCollaboratorType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canReviewCandidates?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canScheduleInterviews?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canViewSalary?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canPublish?: boolean;
}

export class UpdateCollaboratorDto {
  @ApiPropertyOptional({ enum: JobCollaboratorType })
  @IsOptional()
  @IsEnum(JobCollaboratorType)
  type?: JobCollaboratorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canReviewCandidates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canScheduleInterviews?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewSalary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canPublish?: boolean;
}
