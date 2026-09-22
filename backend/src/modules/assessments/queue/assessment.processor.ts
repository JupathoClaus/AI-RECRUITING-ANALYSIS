import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { AssessmentEvaluationStatus, Prisma } from '@prisma/client';
import { AssessmentEvaluationService } from '../services/assessment-evaluation.service';
import { AssessmentAssignmentsService } from '../services/assessment-assignments.service';
import { AssessmentScoringService } from '../services/assessment-scoring.service';
import { AssessmentAiProviderError } from '../ai/assessment-ai-provider.interface';
import {
  ASSESSMENT_QUEUE,
  ASSESSMENT_EVALUATE_JOB,
  ASSESSMENT_BULK_ASSIGN_JOB,
  AssessmentEvaluateJobData,
  AssessmentBulkAssignJobData,
} from './assessment-queue.constants';

const BULK_CHUNK_SIZE = 100;

/**
 * Worker fan-out for the assessment queue. Matches the ai-screening worker
 * pattern (a module-scope constant read from the environment at load time,
 * because the @Processor decorator is evaluated before DI is available).
 * Default 3, clamped to [1, 20]; also mirrored by the `assessment.
 * workerConcurrency` config used elsewhere.
 */
export function parseAssessmentWorkerConcurrency(value?: string | number | null): number {
  const raw = value ?? process.env.ASSESSMENT_WORKER_CONCURRENCY;
  if (raw === undefined || raw === null || raw === '') return 3;
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
  const base = Number.isNaN(parsed) ? 3 : parsed;
  return Math.max(1, Math.min(20, base));
}

export const ASSESSMENT_WORKER_CONCURRENCY = parseAssessmentWorkerConcurrency();

/**
 * Assessment background worker. Bounded concurrency (default 3, clamped to
 * [1, 20], configured via ASSESSMENT_WORKER_CONCURRENCY) keeps 5,000-submission
 * jobs from overwhelming Postgres or the AI provider: submissions persist
 * synchronously, evaluation fans out here with deterministic jobIds so
 * duplicate deliveries collapse.
 */
