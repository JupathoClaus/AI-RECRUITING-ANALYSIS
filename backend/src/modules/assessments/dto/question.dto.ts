import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssessmentQuestionType } from '@prisma/client';

export class UpsertQuestionOptionDto {
  @ApiPropertyOptional({ description: 'Present when updating an existing option' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  label: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ description: 'Per-option point override' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  points?: number | null;
}

export class UpsertRubricCriterionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Evaluator guidance shown to the AI/human reviewer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  guidance?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(100)
  maxScore: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Min(0.1)
  @Max(10)
  weight?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class UpsertQuestionDto {
  @ApiPropertyOptional({ description: 'Present when updating an existing question' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ enum: AssessmentQuestionType })
  @IsEnum(AssessmentQuestionType)
  type: AssessmentQuestionType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  prompt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  competency?: string;

  @ApiPropertyOptional({ description: 'Route open-text answers through AI rubric evaluation' })
  @IsOptional()
  @IsBoolean()
  aiEvaluated?: boolean;

  @ApiPropertyOptional({ description: 'Recruiter approval flag for AI-generated content' })
  @IsOptional()
  @IsBoolean()
  aiApproved?: boolean;

  @ApiPropertyOptional({ type: [UpsertQuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpsertQuestionOptionDto)
  options?: UpsertQuestionOptionDto[];

  @ApiPropertyOptional({ type: [UpsertRubricCriterionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpsertRubricCriterionDto)
  rubricCriteria?: UpsertRubricCriterionDto[];
}

export class SaveQuestionsDto {
  @ApiProperty({ type: [UpsertQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpsertQuestionDto)
  questions: UpsertQuestionDto[];
}

export class ReorderQuestionsDto {
  @ApiProperty({ description: 'Question ids in the desired order (must cover all questions)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  orderedIds: string[];
}
