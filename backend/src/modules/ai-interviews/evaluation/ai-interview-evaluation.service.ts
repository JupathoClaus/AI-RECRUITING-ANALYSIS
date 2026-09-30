import { Injectable, Logger, ConflictException, NotFoundException, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import * as crypto from 'crypto';
import {
  Prisma,
  AiInterviewEvaluationStatus,
  AiInterviewEvaluationRecommendation,
  AiInterviewTranscriptSegmentType,
  ApplicationAuditEventType,
  ApplicationActorType,
  NotificationType,
} from '@prisma/client';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { InAppNotificationsService } from '@modules/notifications/services/in-app-notifications.service';
import { AiInterviewTranscriptService } from './ai-interview-transcript.service';
import { AiInterviewEvidenceService } from './ai-interview-evidence.service';
import { AiInterviewScoringService } from './ai-interview-scoring.service';
import {
  AI_INTERVIEW_EVALUATION_AI_PROVIDER,
  AiInterviewAiProvider,
} from './ai-interview-ai-provider.token';
import {
  AI_INTERVIEW_EVALUATION_QUEUE,
  AI_INTERVIEW_EVALUATE_JOB,
} from './queue/ai-interview-evaluation-queue.constants';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * AI interview post-interview evaluation. The backend is score authority:
 * - the provider returns per-competency evaluations only — any model-supplied
 *   overall score is dropped at the schema boundary and never reaches here;
 * - competency scores are clamped to the server-derived job rubric and the
 *   backend computes the 0–100 total and the PASS/HOLD/FAIL recommendation;
 * - attempts are immutable history: one attempt row exists per provider run,
 *   created BEFORE the provider is called, and every provider failure records
 *   its own failed attempt with an error code;
 * - evidence is verified against the candidate's own transcript turns and
 *   stores the actual excerpt + segment references for recruiter deep-linking;
 *   fabricated evidence fails the evaluation;
 * - the recruiter always makes the final decision (never the AI).
 * AI failure NEVER produces a synthetic score: the evaluation is recorded as
 * FAILED and a controlled re-evaluation is available.
 */
@Injectable()
export class AiInterviewEvaluationService {
  private readonly logger = new Logger(AiInterviewEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly transcriptService: AiInterviewTranscriptService,
    private readonly evidence: AiInterviewEvidenceService,
    private readonly scoring: AiInterviewScoringService,
    private readonly audit: ApplicationAuditService,
    private readonly notifications: InAppNotificationsService,
    @Inject(AI_INTERVIEW_EVALUATION_AI_PROVIDER)
    private readonly provider: AiInterviewAiProvider,
    @InjectQueue(AI_INTERVIEW_EVALUATION_QUEUE)
    private readonly evaluationQueue: Queue,
  ) {}

  /**
   * Creates/resets the single evaluation for an interview, creates a fresh
   * PENDING attempt (the provider is only ever called after this), and
   * enqueues the worker job. Idempotent: re-invocation while PENDING/RUNNING
   * re-queues (BullMQ jobId dedup) and never starts a second worker or bumps
   * the attempt. A forced re-evaluation of a COMPLETED/FAILED result reuses
   * the same evaluation row (one per interview) and advances the attempt.
   */
  async scheduleEvaluation(
    aiInterviewId: string,
    companyId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<{ evaluationId: string; status: AiInterviewEvaluationStatus }> {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id: aiInterviewId, companyId },
      select: {
        id: true,
        companyId: true,
        applicationId: true,
        status: true,
        transcriptStatus: true,
        evaluationStatus: true,
        transcript: true,
      },
    });
    if (!interview)
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found.',
      });

    if (
      interview.transcriptStatus !== 'READY' ||
      !Array.isArray(interview.transcript) ||
      interview.transcript.length === 0
    ) {
      if (!force) {
        throw new ConflictException({
          code: 'AI_INTERVIEW_EVALUATION_NOT_READY',
          message: 'The interview must be completed with a transcript before it can be evaluated.',
        });
      }
    }

    const application = await this.prisma.application.findUnique({
      where: { id: interview.applicationId },
      select: { id: true, candidateId: true, jobId: true },
    });
    if (!application)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found.',
      });

    const latest = await this.prisma.aiInterviewEvaluation.findUnique({
      where: { aiInterviewId },
    });
    if (latest && !force) {
      if (
        latest.status === AiInterviewEvaluationStatus.PENDING ||
        latest.status === AiInterviewEvaluationStatus.RUNNING
      ) {
        await this.enqueue(latest.id, interview.id, companyId, latest.attempt);
        return { evaluationId: latest.id, status: latest.status };
      }
      if (latest.status === AiInterviewEvaluationStatus.COMPLETED) {
        return { evaluationId: latest.id, status: latest.status };
      }
    }
    if (latest && force) {
      if (
        latest.status === AiInterviewEvaluationStatus.PENDING ||
        latest.status === AiInterviewEvaluationStatus.RUNNING
      ) {
        await this.enqueue(latest.id, interview.id, companyId, latest.attempt);
        return { evaluationId: latest.id, status: latest.status };
      }
    }

    const attempt = (latest?.attempt ?? 0) + 1;

    try {
      const evaluation = await this.prisma.$transaction(async (tx) => {
        let row: { id: string; attempt: number };
        if (latest) {
          row = await tx.aiInterviewEvaluation.update({
            where: { id: latest.id },
            data: {
              attempt,
              status: AiInterviewEvaluationStatus.PENDING,
              startedAt: null,
              completedAt: null,
              inputFingerprint: null,
              latencyMs: null,
              responseId: null,
              totalScore: null,
              recommendation: null,
              confidence: null,
              summary: null,
              strengths: Prisma.JsonNull,
              gaps: Prisma.JsonNull,
              uncertainties: Prisma.JsonNull,
              provider: null,
              model: null,
              promptVersion: null,
              schemaVersion: null,
              evidenceTotals: Prisma.JsonNull,
              failureCode: null,
              failureMessageSafe: null,
            },
            select: { id: true, attempt: true },
          });
          await tx.aiInterviewEvidence.deleteMany({
            where: { competencyEvaluation: { evaluationId: latest.id } },
          });
          await tx.aiInterviewCompetencyEvaluation.deleteMany({
            where: { evaluationId: latest.id },
          });
        } else {
          row = await tx.aiInterviewEvaluation.create({
            data: {
              aiInterviewId: interview.id,
              companyId,
              applicationId: application.id,
              candidateId: application.candidateId,
              jobId: application.jobId,
              attempt,
              status: AiInterviewEvaluationStatus.PENDING,
            },
            select: { id: true, attempt: true },
          });
        }
        await tx.aiInterviewEvaluationAttempt.create({
          data: {
            evaluationId: row.id,
            aiInterviewId: interview.id,
            companyId,
            attempt: row.attempt,
            status: AiInterviewEvaluationStatus.PENDING,
          },
        });
        return row;
      });

      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: {
          evaluationStatus: AiInterviewEvaluationStatus.PENDING,
          evaluationAttemptCount: attempt,
        },
      });
      await this.enqueue(evaluation.id, interview.id, companyId, evaluation.attempt);
      return { evaluationId: evaluation.id, status: AiInterviewEvaluationStatus.PENDING };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        latest
      ) {
        const existing = await this.prisma.aiInterviewEvaluation.findUnique({
          where: { id: latest.id },
        });
        if (existing) {
          await this.enqueue(existing.id, interview.id, companyId, existing.attempt);
          return { evaluationId: existing.id, status: existing.status };
        }
      }
      throw error;
    }
  }

  /** Processor entry point: runs one evaluation attempt to completion or throws. */
  async evaluateAttempt(evaluationId: string): Promise<void> {
    const evaluation = await this.prisma.aiInterviewEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) throw new NotFoundException({ code: 'EVALUATION_NOT_FOUND' });
    if (evaluation.status === AiInterviewEvaluationStatus.COMPLETED) return;

    const claimed = await this.prisma.aiInterviewEvaluation.updateMany({
      where: {
        id: evaluationId,
        status: { in: [AiInterviewEvaluationStatus.PENDING, AiInterviewEvaluationStatus.RUNNING] },
      },
      data: { status: AiInterviewEvaluationStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: 'EVALUATION_CLAIMED',
        message: 'Evaluation already handled by another worker.',
      });
    }

    await this.prisma.aiInterviewEvaluationAttempt.updateMany({
      where: {
        evaluationId,
        attempt: evaluation.attempt,
        status: AiInterviewEvaluationStatus.PENDING,
      },
      data: { status: AiInterviewEvaluationStatus.RUNNING, startedAt: new Date() },
    });

    const { input, transcript } = await this.transcriptService.buildEvaluationInput(
      evaluation.aiInterviewId,
    );

    const fingerprint = this.fingerprint(evaluation.aiInterviewId, input);
    await this.prisma.aiInterviewEvaluation.update({
      where: { id: evaluationId },
      data: { inputFingerprint: fingerprint },
    });

    const started = Date.now();
    const timeoutMs = this.configService.get<number>('aiInterviewEvaluation.timeoutMs') || 60000;
    const result = await this.provider.evaluate(input, {
      timeoutMs,
      requestId: evaluationId,
    });
    const latencyMs = Date.now() - started;

    const rubricById = new Map(
      input.competencies.map((c) => [c.competency, { maxScore: c.maxScore, weight: c.weight }]),
    );
    const userSegments = transcript.segments.filter(
      (s) => s.segmentType === AiInterviewTranscriptSegmentType.USER && !s.hidden && s.textRaw,
    );
    let fabricated = false;
    const scored: {
      competency: string;
      status: string;
      score: number;
      maxScore: number;
      weight: number;
      confidence: string;
      rationale: string;
      checks: {
        quote: string;
        verification: string;
        excerpt: string | null;
        transcriptId: string | null;
        segmentIndexes: number[];
        startSeconds: number | null;
        endSeconds: number | null;
      }[];
    }[] = [];

    for (const ce of result.output.competencyEvaluations) {
      const rubric = rubricById.get(ce.competency);
      if (!rubric) continue; // unreachable post-validation; defense in depth
      const clamped = round2(Math.min(Math.max(0, ce.score), rubric.maxScore));
      const checks = this.evidence.verifyAgainstSegments(
        ce.evidence,
        userSegments,
        transcript.transcriptId,
      );
      if (this.evidence.hasFabricatedEvidence(checks)) fabricated = true;
      scored.push({
        competency: ce.competency,
        status: ce.status,
        score: clamped,
        maxScore: rubric.maxScore,
        weight: rubric.weight,
        confidence: ce.confidence,
        rationale: ce.rationale,
        checks: checks.map((c) => ({
          quote: c.quote,
          verification: c.verification,
          excerpt: c.excerpt,
          transcriptId: c.transcriptId,
          segmentIndexes: c.segmentIndexes,
          startSeconds: c.startSeconds,
          endSeconds: c.endSeconds,
        })),
      });
    }

    if (fabricated) {
      await this.failTerminal(
        evaluationId,
        'FABRICATED_EVIDENCE',
        'AI evaluation quoted evidence not present in the candidate transcript.',
      );
      await this.finalize({
        evaluationId,
        ai: null,
        note: 'AI evaluation rejected: fabricated evidence. No score was computed; re-evaluation is available.',
      });
      return;
    }

    if (scored.length === 0) {
      await this.failTerminal(
        evaluationId,
        'MALFORMED_RESPONSE',
        'AI provider returned no competency evaluations for scoring.',
      );
      await this.finalize({
        evaluationId,
        ai: null,
        note: 'AI evaluation malformed: no competency evaluations. No score was computed; re-evaluation is available.',
      });
      return;
    }

    const scoreResult = this.scoring.score(
      scored.map((s) => ({
        competency: s.competency,
        status: s.status as never,
        score: s.score,
        maxScore: s.maxScore,
        weight: s.weight,
        confidence: s.confidence as never,
        rationale: s.rationale,
        evidence: s.checks.map((c) => ({ quote: c.quote, verification: c.verification as never })),
      })),
    );

    await this.finalize({
      evaluationId,
      ai: {
        summary: result.output.summary,
        strengths: Array.isArray(result.output.strengths) ? result.output.strengths : [],
        gaps: Array.isArray(result.output.gaps) ? result.output.gaps : [],
        uncertainties: Array.isArray(result.output.uncertainties)
          ? result.output.uncertainties
          : [],
        provider: result.metadata.provider,
        model: result.metadata.model,
        promptVersion: result.metadata.promptVersion,
        latencyMs,
        responseId: result.metadata.responseId,
      },
      latencyMs,
      scoreResult,
      scored,
      recommendation: scoreResult.recommendation,
      completedAt: new Date(),
    });
  }

  async failTerminal(evaluationId: string, code: string, message: string): Promise<void> {
    const evaluation = await this.prisma.aiInterviewEvaluation.findUnique({
      where: { id: evaluationId },
      select: { aiInterviewId: true, attempt: true },
    });
    if (!evaluation) return;

    const data = {
      status: AiInterviewEvaluationStatus.FAILED,
      failureCode: code,
      failureMessageSafe: message.slice(0, 1000),
      completedAt: new Date(),
    };
    await this.prisma.aiInterviewEvaluation.updateMany({
      where: {
        id: evaluationId,
        status: { in: [AiInterviewEvaluationStatus.PENDING, AiInterviewEvaluationStatus.RUNNING] },
      },
      data,
    });
    await this.prisma.aiInterviewEvaluationAttempt.updateMany({
      where: { evaluationId, attempt: evaluation.attempt },
      data,
    });
    await this.prisma.aiInterview.update({
      where: { id: evaluation.aiInterviewId },
      data: { evaluationStatus: AiInterviewEvaluationStatus.FAILED },
    });
    this.logger.warn(`AI interview evaluation ${evaluationId} failed terminally: ${code}`);
  }

  /** Recruiter decision — the AI never decides; this is the only place the decision is set. */
  async recordDecision(
    aiInterviewId: string,
    companyId: string,
    decision: AiInterviewEvaluationRecommendation,
    note: string | null,
    actor: { userId: string; membershipId: string },
  ) {
    const evaluation = await this.prisma.aiInterviewEvaluation.findFirst({
      where: { aiInterviewId, companyId },
    });
    if (!evaluation) {
      throw new NotFoundException({
        code: 'EVALUATION_NOT_FOUND',
        message: 'No evaluation found for this interview.',
      });
    }
    const updated = await this.prisma.aiInterviewEvaluation.update({
      where: { id: evaluation.id },
      data: {
        recruiterDecision: decision,
        decidedByMembershipId: actor.membershipId,
        decidedAt: new Date(),
        decisionNote: note?.slice(0, 2000) ?? null,
      },
    });
    await this.audit.record({
      companyId,
      eventType: ApplicationAuditEventType.AI_INTERVIEW_REVIEWED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AiInterviewEvaluation',
      entityId: evaluation.id,
      description: `Recruiter decision for AI interview: ${decision}`,
      applicationId: updated.applicationId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return updated;
  }

  // ── Internals ────────────────────────────────────────────────

  /** Recruiter-facing evaluation report for an interview (tenant-scoped). */
  async getForInterview(aiInterviewId: string, companyId: string) {
    const evaluation = await this.prisma.aiInterviewEvaluation.findFirst({
      where: { aiInterviewId, companyId },
      include: {
        competencyEvaluations: {
          orderBy: { sortOrder: 'asc' },
          include: { evidence: { orderBy: { createdAt: 'asc' } } },
        },
        attempts: {
          orderBy: { attempt: 'desc' },
          take: 20,
        },
      },
    });
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id: aiInterviewId, companyId },
      select: {
        id: true,
        status: true,
        transcriptStatus: true,
        evaluationStatus: true,
        transcript: true,
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found.',
      });
    }
    return {
      interviewStatus: interview.status,
      transcriptStatus: interview.transcriptStatus,
      evaluationStatus: evaluation?.status ?? 'NOT_REQUESTED',
      evaluationCount: await this.prisma.aiInterviewEvaluation.count({
        where: { aiInterviewId, companyId },
      }),
      report: evaluation
        ? {
            id: evaluation.id,
            status: evaluation.status,
            attempt: evaluation.attempt,
            totalScore: evaluation.totalScore,
            maximumScore: evaluation.maximumScore,
            recommendation: evaluation.recommendation,
            confidence: evaluation.confidence,
            summary: evaluation.summary,
            strengths: Array.isArray(evaluation.strengths) ? evaluation.strengths : [],
            gaps: Array.isArray(evaluation.gaps) ? evaluation.gaps : [],
            uncertainties: Array.isArray(evaluation.uncertainties) ? evaluation.uncertainties : [],
            provider: evaluation.provider,
            model: evaluation.model,
            promptVersion: evaluation.promptVersion,
            schemaVersion: evaluation.schemaVersion,
            inputFingerprint: evaluation.inputFingerprint,
            latencyMs: evaluation.latencyMs,
            responseId: evaluation.responseId,
            evidenceTotals: (evaluation.evidenceTotals as Record<string, number> | null) ?? null,
            failureCode: evaluation.failureCode,
            failureMessageSafe: evaluation.failureMessageSafe,
            startedAt: evaluation.startedAt,
            completedAt: evaluation.completedAt,
            recruiterDecision: evaluation.recruiterDecision,
            decidedByMembershipId: evaluation.decidedByMembershipId,
            decidedAt: evaluation.decidedAt,
            decisionNote: evaluation.decisionNote,
            competencies: evaluation.competencyEvaluations.map((c) => ({
              competency: c.competency,
              status: c.status,
              score: c.score,
              maxScore: c.maxScore,
              weight: c.weight,
              confidence: c.confidence,
              rationale: c.rationale,
              sortOrder: c.sortOrder,
              evidence: c.evidence.map((e) => ({
                quote: e.quote,
                verification: e.verification,
                excerpt: e.excerpt,
                transcriptId: e.transcriptId,
                segmentIndexes: Array.isArray(e.segmentIndexes) ? e.segmentIndexes : [],
                startSeconds: e.startSeconds,
                endSeconds: e.endSeconds,
                sourceSegmentIndex: e.sourceSegmentIndex,
                sourceSeconds: e.sourceSeconds,
              })),
            })),
          }
        : null,
      attempts:
        evaluation?.attempts.map((a) => ({
          id: a.id,
          attempt: a.attempt,
          status: a.status,
          provider: a.provider,
          model: a.model,
          promptVersion: a.promptVersion,
          latencyMs: a.latencyMs,
          responseId: a.responseId,
          failureCode: a.failureCode,
          failureMessageSafe: a.failureMessageSafe,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
        })) ?? [],
    };
  }

  /** Recruiter-triggered re-evaluation: new attempt, history preserved. */
  async reEvaluate(
    aiInterviewId: string,
    companyId: string,
    actor: { userId: string; membershipId: string },
  ) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id: aiInterviewId, companyId },
      select: {
        id: true,
        companyId: true,
        applicationId: true,
        status: true,
        transcriptStatus: true,
        transcript: true,
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found.',
      });
    }
    if (interview.status !== 'COMPLETED') {
      throw new ConflictException({
        code: 'EVALUATION_NOT_RETRYABLE',
        message: 'Only completed interviews can be re-evaluated.',
      });
    }
    if (
      interview.transcriptStatus !== 'READY' ||
      !Array.isArray(interview.transcript) ||
      interview.transcript.length === 0
    ) {
      throw new ConflictException({
        code: 'EVALUATION_NOT_RETRYABLE',
        message: 'The interview has no transcript to evaluate.',
      });
    }

    const scheduled = await this.scheduleEvaluation(interview.id, companyId, { force: true });
    await this.audit.record({
      companyId,
      eventType: ApplicationAuditEventType.AI_INTERVIEW_EVALUATED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AiInterviewEvaluation',
      entityId: scheduled.evaluationId,
      description: 'AI interview re-evaluation requested.',
      applicationId: interview.applicationId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return scheduled;
  }

  // ── Internals ────────────────────────────────────────────────

  private async enqueue(
    evaluationId: string,
    aiInterviewId: string,
    companyId: string,
    attempt: number,
  ): Promise<void> {
    const jobId = `${evaluationId}-${attempt}`;
    const existing = await this.evaluationQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') return;
      await existing.remove().catch(() => undefined);
    }
    await this.evaluationQueue.add(
      AI_INTERVIEW_EVALUATE_JOB,
      { evaluationId, aiInterviewId, companyId },
      { jobId, removeOnComplete: 100, removeOnFail: 50 },
    );
  }

  private fingerprint(
    aiInterviewId: string,
    input: { candidateResponseText: string; transcript: unknown; competencies: unknown },
  ): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          v: aiInterviewId,
          r: crypto.createHash('sha256').update(input.candidateResponseText).digest('hex'),
          t: crypto.createHash('sha256').update(JSON.stringify(input.transcript)).digest('hex'),
          c: JSON.stringify(input.competencies),
        }),
      )
      .digest('hex');
  }

  private async finalize(args: {
    evaluationId: string;
    ai: {
      summary: string;
      strengths: string[];
      gaps: string[];
      uncertainties: string[];
      provider: string;
      model?: string;
      promptVersion: string;
      latencyMs: number;
      responseId?: string;
    } | null;
    scoreResult?: {
      totalScore: number;
      maximumScore: number;
      recommendation: AiInterviewEvaluationRecommendation;
      evidenceTotals: Record<string, number>;
    };
    scored?: {
      competency: string;
      status: string;
      score: number;
      maxScore: number;
      weight: number;
      confidence: string;
      rationale: string;
      checks: {
        quote: string;
        verification: string;
        excerpt: string | null;
        transcriptId: string | null;
        segmentIndexes: number[];
        startSeconds: number | null;
        endSeconds: number | null;
      }[];
    }[];
    recommendation?: AiInterviewEvaluationRecommendation;
    latencyMs?: number;
    completedAt?: Date;
    note?: string;
  }): Promise<void> {
    const { evaluationId, ai, scored, recommendation, completedAt } = args;
    const evaluation = await this.prisma.aiInterviewEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) return;

    const now = completedAt ?? new Date();
    const reportData = ai
      ? {
          status: AiInterviewEvaluationStatus.COMPLETED,
          totalScore: args.scoreResult?.totalScore ?? null,
          maximumScore: args.scoreResult?.maximumScore ?? evaluation.maximumScore,
          recommendation: recommendation ?? null,
          confidence: this.overallConfidence(scored),
          summary: args.ai?.summary ?? null,
          strengths: (args.ai?.strengths ?? []) as Prisma.InputJsonValue,
          gaps: (args.ai?.gaps ?? []) as Prisma.InputJsonValue,
          uncertainties: [
            ...(args.ai?.uncertainties ?? []),
            ...(args.note ? [args.note] : []),
          ] as Prisma.InputJsonValue,
          provider: args.ai?.provider ?? null,
          model: args.ai?.model ?? null,
          promptVersion: args.ai?.promptVersion ?? null,
          schemaVersion: 'v1',
          latencyMs: args.latencyMs ?? null,
          responseId: args.ai?.responseId ?? null,
          evidenceTotals: (args.scoreResult?.evidenceTotals ?? {}) as Prisma.InputJsonValue,
          failureCode: null,
          failureMessageSafe: null,
          completedAt: now,
        }
      : {
          status: AiInterviewEvaluationStatus.FAILED,
          uncertainties: [
            args.note ?? 'Evaluation failed; no score was computed.',
          ] as Prisma.InputJsonValue,
          completedAt: now,
        };

    await this.prisma.$transaction(async (tx) => {
      await tx.aiInterviewEvaluation.update({ where: { id: evaluationId }, data: reportData });
      await tx.aiInterviewEvaluationAttempt.updateMany({
        where: { evaluationId, attempt: evaluation.attempt },
        data: {
          status: reportData.status as AiInterviewEvaluationStatus,
          provider: reportData.provider ?? null,
          model: reportData.model ?? null,
          promptVersion: reportData.promptVersion ?? null,
          schemaVersion: 'v1',
          inputFingerprint: evaluation.inputFingerprint ?? null,
          latencyMs: reportData.latencyMs ?? null,
          responseId: reportData.responseId ?? null,
          output: ai
            ? ({
                summary: args.ai?.summary ?? '',
                strengths: args.ai?.strengths ?? [],
                gaps: args.ai?.gaps ?? [],
                uncertainties: args.ai?.uncertainties ?? [],
              } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          failureCode: reportData.failureCode ?? undefined,
          failureMessageSafe: reportData.failureMessageSafe ?? undefined,
          startedAt: evaluation.startedAt ?? now,
          completedAt: now,
        },
      });
      await tx.aiInterview.update({
        where: { id: evaluation.aiInterviewId },
        data: { evaluationStatus: reportData.status as AiInterviewEvaluationStatus },
      });

      if (ai && scored) {
        await tx.aiInterviewCompetencyEvaluation.deleteMany({
          where: { evaluationId },
        });
        await tx.aiInterviewEvidence.deleteMany({
          where: { competencyEvaluation: { evaluationId } },
        });
        let sortOrder = 0;
        for (const s of scored) {
          const comp = await tx.aiInterviewCompetencyEvaluation.create({
            data: {
              evaluationId,
              competency: s.competency,
              status: s.status as never,
              score: s.score,
              maxScore: s.maxScore,
              weight: s.weight,
              confidence: s.confidence as never,
              rationale: s.rationale,
              sortOrder: sortOrder++,
            },
          });
          for (const check of s.checks) {
            await tx.aiInterviewEvidence.create({
              data: {
                competencyEvaluationId: comp.id,
                quote: check.quote,
                verification: check.verification as never,
                excerpt: check.excerpt,
                transcriptId: check.transcriptId,
                segmentIndexes: check.segmentIndexes,
                startSeconds: check.startSeconds,
                endSeconds: check.endSeconds,
                sourceSegmentIndex:
                  check.segmentIndexes.length > 0 ? check.segmentIndexes[0] : null,
                sourceSeconds: check.startSeconds,
              },
            });
          }
        }
      }
    });

    await this.audit.record({
      companyId: evaluation.companyId,
      eventType: ApplicationAuditEventType.AI_INTERVIEW_EVALUATED,
      actorType: ApplicationActorType.SYSTEM,
      entityType: 'AiInterviewEvaluation',
      entityId: evaluationId,
      description: ai
        ? `AI interview evaluated: ${args.scoreResult?.totalScore ?? 0}/100 (${recommendation ?? 'n/a'} for recruiter review)`
        : 'AI interview evaluation failed: no score computed.',
      applicationId: evaluation.applicationId,
      candidateId: evaluation.candidateId,
    });
    if (ai) {
      await this.notifyAssignees(evaluation, args.scoreResult?.totalScore ?? 0);
    }
  }

  private overallConfidence(scored?: { confidence: string }[]): 'HIGH' | 'MEDIUM' | 'LOW' | null {
    if (!scored || scored.length === 0) return null;
    if (scored.every((s) => s.confidence === 'HIGH')) return 'HIGH';
    if (scored.every((s) => s.confidence === 'LOW')) return 'LOW';
    return 'MEDIUM';
  }

  private async notifyAssignees(
    evaluation: {
      companyId: string;
      applicationId: string;
      aiInterviewId: string;
    },
    totalScore: number,
  ): Promise<void> {
    try {
      const assignees = await this.prisma.applicationAssignment.findMany({
        where: { applicationId: evaluation.applicationId, removedAt: null },
        include: { membership: { select: { userId: true } } },
      });
      const userIds = [...new Set(assignees.map((a) => a.membership.userId))];
      for (const userId of userIds) {
        try {
          await this.notifications.create({
            userId,
            companyId: evaluation.companyId,
            type: NotificationType.AI_INTERVIEW_EVALUATED,
            title: 'AI interview evaluated',
            body: `The AI interview report scored ${totalScore}/100. Review the competency breakdown and decide next steps.`,
            relatedEntityType: 'AiInterview',
            relatedEntityId: evaluation.aiInterviewId,
            actionUrl: `/ai-interviews`,
          });
        } catch (error) {
          this.logger.debug(`Skipping notification for ${userId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to notify interview assignees: ${(error as Error).message}`);
    }
  }
}
