import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  IsUUID,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, WorkplaceType, ExperienceLevel, JobVisibility } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty({ example: 'Senior Software Engineer' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty({ enum: EmploymentType, example: 'FULL_TIME' })
  @IsEnum(EmploymentType)
  employmentType: EmploymentType;

  @ApiProperty({ enum: WorkplaceType, example: 'HYBRID' })
  @IsEnum(WorkplaceType)
  workplaceType: WorkplaceType;

  @ApiProperty({ enum: ExperienceLevel, example: 'SENIOR' })
  @IsEnum(ExperienceLevel)
  experienceLevel: ExperienceLevel;

  @ApiPropertyOptional({ enum: JobVisibility, default: 'INTERNAL' })
  @IsOptional()
  @IsEnum(JobVisibility)
  visibility?: JobVisibility;

  @ApiProperty({ example: 'We are looking for a senior engineer...' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibilities?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualifications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benefits?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfOpenings?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryPeriod?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  salaryVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateId?: string;
}
