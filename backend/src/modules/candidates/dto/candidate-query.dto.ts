import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsEnum,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus, CandidateStatus, CandidateSource } from '@prisma/client';

export class CandidateQueryDto {
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

  @ApiPropertyOptional({ enum: CandidateStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(CandidateStatus, { each: true })
  status?: CandidateStatus[];

  @ApiPropertyOptional({ enum: CandidateSource, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CandidateSource, { each: true })
  source?: CandidateSource[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiPropertyOptional({
    description:
      'Filters candidates by the status of their CURRENT (newest active) application; the same application the candidate table displays.',
    enum: ApplicationStatus,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(ApplicationStatus, { each: true })
  applicationStatus?: ApplicationStatus[];

  @ApiPropertyOptional({
    description: 'Minimum company rating (1-5) a candidate must have.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Exact company rating (1-5) a candidate must have.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  exactRating?: number;

  @ApiPropertyOptional({
    description: 'Only candidates without a recorded company rating.',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unrated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languageCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentJobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentEmployer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  willingToRelocate?: boolean;

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
  @IsString()
  updatedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  archived?: boolean;

  @ApiPropertyOptional({
    enum: [
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
      'totalExperienceYears',
      'currentJobTitle',
      'status',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'firstName',
    'lastName',
    'createdAt',
    'updatedAt',
    'totalExperienceYears',
    'currentJobTitle',
    'status',
  ])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
