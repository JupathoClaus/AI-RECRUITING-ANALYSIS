import { IsString, IsOptional, IsInt, Min, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MergeCandidateDto {
  @ApiProperty()
  @IsString()
  primaryCandidateId: string;

  @ApiProperty()
  @IsString()
  mergedCandidateId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPrimaryVersion: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedMergedVersion: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Field resolution map: { fieldName: "primary" | "merged" }' })
  @IsOptional()
  @IsObject()
  fieldResolution?: Record<string, 'primary' | 'merged'>;
}
