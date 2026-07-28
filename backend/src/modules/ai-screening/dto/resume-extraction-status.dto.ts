import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResumeExtractionStatusDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] })
  status: string;

  @ApiPropertyOptional()
  failureCode?: string;

  @ApiPropertyOptional()
  failureMessageSafe?: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  completedAt?: string;
}
