import { ScreeningRecommendation } from './screening-recommendation.enum';
import { ScreeningConfidence } from './screening-confidence.enum';
import { ScreeningEvidenceItem } from './screening-evidence.type';
import { ScreeningCriterionScore } from './screening-criterion-score.type';

export interface ProviderMetadata {
  provider: string;
  model?: string;
  promptVersion?: string;
  responseId?: string;
  processingTimeMs?: number;
  finishReason?: string;
  createdAt?: string;
}

export interface ProviderScreeningResult {
  overallScore: number;
  recommendation: ScreeningRecommendation;
  confidence: ScreeningConfidence;
  matchedQualifications: string[];
  missingQualifications: string[];
  evidence: ScreeningEvidenceItem[];
  uncertainties: string[];
  riskFlags: string[];
  explanation: string;
  criteriaScores: ScreeningCriterionScore[];
  prohibitedReasoningDetected: boolean;
  providerMetadata?: ProviderMetadata;
}
