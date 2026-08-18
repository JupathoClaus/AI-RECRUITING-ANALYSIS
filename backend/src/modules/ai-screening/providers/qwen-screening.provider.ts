import type OpenAI from 'openai';
import { AiScreeningProvider, AiScreeningProviderOptions } from './ai-screening-provider.interface';
import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';
import { ScreeningRecommendation } from '../domain/screening-recommendation.enum';
import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { buildQwenCriterionPrompt } from '../prompts/qwen-criterion-screening.prompt';
import { validateQwenOutput } from '../schemas/qwen-output.schema';
import { applyProhibitedReasoningGuard } from './prohibited-reasoning.guard';
import { BackendScoringService, ScoringInput } from '../services/backend-scoring.service';
import { EvidenceVerificationService } from '../services/evidence-verification.service';
import { QwenScreeningOutput, CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { ScreeningCriterion } from '../domain/screening-criterion.type';
import {
  AiScreeningProviderError,
  AiScreeningTimeoutError,
  AiScreeningAuthenticationError,
  AiScreeningRateLimitError,
  AiScreeningMalformedResponseError,
} from './ai-screening-provider.errors';

export interface QwenScreeningConfig {
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxResumeChars: number;
  promptVersion: string;
}

/**
 * QwenScreeningProvider
 *
 * Uses the OpenAI-compatible Chat Completions API (supported by both
 * Ollama and vLLM) to call Qwen3.5-9B (or any compatible model).
 *
 * Key differences from the OpenAI/DeepSeek providers:
 * 1. Asks the model to evaluate CRITERIA, not produce a final score.
 * 2. BackendScoringService computes the deterministic numeric score.
 * 3. EvidenceVerificationService cross-checks each evidence quote against
 *    the resume text before trusting it.
 * 4. Works against Ollama (dev) or vLLM (prod) by switching QWEN_BASE_URL.
 */
export class QwenScreeningProvider implements AiScreeningProvider {
  readonly providerName = 'qwen';

  private readonly client: OpenAI;
  private readonly config: QwenScreeningConfig;
  private readonly scorer: BackendScoringService;
  private readonly evidenceVerifier: EvidenceVerificationService;

  constructor(
    client: OpenAI,
    config: QwenScreeningConfig,
    scorer: BackendScoringService,
    evidenceVerifier: EvidenceVerificationService,
  ) {
    this.client = client;
    this.config = config;
    this.scorer = scorer;
    this.evidenceVerifier = evidenceVerifier;
  }

  async screen(
    input: ScreeningInput,
    options?: AiScreeningProviderOptions,
  ): Promise<ProviderScreeningResult> {
    const criteria = input.criteria ?? [];
    const prompt = buildQwenCriterionPrompt(input, {
      maxResumeChars: this.config.maxResumeChars,
      promptVersion: this.config.promptVersion,
    });

    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const startTime = Date.now();

    // ── Call the model ──────────────────────────────────────────────────────
    let rawOutput: unknown;
    let finishReason: string;
    let modelName: string;
    let responseId: string;

    try {
      const response = await (this.client.chat.completions as any).create(
        {
          model: this.config.model,
          messages: [
            { role: 'system', content: prompt.systemInstructions },
            { role: 'user', content: prompt.evaluationInput },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          // Keep tokens generous — criterion-level evaluations can be long
          max_tokens: 6000,
        },
        {
          timeout: timeoutMs,
          signal: options?.abortSignal,
        },
      );

      const choice = response.choices?.[0];
      if (!choice) {
        throw new AiScreeningMalformedResponseError('Qwen returned no choices', 'qwen');
      }

      finishReason = choice.finish_reason ?? 'unknown';
      modelName = response.model ?? this.config.model;
      responseId = response.id ?? '';

      if (finishReason === 'length') {
        throw new AiScreeningMalformedResponseError(
          'Qwen response truncated (max_tokens reached) — reduce resume size or increase max_tokens',
          'qwen',
        );
      }

      const content = choice.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new AiScreeningMalformedResponseError('Qwen returned empty content', 'qwen');
      }

      try {
        rawOutput = JSON.parse(content.trim());
      } catch {
        throw new AiScreeningMalformedResponseError('Qwen returned non-JSON content', 'qwen');
      }

      if (typeof rawOutput !== 'object' || rawOutput === null) {
        throw new AiScreeningMalformedResponseError('Qwen returned non-object JSON', 'qwen');
      }
    } catch (err: unknown) {
      if (err instanceof AiScreeningProviderError) throw err;
      this.classifyNetworkError(err);
    }

    const processingTimeMs = Date.now() - startTime;

    // ── Validate model output ───────────────────────────────────────────────
    const expectedIds = criteria.map((c) => c.id);
    const qwenOutput: QwenScreeningOutput = validateQwenOutput(rawOutput!, expectedIds);

    // ── Evidence verification ───────────────────────────────────────────────
    // Cross-check each quoted sourceText against the actual resume text.
    // Unverified quotes are flagged; HIGH confidence is downgraded if key
    // evidence cannot be found in the resume.
    const verifiedEvaluations = this.evidenceVerifier.verifyEvaluations(
      qwenOutput.criterionEvaluations,
      input.resumeText,
    );

    // ── Deterministic scoring ───────────────────────────────────────────────
    const scoringInput: ScoringInput = {
      evaluations: verifiedEvaluations,
      criteria,
      hasUnverifiedCriticalEvidence: verifiedEvaluations.some(
        (e) => e.evidenceUnverified && e.requirementType !== 'PREFERRED',
      ),
    };

    const scoringResult = this.scorer.score(scoringInput);

    // ── Build ProviderScreeningResult compatible with existing frontend ──────
    // The existing ProviderScreeningResult / frontend contract expects:
    //   overallScore, recommendation, confidence, matchedQualifications,
    //   missingQualifications, evidence[], criteriaScores[], explanation,
    //   riskFlags, uncertainties, prohibitedReasoningDetected
    //
    // We map the criterion-level output into that shape so the
    // frontend, DB, and all existing tests stay unchanged.

    const matchedQualifications: string[] = [];
    const missingQualifications: string[] = [];
    const uncertainties: string[] = [...qwenOutput.warnings];
    const riskFlags: string[] = [];

    for (const ev of verifiedEvaluations) {
      switch (ev.status) {
        case 'FULLY_MET':
        case 'PARTIALLY_MET':
          matchedQualifications.push(
            ev.status === 'FULLY_MET'
              ? ev.criterion
              : `${ev.criterion} (partial)`,
          );
          break;
        case 'NOT_MET':
          missingQualifications.push(ev.criterion);
          if (ev.requirementType === 'HARD_REQUIREMENT') {
            riskFlags.push(`HARD_REQUIREMENT_NOT_MET: ${ev.criterion}`);
          }
          break;
        case 'UNCERTAIN':
          uncertainties.push(`Uncertain evidence for: ${ev.criterion}`);
          break;
      }
      if (ev.evidenceUnverified) {
        riskFlags.push(`UNVERIFIED_EVIDENCE: ${ev.criterion}`);
      }
    }

    // Map criterion evaluations → criteriaScores for display
    const criteriaScores = this.buildCriteriaScores(verifiedEvaluations, criteria, scoringResult.criterionPoints);

    // Map evidence items from evaluations → flat evidence array
    const evidenceItems = this.flattenEvidence(verifiedEvaluations);

    // Overall confidence: downgrade if many uncertainties or unverified evidence
    const overallConfidence = this.computeOverallConfidence(
      verifiedEvaluations,
      scoringResult.uncertainCount,
      scoringResult.unverifiedCount,
    );

    // Ensure HUMAN_REVIEW has at least one uncertainty or risk flag
    if (
      scoringResult.recommendation === ScreeningRecommendation.HUMAN_REVIEW &&
      uncertainties.length === 0 &&
      riskFlags.length === 0
    ) {
      uncertainties.push('Score or evidence quality requires human review');
    }

    // NOT_SHORTLIST requires at least one missing qualification + evidence
    if (
      scoringResult.recommendation === ScreeningRecommendation.NOT_SHORTLIST &&
      missingQualifications.length === 0
    ) {
      missingQualifications.push('Insufficient evidence to meet job requirements');
    }
    if (
      scoringResult.recommendation === ScreeningRecommendation.NOT_SHORTLIST &&
      evidenceItems.length === 0
    ) {
      evidenceItems.push({
        criterion: 'overall',
        sourceCategory: ScreeningSourceCategory.JOB_REQUIREMENT,
        sourceText: 'Candidate does not meet minimum job requirements based on available evidence.',
        assessment: 'not_met',
        isRequired: true,
        score: 0,
      });
    }

    // SHORTLIST requires at least one matched qualification + evidence
    if (
      scoringResult.recommendation === ScreeningRecommendation.SHORTLIST &&
      matchedQualifications.length === 0
    ) {
      matchedQualifications.push('Meets core job requirements');
    }
    if (
      scoringResult.recommendation === ScreeningRecommendation.SHORTLIST &&
      evidenceItems.length === 0
    ) {
      evidenceItems.push({
        criterion: 'overall',
        sourceCategory: ScreeningSourceCategory.RESUME,
        sourceText: 'Candidate demonstrates evidence of meeting job requirements.',
        assessment: 'match',
        isRequired: true,
        score: 100,
      });
    }

    const result: ProviderScreeningResult = {
      overallScore: scoringResult.overallScore,
      recommendation: scoringResult.recommendation,
      confidence: overallConfidence,
      matchedQualifications,
      missingQualifications,
      evidence: evidenceItems,
      criteriaScores,
      uncertainties,
      riskFlags,
      explanation: qwenOutput.summary,
      prohibitedReasoningDetected: qwenOutput.prohibitedReasoningDetected,
      providerMetadata: {
        provider: 'qwen',
        model: modelName!,
        promptVersion: this.config.promptVersion,
        responseId: responseId!,
        processingTimeMs,
        finishReason: finishReason!,
        createdAt: new Date().toISOString(),
      },
    };

    return applyProhibitedReasoningGuard(result);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildCriteriaScores(
    evaluations: CriterionEvaluation[],
    criteria: ScreeningCriterion[],
    criterionPoints: Map<string, number>,
  ) {
    const criterionWeightMap = new Map(criteria.map((c) => [c.id, c]));

    return evaluations.map((ev) => {
      const criterion = criterionWeightMap.get(ev.criterionId);
      const weight = criterion?.weight ?? 0;
      const maximumScore = 100;
      const rawPoints = criterionPoints.get(ev.criterionId) ?? 0;
      // normalise to 0–100 based on what full weight would contribute
      const score = weight > 0 ? Math.round((rawPoints / weight) * 100) : 0;

      const statusLabel: Record<string, string> = {
        FULLY_MET: 'Fully met',
        PARTIALLY_MET: 'Partially met',
        NOT_MET: 'Not met',
        UNCERTAIN: 'Uncertain',
      };

      return {
        criterion: ev.criterion,
        score: Math.min(maximumScore, Math.max(0, score)),
        maximumScore,
        weight,
        explanation: `${statusLabel[ev.status] ?? ev.status} — ${ev.reason.slice(0, 200)}`,
      };
    });
  }

  private flattenEvidence(evaluations: CriterionEvaluation[]) {
    return evaluations.flatMap((ev) =>
      ev.evidence
        .filter((e) => e.sourceText.trim().length > 0)
        .map((e) => ({
          criterion: ev.criterion,
          sourceCategory: e.sourceCategory,
          sourceText: e.sourceText,
          assessment: ev.status.toLowerCase(),
          isRequired: ev.requirementType !== 'PREFERRED',
          score: ev.status === 'FULLY_MET' ? 100 : ev.status === 'PARTIALLY_MET' ? 50 : 0,
        })),
    );
  }

  private computeOverallConfidence(
    evaluations: CriterionEvaluation[],
    uncertainCount: number,
    unverifiedCount: number,
  ): ScreeningConfidence {
    const total = evaluations.length;
    if (total === 0) return ScreeningConfidence.LOW;

    const highCount = evaluations.filter((e) => e.confidence === ScreeningConfidence.HIGH).length;
    const lowCount = evaluations.filter((e) => e.confidence === ScreeningConfidence.LOW).length;

    if (unverifiedCount > 0 || uncertainCount > total * 0.3) return ScreeningConfidence.LOW;
    if (lowCount > total * 0.3) return ScreeningConfidence.LOW;
    if (highCount >= total * 0.6) return ScreeningConfidence.HIGH;
    return ScreeningConfidence.MEDIUM;
  }

  /** Classify SDK/network errors into typed provider errors. */
  private classifyNetworkError(err: unknown): never {
    const sdkErr = err as Record<string, unknown>;

    const isTimeout =
      sdkErr['code'] === 'timeout' ||
      sdkErr['name'] === 'AbortError' ||
      (typeof sdkErr['message'] === 'string' &&
        (sdkErr['message'] as string).toLowerCase().includes('timeout'));
    if (isTimeout) throw new AiScreeningTimeoutError('qwen');

    const status = typeof sdkErr['status'] === 'number' ? sdkErr['status'] : 0;
    if (status === 401 || status === 403) throw new AiScreeningAuthenticationError('qwen');

    if (status === 429) {
      const headers = sdkErr['headers'] as Record<string, unknown> | undefined;
      const retryAfterMs =
        typeof headers?.['retry-after-ms'] === 'string'
          ? parseInt(headers['retry-after-ms'] as string, 10)
          : typeof headers?.['retry-after'] === 'string'
            ? parseInt(headers['retry-after'] as string, 10) * 1000
            : undefined;
      throw new AiScreeningRateLimitError('qwen', isNaN(retryAfterMs ?? NaN) ? undefined : retryAfterMs);
    }

    if (status >= 500) {
      throw new AiScreeningProviderError({
        message: `Qwen/Ollama server error (${status})`,
        safeMessage: 'The AI screening service is temporarily unavailable. Please try again.',
        safeCode: 'PROVIDER_SERVER_ERROR',
        retryable: true,
        providerName: 'qwen',
      });
    }

    // Connection refused — Ollama not running
    const msg = typeof sdkErr['message'] === 'string' ? (sdkErr['message'] as string) : '';
    const isConnectionRefused =
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('connect ECONNREFUSED');
    if (isConnectionRefused) {
      throw new AiScreeningProviderError({
        message: `Qwen/Ollama unreachable: ${msg}`,
        safeMessage:
          'The local AI model service (Ollama) is not reachable. Ensure it is running on the configured URL.',
        safeCode: 'PROVIDER_UNAVAILABLE',
        retryable: true,
        providerName: 'qwen',
      });
    }

    throw new AiScreeningProviderError({
      message: `Qwen provider error: ${msg || 'unknown'}`,
      safeMessage: 'The AI screening provider encountered an unexpected error. Please try again.',
      safeCode: 'PROVIDER_UNEXPECTED_ERROR',
      retryable: true,
      providerName: 'qwen',
    });
  }
}
