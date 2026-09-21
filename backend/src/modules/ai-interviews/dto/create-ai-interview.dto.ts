import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiInterviewProvider } from '@prisma/client';

export class CreateAiInterviewDto {
  @ApiProperty({ description: 'Application ID' })
  @IsUUID('all')
  applicationId: string;

  @ApiPropertyOptional({ enum: AiInterviewProvider, default: 'TAVUS' })
  @IsOptional()
  @IsEnum(AiInterviewProvider)
  provider?: AiInterviewProvider;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ default: 5, description: 'Estimated duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date string for scheduled interview time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
