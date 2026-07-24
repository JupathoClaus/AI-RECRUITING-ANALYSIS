import { IsOptional, IsArray, IsEnum, IsInt, Min, Max, IsDateString, ArrayMaxSize, IsUUID } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApplicationStatus } from '@prisma/client';

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

  /** Validates dateFrom is not after dateTo. Throws BadRequestException via NestJS pipe. */
  validateDateRange(): void {
    if (this.dateFrom && this.dateTo && new Date(this.dateFrom) > new Date(this.dateTo)) {
      throw new TypeError('dateFrom must not be after dateTo');
    }
  }

  /** Returns a new DTO with page/limit overridden for exports. */
  withExportDefaults(): ReportFilterDto {
    const copy = new ReportFilterDto();
    copy.dateFrom = this.dateFrom;
    copy.dateTo = this.dateTo;
    copy.jobIds = this.jobIds;
    copy.departmentIds = this.departmentIds;
    copy.statuses = this.statuses;
    copy.page = 1;
    copy.limit = 5000;
    return copy;
  }

  /** Returns a copy with dateTo adjusted to end-of-day (23:59:59 UTC). */
  withEndOfDay(): ReportFilterDto {
    const copy = new ReportFilterDto();
    copy.dateFrom = this.dateFrom;
    copy.dateTo = this.dateTo ? new Date(new Date(this.dateTo).getTime() + 86400000).toISOString().split('T')[0] : undefined;
    copy.jobIds = this.jobIds;
    copy.departmentIds = this.departmentIds;
    copy.statuses = this.statuses;
    copy.page = this.page;
    copy.limit = this.limit;
    return copy;
  }
}
