import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiScreeningProvider, ProviderScreeningResult } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { resumeScreeningPrompt } from '../prompts/resume-screening.prompt';
import { screeningOutputSchema } from '../schemas/screening-output.schema';
import { AiScreeningRecommendation, AiScreeningConfidence } from '../domain/screening-recommendation.enum';

@Injectable()
export class OpenAiScreeningProvider implements AiScreeningProvider {
  private readonly logger = new Logger(OpenAiScreeningProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxResumeChars: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('app.openAiApiKey');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when AI_SCREENING_PROVIDER=openai');
    }
    this.client = new OpenAI({ apiKey, timeout: this.configService.get<number>('app.aiScreeningTimeoutMs') || 60000, maxRetries: 2 });
    this.model = this.configService.get<string>('app.openAiModel') || 'gpt-4o-mini';
    this.timeoutMs = this.configService.get<number>('app.aiScreeningTimeoutMs') || 60000;
    this.maxResumeChars = this.configService.get<number>('app.aiScreeningMaxResumeChars') || 15000;
  }

  async screen(input: ScreeningInput): Promise<ProviderScreeningResult> {
    const systemPrompt = resumeScreeningPrompt();
    const truncatedResume = input.resumeText.length > this.maxResumeChars
      ? input.resumeText.slice(0, this.maxResumeChars) + '\n... [truncated]'
      : input.resumeText;

    const userMessage = this.buildUserMessage(input, truncatedResume);

    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'screening_result',
              strict: true,
              schema: screeningOutputSchema,
            },
          },
          temperature: 0.1,
          max_output_tokens: 4000,
        },
        { timeout: this.timeoutMs },
      );

      const outputText = response.output_text;
      if (!outputText || outputText.trim().length === 0) {
        throw new Error('OpenAI returned empty output');
      }

      const parsed = JSON.parse(outputText);

      return {
        overallScore: parsed.overallScore,
        recommendation: parsed.recommendation as AiScreeningRecommendation,
        confidence: parsed.confidence as AiScreeningConfidence,
        matchedQualifications: parsed.matchedQualifications || [],
        missingQualifications: parsed.missingQualifications || [],
        evidence: parsed.evidence || [],
        criteriaScores: parsed.criteriaScores || [],
        uncertainties: parsed.uncertainties || [],
        riskFlags: parsed.riskFlags || [],
        explanation: parsed.explanation || '',
        prohibitedReasoningDetected: parsed.prohibitedReasoningDetected || false,
        providerMetadata: {
          provider: 'openai',
          model: this.model,
          responseId: response.id,
        },
      };
    } catch (err: any) {
      this.logger.error(`OpenAI screening failed: ${err.message}`);
      throw err;
    }
  }

  private buildUserMessage(input: ScreeningInput, resumeText: string): string {
    return [
      '## Job Details',
      `Title: ${input.jobTitle}`,
      `Description: ${input.jobDescription}`,
      '',
      '## Required Skills',
      input.requiredSkills.map((s) => `  - ${s}`).join('\n'),
      '',
      '## Preferred Skills',
      input.preferredSkills.map((s) => `  - ${s}`).join('\n'),
      '',
      `## Required Experience: ${input.requiredExperience}`,
      `## Preferred Experience: ${input.preferredExperience}`,
      `## Required Education: ${input.requiredEducation}`,
      '',
      '## Resume Text',
      resumeText,
    ].join('\n');
  }
}
