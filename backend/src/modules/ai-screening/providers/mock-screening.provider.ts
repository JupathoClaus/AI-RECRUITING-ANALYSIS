import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiScreeningProvider, ProviderScreeningResult } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { AiScreeningRecommendation, AiScreeningConfidence } from '../domain/screening-recommendation.enum';

@Injectable()
export class MockScreeningProvider implements AiScreeningProvider {
  constructor(private readonly configService: ConfigService) {}

  async screen(input: ScreeningInput): Promise<ProviderScreeningResult> {
    const resumeText = input.resumeText.toLowerCase();
    const requiredSkills = input.requiredSkills.map((s) => s.toLowerCase());
    const matchedSkills = requiredSkills.filter((skill) => resumeText.includes(skill.toLowerCase()));
    const matchRatio = requiredSkills.length > 0 ? matchedSkills.length / requiredSkills.length : 0;

    let overallScore: number;
    let recommendation: AiScreeningRecommendation;
    let confidence: AiScreeningConfidence;
    let explanation: string;

    if (matchRatio >= 0.7) {
      overallScore = 85;
      recommendation = AiScreeningRecommendation.SHORTLIST;
      confidence = AiScreeningConfidence.HIGH;
      explanation = `Candidate matches ${matchedSkills.length}/${requiredSkills.length} required skills.`;
    } else if (matchRatio >= 0.4) {
      overallScore = 60;
      recommendation = AiScreeningRecommendation.HUMAN_REVIEW;
      confidence = AiScreeningConfidence.MEDIUM;
      explanation = `Candidate matches ${matchedSkills.length}/${requiredSkills.length} required skills. Human review recommended.`;
    } else {
      overallScore = 30;
      recommendation = AiScreeningRecommendation.NOT_SHORTLIST;
      confidence = AiScreeningConfidence.LOW;
      explanation = `Candidate matches only ${matchedSkills.length}/${requiredSkills.length} required skills.`;
    }

    if (!input.jobDescription || input.jobDescription.trim().length < 10) {
      overallScore = 0;
      recommendation = AiScreeningRecommendation.HUMAN_REVIEW;
      confidence = AiScreeningConfidence.LOW;
      explanation = 'Insufficient job description to evaluate.';
    }

    if (!input.resumeText || input.resumeText.trim().length < 10) {
      overallScore = 0;
      recommendation = AiScreeningRecommendation.HUMAN_REVIEW;
      confidence = AiScreeningConfidence.LOW;
      explanation = 'Resume text is empty or insufficient for evaluation.';
    }

    return {
      overallScore,
      recommendation,
      confidence,
      matchedQualifications: matchedSkills,
      missingQualifications: requiredSkills.filter((s) => !resumeText.includes(s.toLowerCase())),
      evidence: matchedSkills.map((skill) => ({
        criterion: 'skills_match',
        evidence: `Resume contains: ${skill}`,
        sourceCategory: 'resume',
        assessment: 'match',
        score: 100,
      })),
      criteriaScores: [
        { criterion: 'skills_match', score: Math.round(matchRatio * 100), maxScore: 100, weight: 0.5 },
        { criterion: 'experience', score: 50, maxScore: 100, weight: 0.3 },
        { criterion: 'education', score: 50, maxScore: 100, weight: 0.2 },
      ],
      uncertainties: matchRatio >= 0.4 && matchRatio < 0.7 ? ['Skill match ratio is borderline'] : [],
      riskFlags: [],
      explanation,
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: this.configService.get<string>('app.aiScreeningPromptVersion') || 'v1' },
    };
  }
}
