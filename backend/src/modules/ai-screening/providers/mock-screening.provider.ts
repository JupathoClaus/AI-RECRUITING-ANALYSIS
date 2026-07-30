import { AiScreeningProvider, AiScreeningProviderOptions } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { AiScreeningProviderError } from './ai-screening-provider.errors';

export type MockScenario =
  | 'STRONG_MATCH'
  | 'WEAK_MATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'PROHIBITED_REASONING'
  | 'MALFORMED_RESULT'
  | 'PROVIDER_FAILURE';

export interface MockScreeningProviderOptions {
  scenario?: MockScenario;
}

export class MockScreeningProvider implements AiScreeningProvider {
  readonly providerName = 'mock';
  private readonly scenario?: MockScenario;

  constructor(options?: MockScreeningProviderOptions) {
    this.scenario = options?.scenario;
  }

  async screen(
    input: ScreeningInput,
    _options?: AiScreeningProviderOptions,
  ): Promise<ProviderScreeningResult> {
    const scenario = this.scenario ?? this.detectScenario(input);

    switch (scenario) {
      case 'STRONG_MATCH':
        return this.strongMatch();
      case 'WEAK_MATCH':
        return this.weakMatch();
      case 'INSUFFICIENT_EVIDENCE':
        return this.insufficientEvidence();
      case 'PROHIBITED_REASONING':
        return this.prohibitedReasoning();
      case 'MALFORMED_RESULT':
        return this.malformedResult();
      case 'PROVIDER_FAILURE':
        throw new AiScreeningProviderError({
          message: 'Mock provider failure',
          safeMessage: 'The screening provider encountered an error.',
          safeCode: 'PROVIDER_ERROR',
          retryable: true,
          providerName: 'mock',
        });
      default:
        return this.defaultResult(input);
    }
  }

  private detectScenario(input: ScreeningInput): MockScenario | null {
    const jd = input.jobDescription;
    if (!jd.startsWith('__MOCK_SCENARIO:')) return null;
    const marker = jd.slice('__MOCK_SCENARIO:'.length).trim() as MockScenario;
    const validScenarios: MockScenario[] = [
      'STRONG_MATCH',
      'WEAK_MATCH',
      'INSUFFICIENT_EVIDENCE',
      'PROHIBITED_REASONING',
      'MALFORMED_RESULT',
      'PROVIDER_FAILURE',
    ];
    if (validScenarios.includes(marker)) return marker;
    return null;
  }

