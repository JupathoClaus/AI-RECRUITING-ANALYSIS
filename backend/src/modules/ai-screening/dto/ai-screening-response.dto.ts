import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ScreeningCriterionScoreDto {
  @ApiProperty() criterion: string;
  @ApiProperty() score: number;
  @ApiProperty() maximumScore: number;
  @ApiProperty() weight: number;
  @ApiProperty() explanation: string;
}

class ScreeningEvidenceDto {
  @ApiProperty() criterion: string;
  @ApiProperty() sourceCategory: string;
  @ApiProperty() sourceText: string;
  @ApiProperty() assessment: string;
  @ApiPropertyOptional() score?: number;
  @ApiPropertyOptional() weight?: number;
  @ApiPropertyOptional() isRequired?: boolean;
}

class CriterionEvidenceItemDto {
  @ApiProperty() sourceCategory: string;
  @ApiProperty() sourceText: string;
  @ApiPropertyOptional()
  verificationStatus?: 'VERBATIM' | 'SUPPORTED' | 'INFERRED' | 'UNVERIFIED';
}

class CriterionEvaluationDto {
  @ApiProperty() criterionId: string;
  @ApiProperty() criterion: string;
  @ApiProperty() requirementType: string;
  @ApiProperty() status: string;
  @ApiProperty() reason: string;
  @ApiProperty() confidence: string;
  @ApiPropertyOptional({ type: [CriterionEvidenceItemDto] })
  evidence?: CriterionEvidenceItemDto[];
  @ApiPropertyOptional() evidenceUnverified?: boolean;
}

export class AiScreeningResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() applicationId: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() recommendation?: string;
  @ApiPropertyOptional() overallScore?: number;
  @ApiPropertyOptional() confidence?: string;
  @ApiPropertyOptional() matchedQualifications?: string[];
  @ApiPropertyOptional() missingQualifications?: string[];
  @ApiPropertyOptional({ type: [ScreeningEvidenceDto] }) evidence?: ScreeningEvidenceDto[];
  @ApiPropertyOptional({ type: [ScreeningCriterionScoreDto] })
  criteriaScores?: ScreeningCriterionScoreDto[];
  @ApiPropertyOptional()
  criterionEvaluations?: CriterionEvaluationDto[];
  @ApiPropertyOptional() uncertainties?: string[];
  @ApiPropertyOptional() riskFlags?: string[];
  @ApiPropertyOptional() explanation?: string;
  @ApiPropertyOptional() prohibitedReasoningDetected?: boolean;
  @ApiPropertyOptional() provider?: string;
  @ApiPropertyOptional() model?: string;
  @ApiPropertyOptional() promptVersion?: string;
  @ApiPropertyOptional() failureCode?: string;
  @ApiPropertyOptional() failureMessageSafe?: string;
  @ApiProperty() createdAt: string;
  @ApiPropertyOptional() startedAt?: string;
  @ApiPropertyOptional() completedAt?: string;
}

export class PaginatedResponseDto<T> {
  @ApiProperty() data: T[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
