import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { AssessmentEvaluationStatus } from '@prisma/client';

/**
 * Recruiter-facing read models. Results are decision support: scores,
 * evidence, and uncertainties are presented together and the assessment
 * never advances or rejects the application on its own.
 */
@Injectable()
export class AssessmentResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full recruiter review for one session. */
  async getResult(sessionId: string, companyId: string) {
    const session = await this.prisma.assessmentSession.findFirst({
      where: { id: sessionId, companyId },
      include: {
        assignment: {
          include: {
            version: {
              include: {
                assessment: {
                  select: { id: true, name: true, passingScore: true, durationMinutes: true },
                },
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    options: { orderBy: { sortOrder: 'asc' } },
                    rubricCriteria: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
        application: {
          select: {
            id: true,
            status: true,
            job: { select: { id: true, title: true } },
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        responses: true,
        evaluations: { orderBy: { attempt: 'desc' } },
        result: true,
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Assessment session not found.',
      });
    }

    const responseByQuestion = new Map(session.responses.map((r) => [r.questionId, r]));
    const questions = session.assignment.version.questions.map((q) => {
      const response = responseByQuestion.get(q.id);
      const selectedIds = Array.isArray(response?.selectedOptionIds)
        ? (response.selectedOptionIds as string[])
        : [];
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        instructions: q.instructions,
        sortOrder: q.sortOrder,
        required: q.required,
        points: q.points,
        competency: q.competency,
        aiEvaluated: q.aiEvaluated,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          sortOrder: o.sortOrder,
          isCorrect: o.isCorrect,
          selected: selectedIds.includes(o.id),
        })),
        rubricCriteria: q.rubricCriteria,
        response: response
          ? {
              textAnswer: response.textAnswer,
              selectedOptionIds: selectedIds,
              deterministicScore: response.deterministicScore,
              deterministicMax: response.deterministicMax,
              updatedAt: response.updatedAt,
            }
          : null,
      };
    });

    const evaluations = session.evaluations.map((e) => ({
      id: e.id,
      attempt: e.attempt,
      status: e.status,
      provider: e.provider,
      model: e.model,
      promptVersion: e.promptVersion,
      schemaVersion: e.schemaVersion,
      latencyMs: e.latencyMs,
      failureCode: e.failureCode,
      failureMessageSafe: e.failureMessageSafe,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      // Full output only for completed evaluations; failures expose safe fields only.
      output: e.status === AssessmentEvaluationStatus.COMPLETED ? e.output : null,
    }));

    const result = session.result;
    const passingScore = session.assignment.version.assessment.passingScore;
    return {
      session: {
        id: session.id,
        status: session.status,
        attemptNumber: session.attemptNumber,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        expiresAt: session.expiresAt,
      },
      assessment: {
        ...session.assignment.version.assessment,
        versionNumber: session.assignment.version.versionNumber,
        versionId: session.assignment.version.id,
      },
      application: session.application,
      questions,
      evaluations,
      latestEvaluation: evaluations[0] ?? null,
      result: result
        ? {
            ...result,
            threshold:
              passingScore != null
                ? { passingScore, meetsThreshold: result.totalScore >= passingScore }
                : null,
          }
        : null,
    };
  }

  /** Assessment state for the Application Workspace (summary only, no bodies). */
  async getApplicationState(applicationId: string, companyId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId },
      select: { id: true },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found.',
      });
    }
    const assignments = await this.prisma.assessmentAssignment.findMany({
      where: { applicationId, companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        version: {
          select: {
            id: true,
            versionNumber: true,
            assessment: {
              select: { id: true, name: true, passingScore: true, durationMinutes: true },
            },
          },
        },
        sessions: {
          orderBy: { attemptNumber: 'desc' },
          select: {
            id: true,
            status: true,
            attemptNumber: true,
            startedAt: true,
            submittedAt: true,
            expiresAt: true,
            result: { select: { totalScore: true, evaluatedAt: true } },
          },
        },
      },
    });
    return {
      applicationId,
      assignments: assignments.map((a) => ({
        id: a.id,
        status: a.status,
        dueAt: a.dueAt,
        createdAt: a.createdAt,
        assessment: {
          ...a.version.assessment,
          versionNumber: a.version.versionNumber,
          versionId: a.version.id,
        },
        latestSession: a.sessions[0] ?? null,
        sessionCount: a.sessions.length,
      })),
    };
  }
}