  private defaultResult(input: ScreeningInput): ProviderScreeningResult {
    const resumeText = input.resumeText.toLowerCase();
    const matched = input.requiredSkills.filter((s) => resumeText.includes(s.toLowerCase()));
    const matchRatio =
      input.requiredSkills.length > 0 ? matched.length / input.requiredSkills.length : 0;

    if (!input.jobDescription || input.jobDescription.trim().length < 10) {
      return this.insufficientEvidence();
    }
    if (!input.resumeText || input.resumeText.trim().length < 10) {
      return this.insufficientEvidence();
    }
    if (matchRatio >= 0.6) {
      return {
        overallScore: 85,
        recommendation: ScreeningRecommendation.SHORTLIST,
        confidence: ScreeningConfidence.HIGH,
        matchedQualifications: matched,
        missingQualifications: input.requiredSkills.filter(
          (s) => !resumeText.includes(s.toLowerCase()),
        ),
        evidence: matched.map((s) => ({
          criterion: 'skills_match',
          sourceCategory: ScreeningSourceCategory.RESUME,
          sourceText: `Resume contains skill: ${s}`,
          assessment: 'match',
          weight: 0.5,
          isRequired: true,
        })),
        uncertainties: [],
        riskFlags: [],
        explanation: `Candidate matches ${matched.length}/${input.requiredSkills.length} required skills.`,
        criteriaScores: [
          {
            criterion: 'skills_match',
            score: Math.round(matchRatio * 100),
            maximumScore: 100,
            weight: 0.5,
            explanation: 'Based on required skill match ratio',
          },
          {
            criterion: 'experience',
            score: 50,
            maximumScore: 100,
            weight: 0.3,
            explanation: 'Experience match from resume',
          },
          {
            criterion: 'education',
            score: 50,
            maximumScore: 100,
            weight: 0.2,
            explanation: 'Education match from resume',
          },
        ],
        prohibitedReasoningDetected: false,
        providerMetadata: { provider: 'mock', promptVersion: 'v1' },
      };
    }
    if (matchRatio >= 0.3) {
      return {
        overallScore: 55,
        recommendation: ScreeningRecommendation.HUMAN_REVIEW,
        confidence: ScreeningConfidence.MEDIUM,
        matchedQualifications: matched,
        missingQualifications: input.requiredSkills.filter(
          (s) => !resumeText.includes(s.toLowerCase()),
        ),
        evidence: matched.map((s) => ({
          criterion: 'skills_match',
          sourceCategory: ScreeningSourceCategory.RESUME,
          sourceText: `Resume contains skill: ${s}`,
          assessment: 'partial_match',
          weight: 0.5,
          isRequired: true,
        })),
        uncertainties: [
          `Candidate matches only ${matched.length}/${input.requiredSkills.length} required skills`,
        ],
        riskFlags: [],
        explanation: `Candidate matches ${matched.length}/${input.requiredSkills.length} required skills. Human review recommended.`,
        criteriaScores: [
          {
            criterion: 'skills_match',
            score: Math.round(matchRatio * 100),
            maximumScore: 100,
            weight: 0.5,
            explanation: 'Partial skills match',
          },
        ],
        prohibitedReasoningDetected: false,
        providerMetadata: { provider: 'mock', promptVersion: 'v1' },
      };
    }
    return {
      overallScore: 25,
      recommendation: ScreeningRecommendation.NOT_SHORTLIST,
      confidence: ScreeningConfidence.LOW,
      matchedQualifications: matched,
      missingQualifications: input.requiredSkills.filter(
        (s) => !resumeText.includes(s.toLowerCase()),
      ),
      evidence: input.requiredSkills.map((s) => ({
        criterion: 'skills_match',
        sourceCategory: ScreeningSourceCategory.JOB_REQUIREMENT,
        sourceText: `Required skill: ${s}`,
        assessment: 'missing',
        isRequired: true,
      })),
      uncertainties: [],
      riskFlags: ['LOW_SKILL_MATCH'],
      explanation: `Candidate matches only ${matched.length}/${input.requiredSkills.length} required skills.`,
      criteriaScores: [
        {
          criterion: 'skills_match',
          score: Math.round(matchRatio * 100),
          maximumScore: 100,
          weight: 0.5,
          explanation: 'Low skills match',
        },
      ],
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }

  private strongMatch(): ProviderScreeningResult {
    return {
      overallScore: 92,
      recommendation: ScreeningRecommendation.SHORTLIST,
      confidence: ScreeningConfidence.HIGH,
      matchedQualifications: [
        'Strong technical background',
        'Relevant industry experience',
        'Required skills verified',
      ],
      missingQualifications: [],
      evidence: [
        {
          criterion: 'technical_skills',
          sourceCategory: ScreeningSourceCategory.RESUME,
          sourceText: '10+ years experience in relevant technologies',
          assessment: 'strong_match',
          score: 95,
          weight: 0.5,
          isRequired: true,
        },
        {
          criterion: 'domain_experience',
          sourceCategory: ScreeningSourceCategory.RESUME,
          sourceText: 'Previous role in similar industry',
          assessment: 'strong_match',
          score: 90,
          weight: 0.3,
          isRequired: true,
        },
      ],
      uncertainties: [],
      riskFlags: [],
      explanation:
        'Candidate strongly matches all required qualifications with verified experience.',
      criteriaScores: [
        {
          criterion: 'technical_skills',
          score: 95,
          maximumScore: 100,
          weight: 0.5,
          explanation: 'Excellent technical alignment',
        },
        {
          criterion: 'experience',
          score: 90,
          maximumScore: 100,
          weight: 0.3,
          explanation: 'Strong experience match',
        },
        {
          criterion: 'education',
          score: 85,
          maximumScore: 100,
          weight: 0.2,
          explanation: 'Education meets requirements',
        },
      ],
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }

  private weakMatch(): ProviderScreeningResult {
    return {
      overallScore: 25,
      recommendation: ScreeningRecommendation.NOT_SHORTLIST,
      confidence: ScreeningConfidence.LOW,
      matchedQualifications: [],
      missingQualifications: [
        'Required technical skills not demonstrated',
        'Insufficient relevant experience',
        'Missing required education',
      ],
      evidence: [
        {
          criterion: 'technical_skills',
          sourceCategory: ScreeningSourceCategory.JOB_REQUIREMENT,
          sourceText: 'Required: TypeScript, React, Node.js',
          assessment: 'missing',
          isRequired: true,
        },
        {
          criterion: 'experience',
          sourceCategory: ScreeningSourceCategory.JOB_REQUIREMENT,
          sourceText: 'Required: 5+ years experience',
          assessment: 'missing',
          isRequired: true,
        },
      ],
      uncertainties: [],
      riskFlags: ['MISSING_REQUIRED_SKILLS', 'INSUFFICIENT_EXPERIENCE'],
      explanation: 'Candidate does not meet the minimum required qualifications for this position.',
      criteriaScores: [
        {
          criterion: 'technical_skills',
          score: 10,
          maximumScore: 100,
          weight: 0.5,
          explanation: 'Required skills not found in resume',
        },
        {
          criterion: 'experience',
          score: 15,
          maximumScore: 100,
          weight: 0.3,
          explanation: 'Experience below minimum requirements',
        },
        {
          criterion: 'education',
          score: 50,
          maximumScore: 100,
          weight: 0.2,
          explanation: 'Partial education match',
        },
      ],
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }

  private insufficientEvidence(): ProviderScreeningResult {
    return {
      overallScore: 0,
      recommendation: ScreeningRecommendation.HUMAN_REVIEW,
      confidence: ScreeningConfidence.LOW,
      matchedQualifications: [],
      missingQualifications: [],
      evidence: [
        {
          criterion: 'evidence_availability',
          sourceCategory: ScreeningSourceCategory.UNKNOWN,
          sourceText: 'Insufficient evidence to evaluate',
          assessment: 'insufficient',
          isRequired: true,
        },
      ],
      uncertainties: [
        'Resume text is empty or insufficient',
        'Job description lacks sufficient detail',
      ],
      riskFlags: ['INSUFFICIENT_EVIDENCE'],
      explanation:
        'There is insufficient information to evaluate this candidate. Human review is required.',
      criteriaScores: [
        {
          criterion: 'overall',
          score: 0,
          maximumScore: 100,
          weight: 1,
          explanation: 'Cannot evaluate due to insufficient data',
        },
      ],
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }

  private prohibitedReasoning(): ProviderScreeningResult {
    return {
      overallScore: 0,
      recommendation: ScreeningRecommendation.HUMAN_REVIEW,
      confidence: ScreeningConfidence.LOW,
      matchedQualifications: [],
      missingQualifications: [],
      evidence: [
        {
          criterion: 'compliance',
          sourceCategory: ScreeningSourceCategory.UNKNOWN,
          sourceText: 'Prohibited reasoning detected in provider output',
          assessment: 'flag',
          isRequired: true,
        },
      ],
      uncertainties: ['Screening result flagged for prohibited reasoning'],
      riskFlags: ['PROHIBITED_REASONING_DETECTED'],
      explanation:
        'Screening result flagged for review due to potential non-job-related reasoning.',
      criteriaScores: [],
      prohibitedReasoningDetected: true,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }

  private malformedResult(): ProviderScreeningResult {
    return {
      overallScore: -1,
      recommendation: 'INVALID_ENUM' as ScreeningRecommendation,
      confidence: ScreeningConfidence.HIGH,
      matchedQualifications: [],
      missingQualifications: [],
      evidence: [],
      uncertainties: [],
      riskFlags: [],
      explanation: '',
      criteriaScores: [],
      prohibitedReasoningDetected: false,
      providerMetadata: { provider: 'mock', promptVersion: 'v1' },
    };
  }
}
