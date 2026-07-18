import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSource } from '@prisma/client';

export class ScreeningAnswerInputDto {
  @ApiProperty({ description: 'Question ID' })
  @IsUUID()
  questionId: string;

  @ApiPropertyOptional({ description: 'Text answer' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  textAnswer?: string;

  @ApiPropertyOptional({ description: 'Numeric answer' })
  @IsOptional()
  @IsNumber()
  numericAnswer?: number;

  @ApiPropertyOptional({ description: 'Date answer (ISO string)' })
  @IsOptional()
  @IsString()
  dateAnswer?: string;

  @ApiPropertyOptional({ description: 'JSON answer (for SINGLE_CHOICE, MULTIPLE_CHOICE, YES_NO)' })
  @IsOptional()
  answer?: unknown;
}

export class CreateApplicationDto {
  @ApiProperty({ description: 'Candidate global ID' })
  @IsUUID()
  candidateId: string;

  @ApiProperty({ description: 'Job ID' })
  @IsUUID()
  jobId: string;

  @ApiProperty({ enum: CandidateSource })
  @IsEnum(CandidateSource)
  source: CandidateSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceDetail?: string;

  @ApiPropertyOptional({ description: 'Owner membership ID' })
  @IsOptional()
  @IsUUID()
  ownerMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedSalaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedSalaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  salaryCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @ApiPropertyOptional({ type: [ScreeningAnswerInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScreeningAnswerInputDto)
  screeningAnswers?: ScreeningAnswerInputDto[];
}
