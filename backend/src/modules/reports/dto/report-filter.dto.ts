import { IsOptional, IsString, IsArray, IsEnum, IsInt, Min, Max, IsDateString, ArrayMaxSize, IsUUID, Validate } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';

function validateDateRange(dateFrom: string | undefined, dateTo: string | undefined): void {
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new TypeError('dateFrom must not be after dateTo');
  }
}

export class ReportFilterDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
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

  /** Validate date range on first use — called by controller */
  validateDateRange(): void {
    validateDateRange(this.dateFrom, this.dateTo);
  }
}
