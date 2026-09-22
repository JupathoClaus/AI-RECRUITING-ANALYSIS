import {
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssessmentDto {
  @ApiProperty({ description: 'Assessment name' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Optional job scope for this assessment' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Candidate-facing instructions' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  instructions?: string;

  @ApiPropertyOptional({ description: 'Time limit in minutes (null = untimed)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ description: 'Passing threshold 0-100 (decision support only)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Caller-supplied request hash for idempotency' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestHash?: string;
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiApproved?: boolean;
}
