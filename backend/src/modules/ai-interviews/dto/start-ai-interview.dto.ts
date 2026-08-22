import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartAiInterviewDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  acknowledgementsAccepted?: boolean;

  @ApiPropertyOptional({ description: 'Candidate requests an accessibility adjustment' })
  @IsOptional()
  @IsBoolean()
  accommodationRequested?: boolean;

  @ApiPropertyOptional({ description: 'Free-text accommodation note (only when requested)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  accommodationNotes?: string;
}