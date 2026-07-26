import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenceItemResponse {
  @ApiProperty() criterion: string;
  @ApiProperty() evidence: string;
  @ApiProperty() sourceCategory: string;
  @ApiProperty() assessment: string;
  @ApiPropertyOptional() score?: number;
}

export class CriteriaScoreResponse {
  @ApiProperty() criterion: string;
  @ApiProperty() score: number;
  @ApiProperty() maxScore: number;
  @ApiProperty() weight: number;
}

export class ScreeningResultResponse {
  @ApiProperty() id: string;
  @ApiProperty() applicationId: string;
  @ApiProperty() jobId: string;
  @ApiProperty() candidateId: string;
  @ApiProperty() companyId: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() overallScore?: number;
  @ApiPropertyOptional() recommendation?: string;
  @ApiPropertyOptional() confidence?: string;
  @ApiPropertyOptional() matchedQualifications?: string[];
  @ApiPropertyOptional() missingQualifications?: string[];
  @ApiPropertyOptional() evidence?: EvidenceItemResponse[];
  @ApiPropertyOptional() criteriaScores?: CriteriaScoreResponse[];
  @ApiPropertyOptional() uncertainties?: string[];
  @ApiPropertyOptional() riskFlags?: string[];
  @ApiPropertyOptional() explanation?: string;
  @ApiProperty() prohibitedReasoningDetected: boolean;
  @ApiPropertyOptional() provider?: string;
  @ApiPropertyOptional() model?: string;
  @ApiPropertyOptional() failureCode?: string;
  @ApiPropertyOptional() failureMessageSafe?: string;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() completedAt?: Date;
}
