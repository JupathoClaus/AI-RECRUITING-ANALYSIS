import { ScreeningInput } from '../domain/screening-input.type';
import { EvidenceItem, CriteriaScore } from '../domain/screening-result.type';
import { AiScreeningRecommendation, AiScreeningConfidence } from '../domain/screening-recommendation.enum';

export interface ProviderScreeningResult {
  overallScore: number;
  recommendation: AiScreeningRecommendation;
  confidence: AiScreeningConfidence;
  matchedQualifications: string[];
  missingQualifications: string[];
  evidence: EvidenceItem[];
  criteriaScores: CriteriaScore[];
  uncertainties: string[];
  riskFlags: string[];
  explanation: string;
  prohibitedReasoningDetected: boolean;
  providerMetadata?: Record<string, unknown>;
}

export interface AiScreeningProvider {
  screen(input: ScreeningInput): Promise<ProviderScreeningResult>;
}
