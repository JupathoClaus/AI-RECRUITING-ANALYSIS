import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  Prisma,
  AssessmentQuestionType,
  AssessmentSessionStatus,
  AssessmentAssignmentStatus,
  AssessmentEvaluationStatus,
  ApplicationAuditEventType,
  ApplicationActorType,
  NotificationType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { InAppNotificationsService } from '@modules/notifications/services/in-app-notifications.service';
import { AssessmentScoringService } from './assessment-scoring.service';
import { AssessmentEvidenceService } from '../ai/assessment-evidence.service';
import { ASSESSMENT_AI_PROVIDER, AssessmentAiProvider } from '../ai/assessment-ai-provider.token';
import { ASSESSMENT_QUEUE, ASSESSMENT_EVALUATE_JOB } from '../queue/assessment-queue.constants';

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface LoadedSession {
  id: string;
  companyId: string;
  applicationId: string;
  assignmentId: string;
  assignment: {
    id: string;
    versionId: string;
    version: {
      versionNumber: number;
      contentHash: string | null;
      assessment: { id: string; name: string; passingScore: number | null };
    };
  };
  application: { id: string; candidateId: string };
}

/**
 * Assessment evaluation. The backend is score authority:
 * - objective questions are scored deterministically (never by the model);
 * - the model returns per-criterion rubric evaluations only — any
 *   model-supplied overall score is dropped at the schema boundary;
 * - criterion scores are clamped to the recruiter-approved rubric ranges and
 *   weighted by the backend, which computes the final 0–100 total.
 * AI failures never destroy the submission: deterministic results persist and
 * the failure is recorded with a controlled retry path.
 */
@Injectable()
export class AssessmentEvaluationService {
  private readonly logger = new Logger(AssessmentEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly scoring: AssessmentScoringService,
    private readonly evidence: AssessmentEvidenceService,
    private readonly audit: ApplicationAuditService,
    private readonly notifications: InAppNotificationsService,
    @Inject(ASSESSMENT_AI_PROVIDER) private readonly provider: AssessmentAiProvider,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly assessmentQueue: Queue,
  ) {}

  async enqueueEvaluation(
    evaluationId: string,
    sessionId: string,
    companyId: string,
  ): Promise<void> {
    const existing = await this.assessmentQueue.getJob(evaluationId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') return;
    }
    await this.assessmentQueue.add(
      ASSESSMENT_EVALUATE_JOB,
      { evaluationId, sessionId, companyId },
      { jobId: evaluationId, removeOnComplete: 100, removeOnFail: 50 },
    );
  }

