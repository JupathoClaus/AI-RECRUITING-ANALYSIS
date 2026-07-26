import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiInterviewProvider } from '@prisma/client';

export class CreateAiInterviewDto {
  @ApiProperty({ description: 'Application ID' })
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({ enum: AiInterviewProvider, default: 'TAVUS' })
  @IsOptional()
  @IsEnum(AiInterviewProvider)
  provider?: AiInterviewProvider;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
