import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MergePreviewDto {
  @ApiProperty({ description: 'Primary candidate ID' })
  @IsString()
  primaryCandidateId: string;

  @ApiProperty({ description: 'Merged candidate ID' })
  @IsString()
  mergedCandidateId: string;
}
