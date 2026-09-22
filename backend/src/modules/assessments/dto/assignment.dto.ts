import {
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  IsArray,
  IsDateString,
  Min,
  Max,
  MaxLength,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignAssessmentDto {
  @ApiProperty({ description: 'Application receiving the assessment' })
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({ description: 'ISO due date (null = no due date)' })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class BulkAssignAssessmentDto {
  @ApiProperty({ description: 'Application ids to assign (deduplicated server-side)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  applicationIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class GenerateQuestionsDto {
  @ApiProperty({ description: 'Number of questions to draft (1-20)' })
  @IsInt()
  @Min(1)
  @Max(20)
  count: number;

  @ApiPropertyOptional({ description: 'Competency focus areas' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  focusAreas?: string[];

  @ApiPropertyOptional({ description: 'Target difficulty, e.g. junior|intermediate|senior' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Extra recruiter instructions for generation' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiPropertyOptional({ description: 'Preferred question types', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  questionTypes?: string[];
}

export class VerifyAssessmentCodeDto {
  @ApiProperty({ description: 'Candidate assessment code (XXXX-XXXX)' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code: string;
}

export class SaveAssessmentResponseDto {
  @ApiProperty({ description: 'Question being answered' })
  @IsUUID()
  questionId: string;

  @ApiPropertyOptional({ description: 'Selected option ids (choice questions)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @ApiPropertyOptional({ description: 'Free-text answer (text questions)' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  textAnswer?: string;

  @ApiPropertyOptional({ description: 'Client-known updatedAt for stale-write detection' })
  @IsOptional()
  @IsString()
  baseUpdatedAt?: string;
}