  /** Processor entry point: runs one evaluation attempt to completion or throws. */
  async evaluateAttempt(evaluationId: string): Promise<void> {
    const evaluation = await this.prisma.assessmentEvaluation.findUnique({
      where: { id: evaluationId },
      include: { session: true },
    });
    if (!evaluation) {
      throw new NotFoundException({
        code: 'EVALUATION_NOT_FOUND',
        message: 'Evaluation not found.',
      });
    }
    if (evaluation.status === AssessmentEvaluationStatus.COMPLETED) return;

    const claimed = await this.prisma.assessmentEvaluation.updateMany({
      where: {
        id: evaluationId,
        status: { in: [AssessmentEvaluationStatus.PENDING, AssessmentEvaluationStatus.RUNNING] },
      },
      data: { status: AssessmentEvaluationStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: 'EVALUATION_CLAIMED',
        message: 'Evaluation already handled by another worker.',
      });
    }

    const session = await this.loadSessionTree(evaluation.sessionId, evaluation.companyId);
    const tree = await this.loadVersionTree(session.assignment.versionId);

    const det = this.scoring.scoreDeterministic(
      tree.questions.map((q) => ({
        id: q.id,
        type: q.type,
        points: q.points,
        competency: q.competency,
        options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      })),
      await this.loadScoringResponses(session.id),
    );
    const detByQuestion = new Map(det.questions.map((q) => [q.questionId, q]));

    const aiQuestions = tree.questions.filter(
      (q) =>
        (q.type === AssessmentQuestionType.SHORT_TEXT ||
          q.type === AssessmentQuestionType.LONG_TEXT) &&
        q.aiEvaluated,
    );

    if (aiQuestions.length === 0) {
      await this.finalize({
        session,
        det,
        detByQuestion,
        ai: null,
        evaluationId,
        note: 'No AI-evaluated questions; deterministic score is final.',
      });
      return;
    }

    const responsesByQuestion = await this.responseTextMap(session.id);
    const fingerprint = this.fingerprint(session, tree, responsesByQuestion);
    await this.prisma.assessmentEvaluation.update({
      where: { id: evaluationId },
      data: { inputFingerprint: fingerprint },
    });

    // Provider call — retryable errors propagate to the processor (BullMQ
    // retry); schema-invalid output fails terminally below.
    const started = Date.now();
    const timeoutMs = this.configService.get<number>('assessment.aiTimeoutMs') || 60000;
    const result = await this.provider.evaluate(
      {
        assessmentName: session.assignment.version.assessment.name,
        questions: aiQuestions.map((q) => ({
          questionId: q.id,
          prompt: q.prompt,
          competency: q.competency,
          responseText: responsesByQuestion.get(q.id) ?? '',
          rubric: q.rubricCriteria.map((c) => ({
            criterionId: c.id,
            name: c.name,
            description: c.description,
            guidance: c.guidance,
            maxScore: c.maxScore,
          })),
        })),
      },
      { timeoutMs, requestId: evaluationId },
    );
    const latencyMs = Date.now() - started;

    // Backend score authority: clamp to rubric, verify evidence, weight here.
    const rubricById = new Map<string, { maxScore: number; weight: number; questionId: string }>();
    for (const q of aiQuestions) {
      for (const c of q.rubricCriteria)
        rubricById.set(c.id, { maxScore: c.maxScore, weight: c.weight ?? 1, questionId: q.id });
    }
    let fabricated = false;
    const aiByQuestion = new Map<
      string,
      { score: number; max: number; criteria: Record<string, unknown>[] }
    >();
    for (const qe of result.output.questionEvaluations) {
      let qScore = 0;
      let qMax = 0;
      const criteriaOut: Record<string, unknown>[] = [];
      for (const c of qe.criteria) {
        const rubric = rubricById.get(c.criterionId);
        if (!rubric) continue; // cannot happen post-validation; defense in depth
        const clamped = Math.min(Math.max(0, c.score), rubric.maxScore);
        const checks = this.evidence.verifyAll(
          c.evidence,
          responsesByQuestion.get(qe.questionId) ?? '',
        );
        if (this.evidence.hasFabricatedEvidence(checks)) fabricated = true;
        qScore += clamped * rubric.weight;
        qMax += rubric.maxScore * rubric.weight;
        criteriaOut.push({
          criterionId: c.criterionId,
          status: c.status,
          score: round2(clamped),
          maxScore: rubric.maxScore,
          weight: rubric.weight,
          evidence: checks.map((e) => ({ quote: e.quote, verification: e.verification })),
          rationale: c.rationale,
          confidence: c.confidence,
        });
      }
      aiByQuestion.set(qe.questionId, {
        score: round2(qScore),
        max: round2(qMax),
        criteria: criteriaOut,
      });
    }

    if (fabricated) {
      await this.failTerminal(
        evaluationId,
        'FABRICATED_EVIDENCE',
        'AI evaluation quoted evidence not present in candidate responses.',
      );
      await this.finalize({
        session,
        det,
        detByQuestion,
        ai: null,
        evaluationId: null,
        note: 'AI evaluation rejected: fabricated evidence. Deterministic score preserved; retry available.',
      });
      return;
    }

    await this.prisma.assessmentEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: AssessmentEvaluationStatus.COMPLETED,
        provider: result.metadata.provider,
        model: result.metadata.model ?? null,
        promptVersion: result.metadata.promptVersion,
        schemaVersion: result.metadata.schemaVersion,
        latencyMs: result.metadata.latencyMs ?? latencyMs,
        responseId: result.metadata.responseId ?? null,
        output: result.output as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    await this.finalize({
      session,
      det,
      detByQuestion,
      ai: {
        byQuestion: aiByQuestion,
        strengths: result.output.strengths,
        gaps: result.output.gaps,
        uncertainties: result.output.uncertainties,
      },
      evaluationId,
    });
  }

  /** Permanent failure path: records the failure but preserves the submission with deterministic scoring. */
  async failTerminal(evaluationId: string, code: string, message: string): Promise<void> {
    await this.prisma.assessmentEvaluation.updateMany({
      where: {
        id: evaluationId,
        status: { in: [AssessmentEvaluationStatus.PENDING, AssessmentEvaluationStatus.RUNNING] },
      },
      data: {
        status: AssessmentEvaluationStatus.FAILED,
        failureCode: code,
        failureMessageSafe: message.slice(0, 1000),
        completedAt: new Date(),
      },
    });
    this.logger.warn(`Assessment evaluation ${evaluationId} failed terminally: ${code}`);
  }

