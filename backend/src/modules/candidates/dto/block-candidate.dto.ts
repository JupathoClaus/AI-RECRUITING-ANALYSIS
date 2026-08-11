import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlockCandidateDto {
  @ApiProperty({ description: 'Reason code' })
  @IsString()
  reasonCode: string;

  @ApiProperty({ description: 'Detailed reason' })
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Optimistic concurrency version' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}
