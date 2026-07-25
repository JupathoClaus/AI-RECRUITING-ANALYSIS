import { IsOptional, IsArray, IsEnum, IsInt, Min, Max, ArrayMaxSize, IsUUID } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';
import { IsDateOnly } from '../../../common/validation/is-date-only.decorator';

export class ReportFilterDto {
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string;

  @IsOptional()
  @IsDateOnly()
  dateTo?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  jobIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(ApplicationStatus, { each: true })
  @ArrayMaxSize(20)
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  statuses?: ApplicationStatus[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
