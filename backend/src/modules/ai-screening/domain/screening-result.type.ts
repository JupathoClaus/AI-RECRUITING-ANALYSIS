import { AiScreeningRecommendation, AiScreeningConfidence } from './screening-recommendation.enum';

export interface EvidenceItem {
  criterion: string;
  evidence: string;
  sourceCategory: string;
  assessment: string;
  score?: number;
}

export interface CriteriaScore {
  criterion: string;
  score: number;
  maxScore: number;
  weight: number;
}

export interface ScreeningResult {
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
