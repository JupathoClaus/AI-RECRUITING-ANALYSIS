import { ApiProperty } from '@nestjs/swagger';

export class DuplicateReasonDto {
  @ApiProperty()
  field: string;

  @ApiProperty()
  description: string;
}

export class DuplicateResultDto {
  @ApiProperty()
  candidateId: string;

  @ApiProperty({ enum: ['EXACT', 'HIGH', 'POSSIBLE'] })
  matchCategory: 'EXACT' | 'HIGH' | 'POSSIBLE';

  @ApiProperty({ type: [String] })
  reasons: string[];

  @ApiProperty({ description: 'Display name for identification' })
  displayName: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  status: string;
}

export class DuplicateCheckResponseDto {
  @ApiProperty({ type: [DuplicateResultDto] })
  duplicates: DuplicateResultDto[];

  @ApiProperty({ description: 'Whether duplicates block creation' })
  blocked: boolean;
}
