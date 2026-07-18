import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScreeningQuestionType } from '@prisma/client';

export class CreateScreeningQuestionDto {
  @ApiProperty({ example: 'How many years of experience do you have with TypeScript?' })
  @IsString()
  question: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ScreeningQuestionType })
  @IsEnum(ScreeningQuestionType)
  type: ScreeningQuestionType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  disqualifying?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  expectedAnswer?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  minimumScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  maximumScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  weight?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  aiEvaluationAllowed?: boolean;
}