  /** Recruiter-triggered re-evaluation: new attempt, history preserved. */
  async retry(
    sessionId: string,
    companyId: string,
    actor: { userId: string; membershipId: string },
  ) {
    const session = await this.prisma.assessmentSession.findFirst({
      where: { id: sessionId, companyId },
      include: { evaluations: { orderBy: { attempt: 'desc' }, take: 1 } },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Assessment session not found.',
      });
    }
    if (
      session.status !== AssessmentSessionStatus.SUBMITTED &&
      session.status !== AssessmentSessionStatus.EVALUATING &&
      session.status !== AssessmentSessionStatus.EVALUATED
    ) {
      throw new ConflictException({
        code: 'EVALUATION_NOT_RETRYABLE',
        message: 'Only submitted sessions can be re-evaluated.',
      });
    }
    const latest = session.evaluations[0];
    if (
      latest &&
      (latest.status === AssessmentEvaluationStatus.PENDING ||
        latest.status === AssessmentEvaluationStatus.RUNNING)
    ) {
      await this.enqueueEvaluation(latest.id, session.id, companyId);
      return latest;
    }
    const attempt = (latest?.attempt ?? 0) + 1;
    const created = await this.prisma.assessmentEvaluation.create({
      data: {
        sessionId: session.id,
        companyId,
        attempt,
        status: AssessmentEvaluationStatus.PENDING,
      },
    });
    await this.prisma.assessmentSession.updateMany({
      where: { id: session.id, status: AssessmentSessionStatus.EVALUATED },
      data: { status: AssessmentSessionStatus.EVALUATING },
    });
    await this.enqueueEvaluation(created.id, session.id, companyId);
    await this.audit.record({
      companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_REVIEWED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AssessmentSession',
      entityId: session.id,
      description: `Assessment re-evaluation requested (attempt ${attempt})`,
      applicationId: session.applicationId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    this.logger.log(
      `Re-evaluation queued for session ${session.id} (attempt ${attempt}) by ${actor.membershipId}`,
    );
    return created;
  }

  // ── Internals ────────────────────────────────────────────────

  private async loadSessionTree(sessionId: string, companyId: string): Promise<LoadedSession> {
    const session = await this.prisma.assessmentSession.findFirst({
      where: { id: sessionId, companyId },
      include: {
        assignment: {
          include: {
            version: {
              include: { assessment: { select: { id: true, name: true, passingScore: true } } },
            },
          },
        },
        application: { select: { id: true, candidateId: true } },
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Assessment session not found.',
      });
    }
    return session as unknown as LoadedSession;
  }

  private async loadVersionTree(versionId: string) {
    return this.prisma.assessmentVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
            rubricCriteria: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }

  private async loadScoringResponses(sessionId: string) {
    const responses = await this.prisma.assessmentResponse.findMany({ where: { sessionId } });
    return responses.map((r) => ({
      questionId: r.questionId,
      selectedOptionIds: Array.isArray(r.selectedOptionIds)
        ? (r.selectedOptionIds as string[])
        : [],
    }));
  }

  private async responseTextMap(sessionId: string): Promise<Map<string, string>> {
    const responses = await this.prisma.assessmentResponse.findMany({ where: { sessionId } });
    return new Map(responses.map((r) => [r.questionId, r.textAnswer ?? '']));
  }

  private fingerprint(
    session: LoadedSession,
    tree: { contentHash: string | null; id: string },
    responses: Map<string, string>,
  ): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          v: tree.contentHash ?? tree.id,
          r: [...responses.entries()]
            .sort()
            .map(([k, v]) => [k, crypto.createHash('sha256').update(v).digest('hex')]),
          s: session.id,
        }),
      )
      .digest('hex');
  }

  private async finalize(args: {
    session: LoadedSession;
    det: { totalScore: number; totalMax: number };
    detByQuestion: Map<string, { score: number; max: number; competency?: string | null }>;
    ai: {
      byQuestion: Map<string, { score: number; max: number; criteria: Record<string, unknown>[] }>;
      strengths: string[];
      gaps: string[];
      uncertainties: string[];
    } | null;
    evaluationId: string | null;
    note?: string;
  }): Promise<void> {
    const { session, det, detByQuestion, ai } = args;
    const tree = await this.loadVersionTree(session.assignment.versionId);

    let aiScore = 0;
    let aiMax = 0;
    const questionBreakdown: Record<string, unknown>[] = [];
    const competencyAgg = new Map<string, { score: number; max: number }>();

    for (const q of tree.questions) {
      const d = detByQuestion.get(q.id) ?? {
        score: 0,
        max: q.points ?? 0,
        competency: q.competency,
      };
      const a = ai?.byQuestion.get(q.id);
      const qMax = d.max + (a?.max ?? 0);
      const qScore = round2(d.score + (a?.score ?? 0));
      aiScore += a?.score ?? 0;
      aiMax += a?.max ?? 0;
      questionBreakdown.push({
        questionId: q.id,
        type: q.type,
        competency: q.competency,
        deterministicScore: d.score,
        deterministicMax: d.max,
        aiScore: a?.score ?? null,
        aiMax: a?.max ?? null,
        score: qScore,
        max: round2(qMax),
        criteria: a?.criteria ?? [],
      });
      if (q.competency) {
        const agg = competencyAgg.get(q.competency) ?? { score: 0, max: 0 };
        agg.score = round2(agg.score + qScore);
        agg.max = round2(agg.max + qMax);
        competencyAgg.set(q.competency, agg);
      }
    }

    const grandMax = round2(det.totalMax + aiMax);
    const grandScore = round2(det.totalScore + aiScore);
    const totalScore = grandMax > 0 ? round2((grandScore / grandMax) * 100) : 0;
    const uncertainties = [...(ai?.uncertainties ?? [])];
    if (!ai && args.note) uncertainties.push(args.note);

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentResult.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          companyId: session.companyId,
          applicationId: session.applicationId,
          versionId: session.assignment.versionId,
          deterministicScore: det.totalScore,
          deterministicMax: det.totalMax,
          aiScore: ai ? round2(aiScore) : null,
          aiMax: ai ? round2(aiMax) : null,
          totalScore,
          maxScore: 100,
          questionBreakdown: questionBreakdown as unknown as Prisma.InputJsonValue,
          competencyBreakdown: [...competencyAgg.entries()].map(([competency, v]) => ({
            competency,
            ...v,
          })) as unknown as Prisma.InputJsonValue,
          strengths: (ai?.strengths ?? []) as unknown as Prisma.InputJsonValue,
          gaps: (ai?.gaps ?? []) as unknown as Prisma.InputJsonValue,
          uncertainties: uncertainties as unknown as Prisma.InputJsonValue,
          evaluatedAt: new Date(),
        },
        update: {
          deterministicScore: det.totalScore,
          deterministicMax: det.totalMax,
          aiScore: ai ? round2(aiScore) : null,
          aiMax: ai ? round2(aiMax) : null,
          totalScore,
          questionBreakdown: questionBreakdown as unknown as Prisma.InputJsonValue,
          competencyBreakdown: [...competencyAgg.entries()].map(([competency, v]) => ({
            competency,
            ...v,
          })) as unknown as Prisma.InputJsonValue,
          strengths: (ai?.strengths ?? []) as unknown as Prisma.InputJsonValue,
          gaps: (ai?.gaps ?? []) as unknown as Prisma.InputJsonValue,
          uncertainties: uncertainties as unknown as Prisma.InputJsonValue,
          evaluatedAt: new Date(),
        },
      });
      await tx.assessmentSession.update({
        where: { id: session.id },
        data: { status: AssessmentSessionStatus.EVALUATED },
      });
      await tx.assessmentAssignment.update({
        where: { id: session.assignmentId },
        data: { status: AssessmentAssignmentStatus.EVALUATED },
      });
    });

    await this.audit.record({
      companyId: session.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_EVALUATED,
      actorType: ApplicationActorType.SYSTEM,
      entityType: 'AssessmentResult',
      entityId: session.id,
      description: `Assessment evaluated: ${session.assignment.version.assessment.name} — ${totalScore}/100`,
      applicationId: session.applicationId,
      candidateId: session.application.candidateId,
    });
    await this.notifyAssignees(session, totalScore);
  }

  private async notifyAssignees(session: LoadedSession, totalScore: number): Promise<void> {
    try {
      const assignees = await this.prisma.applicationAssignment.findMany({
        where: { applicationId: session.applicationId, removedAt: null },
        include: { membership: { select: { userId: true } } },
      });
      const userIds = [...new Set(assignees.map((a) => a.membership.userId))];
      for (const userId of userIds) {
        try {
          await this.notifications.create({
            userId,
            companyId: session.companyId,
            type: NotificationType.ASSESSMENT_EVALUATED,
            title: 'Assessment evaluated',
            body: `${session.assignment.version.assessment.name} scored ${totalScore}/100. Review the result to decide next steps.`,
            relatedEntityType: 'AssessmentSession',
            relatedEntityId: session.id,
            actionUrl: `/applications/${session.applicationId}`,
          });
        } catch (error) {
          this.logger.debug(`Skipping notification for ${userId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to notify assignees: ${(error as Error).message}`);
    }
  }
}
