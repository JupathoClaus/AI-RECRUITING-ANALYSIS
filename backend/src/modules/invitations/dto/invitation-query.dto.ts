import { IsOptional, IsString, IsInt, Min, IsEnum, IsUUID, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { InvitationStatus } from '@prisma/client';

const SORT_BY_WHITELIST = [
  'createdAt',
  'updatedAt',
  'email',
  'status',
  'expiresAt',
  'lastSentAt',
] as const;

type SortBy = (typeof SORT_BY_WHITELIST)[number];

export class InvitationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InvitationStatus })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SORT_BY_WHITELIST })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (SORT_BY_WHITELIST.includes(value)) return value;
    return 'createdAt';
  })
  sortBy?: SortBy = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (value === 'asc' || value === 'desc') return value;
    return 'desc';
  })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