@Processor(ASSESSMENT_QUEUE, { concurrency: ASSESSMENT_WORKER_CONCURRENCY })
export class AssessmentProcessor extends WorkerHost {
  private readonly logger = new Logger(AssessmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly evaluationService: AssessmentEvaluationService,
    private readonly assignmentsService: AssessmentAssignmentsService,
    private readonly scoring: AssessmentScoringService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case ASSESSMENT_EVALUATE_JOB:
        return this.handleEvaluate(job as Job<AssessmentEvaluateJobData>);
      case ASSESSMENT_BULK_ASSIGN_JOB:
        return this.handleBulkAssign(job as Job<AssessmentBulkAssignJobData>);
      default:
        throw new UnrecoverableError(`Unexpected assessment job name: ${job.name}`);
    }
  }

  private async handleEvaluate(
    job: Job<AssessmentEvaluateJobData>,
  ): Promise<{ evaluationId: string }> {
    const { evaluationId, sessionId, companyId } = job.data;
    if (!evaluationId || !sessionId || !companyId) {
      throw new UnrecoverableError('Assessment evaluation job is missing identifiers.');
    }
    const evaluation = await this.prisma.assessmentEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) throw new UnrecoverableError('Evaluation record not found.');
    if (evaluation.companyId !== companyId || evaluation.sessionId !== sessionId) {
      throw new UnrecoverableError('Evaluation job identifiers do not match the record.');
    }
    if (evaluation.status === AssessmentEvaluationStatus.COMPLETED) return { evaluationId };

    try {
      await this.evaluationService.evaluateAttempt(evaluationId);
      return { evaluationId };
    } catch (error) {
      if (error instanceof UnrecoverableError) throw error;
      const maxAttempts = job.opts.attempts ?? 3;
      if (error instanceof AssessmentAiProviderError && !error.retryable) {
        await this.evaluationService.failTerminal(evaluationId, error.code, error.message);
        // Preserve the submission with deterministic scoring even when AI fails.
        await this.finalizeDeterministicOnly(sessionId, companyId);
        throw new UnrecoverableError(`${error.code}: ${error.message}`);
      }
      if (job.attemptsMade + 1 >= maxAttempts) {
        const code = error instanceof AssessmentAiProviderError ? error.code : 'PROCESSING_ERROR';
        const message = error instanceof Error ? error.message : 'Unknown processing error';
        await this.evaluationService.failTerminal(evaluationId, code, message.slice(0, 1000));
        await this.finalizeDeterministicOnly(sessionId, companyId);
        throw new UnrecoverableError(`Assessment evaluation exhausted retries: ${code}`);
      }
      throw error;
    }
  }

  private async finalizeDeterministicOnly(sessionId: string, companyId: string): Promise<void> {
    try {
      // Reuse the evaluation path with an empty-AI outcome by marking all
      // text questions unscored: simplest safe route is a synthetic attempt
      // guard — if a result already exists, leave it; otherwise create one
      // from deterministic scores only.
      const existing = await this.prisma.assessmentResult.findUnique({ where: { sessionId } });
      if (existing) return;
      const session = await this.prisma.assessmentSession.findFirst({
        where: { id: sessionId, companyId },
        include: {
          assignment: {
            include: {
              version: {
                include: {
                  assessment: { select: { name: true } },
                  questions: {
                    include: {
                      options: { select: { id: true, isCorrect: true } },
                      rubricCriteria: true,
                    },
                  },
                },
              },
            },
          },
          application: { select: { id: true, candidateId: true } },
        },
      });
      if (!session) return;
      const responses = await this.prisma.assessmentResponse.findMany({ where: { sessionId } });
      const det = this.scoring.scoreDeterministic(
        session.assignment.version.questions.map((q) => ({
          id: q.id,
          type: q.type,
          points: q.points,
          competency: q.competency,
          options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
        })),
        responses.map((r) => ({
          questionId: r.questionId,
          selectedOptionIds: Array.isArray(r.selectedOptionIds)
            ? (r.selectedOptionIds as string[])
            : [],
        })),
      );
      const totalScore =
        det.totalMax > 0 ? Math.round((det.totalScore / det.totalMax) * 10000) / 100 : 0;
      await this.prisma.$transaction(async (tx) => {
        await tx.assessmentResult.upsert({
          where: { sessionId },
          create: {
            sessionId,
            companyId,
            applicationId: session.applicationId,
            versionId: session.assignment.versionId,
            deterministicScore: det.totalScore,
            deterministicMax: det.totalMax,
            totalScore,
            maxScore: 100,
            questionBreakdown: det.questions as unknown as Prisma.InputJsonValue,
            uncertainties: [
              'AI evaluation unavailable; deterministic score only. Retry is available.',
            ] as unknown as Prisma.InputJsonValue,
            evaluatedAt: new Date(),
          },
          update: {
            uncertainties: [
              'AI evaluation unavailable; deterministic score only. Retry is available.',
            ] as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.assessmentSession.updateMany({
          where: { id: sessionId },
          data: { status: 'EVALUATED' },
        });
        await tx.assessmentAssignment.updateMany({
          where: { id: session.assignmentId },
          data: { status: 'EVALUATED' },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Deterministic fallback failed for ${sessionId}: ${(error as Error).message}`,
      );
    }
  }

  private async handleBulkAssign(job: Job<AssessmentBulkAssignJobData>): Promise<{
    assigned: number;
    skipped: number;
    failed: number;
    failures: { applicationId: string; reason: string }[];
  }> {
    const { versionId, companyId, applicationIds, dueAt, requestedByMembershipId, requestedByUserId } =
      job.data;
    if (!versionId || !companyId || !Array.isArray(applicationIds)) {
      throw new UnrecoverableError('Bulk assign job is missing identifiers.');
    }
    const due = dueAt ? new Date(dueAt) : null;
    let assigned = 0;
    let skipped = 0;
    let failed = 0;
    const failures: { applicationId: string; reason: string }[] = [];

    for (let i = 0; i < applicationIds.length; i += BULK_CHUNK_SIZE) {
      const chunk = applicationIds.slice(i, i + BULK_CHUNK_SIZE);
      for (const applicationId of chunk) {
        try {
          const outcome = await this.assignmentsService.assignOneForBulk(
            versionId,
            companyId,
            applicationId,
            due,
            requestedByMembershipId,
            requestedByUserId,
          );
          if (outcome.outcome === 'assigned') assigned++;
          else if (outcome.outcome === 'skipped') skipped++;
          else {
            failed++;
            failures.push({ applicationId, reason: outcome.reason ?? 'UNKNOWN' });
          }
        } catch (error) {
          failed++;
          failures.push({ applicationId, reason: (error as Error).message.slice(0, 200) });
        }
      }
      await job.updateProgress(Math.round(((i + chunk.length) / applicationIds.length) * 100));
    }

    this.logger.log(
      `Bulk assign complete for version ${versionId}: ${assigned} assigned, ${skipped} skipped, ${failed} failed`,
    );
    return { assigned, skipped, failed, failures: failures.slice(0, 100) };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Assessment job completed: ${job.name} (${job.id})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.warn(`Assessment job failed: ${job?.name} (${job?.id}): ${error.message}`);
  }
}
