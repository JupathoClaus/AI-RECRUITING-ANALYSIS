import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiInterviewEvaluationRecommendation } from '@prisma/client';

export class RecordInterviewDecisionDto {
  @ApiProperty({
    description: 'The recruiter decision for the evaluated interview',
    enum: AiInterviewEvaluationRecommendation,
  })
  @IsEnum(AiInterviewEvaluationRecommendation)
  decision: AiInterviewEvaluationRecommendation;

  @ApiPropertyOptional({ description: 'Optional note explaining the decision' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
