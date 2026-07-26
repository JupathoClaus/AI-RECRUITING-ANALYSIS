import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartAiInterviewDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  acknowledgementsAccepted?: boolean;
}
