import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { AiInterviewEvaluationStatus } from '@prisma/client';
import { AiInterviewEvaluationService } from '../ai-interview-evaluation.service';
import { AiInterviewAiProviderError } from '../ai-interview-ai-provider.interface';
import {
  AI_INTERVIEW_EVALUATION_QUEUE,
  AI_INTERVIEW_EVALUATE_JOB,
  AiInterviewEvaluateJobData,
} from './ai-interview-evaluation-queue.constants';

/**
 * Worker fan-out for the ai-interview-evaluation queue. Matches the
 * assessment/ai-screening worker pattern (a module-scope constant read from
 * the environment at load time, because the @Processor decorator is evaluated
 * before DI is available). Default 3, clamped to [1, 20].
 */
export function parseAiInterviewEvaluationWorkerConcurrency(
  value?: string | number | null,
): number {
  const raw = value ?? process.env.AI_INTERVIEW_EVALUATION_WORKER_CONCURRENCY;
  if (raw === undefined || raw === null || raw === '') return 3;
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
  const base = Number.isNaN(parsed) ? 3 : parsed;
  return Math.max(1, Math.min(20, base));
}

export const AI_INTERVIEW_EVALUATION_WORKER_CONCURRENCY =
  parseAiInterviewEvaluationWorkerConcurrency();

/**
 * AI interview evaluation background worker. Bounded concurrency (default 3,
 * clamped to [1, 20], configured via AI_INTERVIEW_EVALUATION_WORKER_CONCURRENCY)
 * with deterministic jobIds so duplicate deliveries collapse. Provider
 * failures never produce a synthetic score: the evaluation is marked FAILED
 * and a controlled re-evaluation is available.
 */
@Processor(AI_INTERVIEW_EVALUATION_QUEUE, {
  concurrency: AI_INTERVIEW_EVALUATION_WORKER_CONCURRENCY,
})
export class AiInterviewEvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(AiInterviewEvaluationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: AiInterviewEvaluationService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== AI_INTERVIEW_EVALUATE_JOB) {
      throw new UnrecoverableError(`Unexpected job name: ${job.name}`);
    }
    const data = job.data as AiInterviewEvaluateJobData;
    if (!data.evaluationId || !data.aiInterviewId || !data.companyId) {
      throw new UnrecoverableError('AI interview evaluation job is missing identifiers.');
    }
    const evaluation = await this.prisma.aiInterviewEvaluation.findUnique({
      where: { id: data.evaluationId },
    });
    if (!evaluation) throw new UnrecoverableError('Evaluation record not found.');
    if (
      evaluation.companyId !== data.companyId ||
      evaluation.aiInterviewId !== data.aiInterviewId
    ) {
      throw new UnrecoverableError('Evaluation job identifiers do not match the record.');
    }
    if (evaluation.status === AiInterviewEvaluationStatus.COMPLETED) {
      return { evaluationId: data.evaluationId };
    }

    try {
      await this.evaluationService.evaluateAttempt(data.evaluationId);
      return { evaluationId: data.evaluationId };
    } catch (error) {
      if (error instanceof UnrecoverableError) throw error;
      const maxAttempts = job.opts.attempts ?? 3;
      const code = error instanceof AiInterviewAiProviderError ? error.code : 'PROCESSING_ERROR';
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      if (
        (error instanceof AiInterviewAiProviderError && !error.retryable) ||
        job.attemptsMade + 1 >= maxAttempts
      ) {
        await this.evaluationService.failTerminal(data.evaluationId, code, message.slice(0, 1000));
        await this.evaluationService.recordAttemptFailure(
          data.evaluationId,
          code,
          message.slice(0, 1000),
        );
        throw new UnrecoverableError(`${code}: ${message}`);
      }
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`AI interview evaluation job completed: ${job.name} (${job.id})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.warn(
      `AI interview evaluation job failed: ${job?.name} (${job?.id}): ${error.message}`,
    );
  }
}
