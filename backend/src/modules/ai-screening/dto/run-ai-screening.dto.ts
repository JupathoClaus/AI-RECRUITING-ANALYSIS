import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class RunAiScreeningDto {
  @ApiPropertyOptional({
    description: 'Force a new screening even if an identical attempt exists',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  forceRerun?: boolean;
}
