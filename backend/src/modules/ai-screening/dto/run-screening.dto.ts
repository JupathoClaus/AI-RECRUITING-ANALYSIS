import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RunScreeningDto {
  @ApiPropertyOptional({ description: 'Optional request ID for tracing' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @ApiPropertyOptional({ description: 'Optional note about why screening was triggered' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
