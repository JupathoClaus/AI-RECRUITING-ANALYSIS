import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  Prisma,
  AssessmentQuestionType,
  AssessmentSessionStatus,
  AssessmentAssignmentStatus,
  AssessmentEvaluationStatus,
  ApplicationAuditEventType,
  ApplicationActorType,
} from '@prisma/client';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { AssessmentCodeService } from './assessment-code.service';
import { AssessmentTokenService } from './assessment-token.service';
import { AssessmentScoringService } from './assessment-scoring.service';
import { AssessmentEvaluationService } from './assessment-evaluation.service';
import { SaveAssessmentResponseDto } from '../dto/assignment.dto';
import * as crypto from 'crypto';

interface CandidateSessionTree {
  id: string;
  companyId: string;
  applicationId: string;
  codeHash: string;
  status: AssessmentSessionStatus;
  attemptNumber: number;
  questionOrder: unknown;
  startedAt: Date | null;
  submittedAt: Date | null;
  expiresAt: Date | null;
  assignment: {
    id: string;
    status: AssessmentAssignmentStatus;
    dueAt: Date | null;
    version: {
      id: string;
      versionNumber: number;
      status: string;
      assessment: {
        id: string;
        name: string;
        description: string | null;
        instructions: string | null;
        durationMinutes: number | null;
        maxAttempts: number;
      };
      questions: {
        id: string;
        type: AssessmentQuestionType;
        prompt: string;
        instructions: string | null;
        sortOrder: number;
        required: boolean;
        points: number;
        options: { id: string; label: string; sortOrder: number }[];
      }[];
    };
  };
}

/**
 * Candidate-facing assessment flow. The server is authoritative for timing,
 * ordering, scoring, and state transitions; the browser only renders what the
 * candidate-safe DTOs expose (no correct answers, no rubrics, no AI
 * metadata, no other candidates).
 */
@Injectable()
export class AssessmentSessionsService {
  private readonly logger = new Logger(AssessmentSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: AssessmentCodeService,
    private readonly tokens: AssessmentTokenService,
    private readonly scoring: AssessmentScoringService,
    private readonly evaluation: AssessmentEvaluationService,
    private readonly audit: ApplicationAuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ── Code → token ─────────────────────────────────────────────

  async verifyCode(rawCode: string): Promise<{ token: string; session: Record<string, unknown> }> {
    if (!this.codes.validate(rawCode)) {
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'This assessment code is not valid.',
      });
    }
    const session = await this.findByCodeHash(this.codes.hash(rawCode));
    if (!session) {
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'This assessment code is not valid.',
      });
    }
    if (session.status === AssessmentSessionStatus.CANCELLED) {
      throw new ConflictException({
        code: 'ASSESSMENT_CANCELLED',
        message: 'This assessment has been cancelled.',
      });
    }
    await this.ensureActive(session);
    const fresh = await this.findByCodeHash(this.codes.hash(rawCode));
    if (!fresh) {
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'This assessment code is not valid.',
      });
    }
    const token = this.tokens.generate(fresh.id, fresh.codeHash);
    return { token, session: this.toAccessDto(fresh) };
  }

  // ── Authenticated candidate ops (short-lived Bearer token) ────

  async getSession(token: string) {
    const session = await this.requireTokenSession(token);
    await this.ensureActive(session);
    return this.toCandidateView(await this.requireTokenSession(token));
  }

  async start(token: string) {
    let session = await this.requireTokenSession(token);
    await this.ensureActive(session);
    session = await this.requireTokenSession(token);

    if (session.status === AssessmentSessionStatus.IN_PROGRESS) {
      return this.toCandidateView(session);
    }
    if (session.status !== AssessmentSessionStatus.NOT_STARTED) {
      throw new ConflictException({
        code: 'SESSION_NOT_STARTABLE',
        message: `Assessment cannot be started from status ${session.status}.`,
      });
    }
    if (session.assignment.dueAt && session.assignment.dueAt.getTime() <= Date.now()) {
      await this.expire(session, 'past due date');
      throw new ConflictException({
        code: 'ASSESSMENT_EXPIRED',
        message: 'This assessment is past its due date.',
      });
    }

    const duration = session.assignment.version.assessment.durationMinutes;
    const now = new Date();
    const orderedIds = session.assignment.version.questions.map((q) => q.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({
        where: { id: session.id },
        data: {
          status: AssessmentSessionStatus.IN_PROGRESS,
          startedAt: now,
          lastActivityAt: now,
          expiresAt: duration ? new Date(now.getTime() + duration * 60_000) : null,
          questionOrder: orderedIds as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.assessmentAssignment.update({
        where: { id: session.assignment.id },
        data: { status: AssessmentAssignmentStatus.IN_PROGRESS },
      });
    });

    await this.audit.record({
      companyId: session.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_STARTED,
      actorType: ApplicationActorType.CANDIDATE,
      entityType: 'AssessmentSession',
      entityId: session.id,
      description: `Assessment started: ${session.assignment.version.assessment.name}`,
      applicationId: session.applicationId,
    });
    return this.toCandidateView(await this.requireTokenSession(token));
  }

  async saveResponse(token: string, dto: SaveAssessmentResponseDto) {
    const session = await this.requireTokenSession(token);
    await this.ensureActive(session);
    const fresh = await this.requireTokenSession(token);
    if (fresh.status !== AssessmentSessionStatus.IN_PROGRESS) {
      throw new ConflictException({
        code: 'SESSION_NOT_WRITABLE',
        message: 'Responses can only be saved while the assessment is in progress.',
      });
    }

    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: dto.questionId, versionId: fresh.assignment.version.id },
      include: { options: { select: { id: true } } },
    });
    if (!question) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Question is not part of this assessment.',
      });
    }
    const normalized = this.normalizeResponse(
      question.type,
      dto,
      question.options.map((o) => o.id),
    );

    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_questionId: { sessionId: fresh.id, questionId: question.id } },
    });
    if (existing && dto.baseUpdatedAt) {
      const base = new Date(dto.baseUpdatedAt).getTime();
      if (!Number.isNaN(base) && existing.updatedAt.getTime() > base + 1000) {
        throw new ConflictException({
          code: 'STALE_WRITE',
          message: 'A newer answer was already saved. Refresh to merge.',
          current: this.toResponseDto(existing),
        });
      }
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const response = await tx.assessmentResponse.upsert({
        where: { sessionId_questionId: { sessionId: fresh.id, questionId: question.id } },
        create: { sessionId: fresh.id, questionId: question.id, ...normalized },
        update: { ...normalized },
      });
      await tx.assessmentSession.update({
        where: { id: fresh.id },
        data: { lastActivityAt: new Date() },
      });
      return response;
    });
    return { saved: true, response: this.toResponseDto(saved) };
  }

  async submit(token: string, idempotencyKey?: string) {
    const session = await this.requireTokenSession(token);
    await this.ensureActive(session);
    const fresh = await this.requireTokenSession(token);
    if (
      fresh.status === AssessmentSessionStatus.SUBMITTED ||
      fresh.status === AssessmentSessionStatus.EVALUATING ||
      fresh.status === AssessmentSessionStatus.EVALUATED
    ) {
      const current = await this.prisma.assessmentSession.findUnique({
        where: { id: fresh.id },
        select: { id: true, status: true, submittedAt: true },
      });
      return { submitted: true, deduplicated: true, session: current };
    }
    if (fresh.status !== AssessmentSessionStatus.IN_PROGRESS) {
      throw new ConflictException({
        code: 'SESSION_NOT_SUBMITTABLE',
        message: `Assessment cannot be submitted from status ${fresh.status}.`,
      });
    }

    const missing = await this.missingRequired(fresh);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INCOMPLETE_ASSESSMENT',
        message: 'Required questions are unanswered.',
        missing,
      });
    }

    const operation = 'assessment.submit';
    const key = idempotencyKey || `submit:${fresh.id}`;
    const requestHash = crypto.createHash('sha256').update(`submit:${fresh.id}`).digest('hex');
    const claim = await this.idempotency.executeTransactional<{ sessionId: string }>({
      companyId: fresh.companyId,
      userId: `candidate:${fresh.id}`,
      operation,
      key,
      requestHash,
      execute: async (tx) => {
        const claimed = await tx.assessmentSession.updateMany({
          where: { id: fresh.id, status: AssessmentSessionStatus.IN_PROGRESS },
          data: { status: AssessmentSessionStatus.SUBMITTED, submittedAt: new Date() },
        });
        if (claimed.count !== 1) {
          const current = await tx.assessmentSession.findUniqueOrThrow({ where: { id: fresh.id } });
          return {
            resourceType: 'AssessmentSession',
            resourceId: fresh.id,
            responseJson: { sessionId: fresh.id, status: current.status },
          };
        }
        // Deterministic scoring is persisted synchronously; AI follows via queue.
        const version = await tx.assessmentVersion.findUniqueOrThrow({
          where: { id: fresh.assignment.version.id },
          include: {
            questions: { include: { options: { select: { id: true, isCorrect: true } } } },
          },
        });
        const responses = await tx.assessmentResponse.findMany({ where: { sessionId: fresh.id } });
        const det = this.scoring.scoreDeterministic(
          version.questions.map((q) => ({
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
        for (const q of det.questions) {
          await tx.assessmentResponse.updateMany({
            where: { sessionId: fresh.id, questionId: q.questionId },
            data: { deterministicScore: q.score, deterministicMax: q.max },
          });
        }
        await tx.assessmentAssignment.update({
          where: { id: fresh.assignment.id },
          data: { status: AssessmentAssignmentStatus.SUBMITTED },
        });
        await tx.assessmentSession.update({
          where: { id: fresh.id },
          data: { status: AssessmentSessionStatus.EVALUATING },
        });
        const latest = await tx.assessmentEvaluation.findFirst({
          where: { sessionId: fresh.id },
          orderBy: { attempt: 'desc' },
        });
        const evaluation = await tx.assessmentEvaluation.create({
          data: {
            sessionId: fresh.id,
            companyId: fresh.companyId,
            attempt: (latest?.attempt ?? 0) + 1,
            status: AssessmentEvaluationStatus.PENDING,
          },
        });
        return {
          resourceType: 'AssessmentSession',
          resourceId: fresh.id,
          responseJson: { sessionId: fresh.id, evaluationId: evaluation.id },
        };
      },
    });

    const responseJson = claim.responseJson as
      { sessionId: string; evaluationId?: string; status?: string } | undefined;
    if (responseJson?.evaluationId) {
      await this.evaluation.enqueueEvaluation(responseJson.evaluationId, fresh.id, fresh.companyId);
    }
    await this.audit.record({
      companyId: fresh.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_SUBMITTED,
      actorType: ApplicationActorType.CANDIDATE,
      entityType: 'AssessmentSession',
      entityId: fresh.id,
      description: `Assessment submitted: ${fresh.assignment.version.assessment.name}`,
      applicationId: fresh.applicationId,
    });
    const status = await this.prisma.assessmentSession.findUnique({
      where: { id: fresh.id },
      select: { id: true, status: true, submittedAt: true },
    });
    return {
      submitted: true,
      deduplicated: claim.status === 'COMPLETED' && !responseJson?.evaluationId,
      session: status,
    };
  }

  async getStatus(token: string) {
    const session = await this.requireTokenSession(token);
    await this.ensureActive(session);
    const fresh = await this.requireTokenSession(token);
    // Deliberately no score: results are recruiter-controlled.
    return {
      sessionId: fresh.id,
      status: fresh.status,
      startedAt: fresh.startedAt,
      submittedAt: fresh.submittedAt,
      expiresAt: fresh.expiresAt,
      serverNow: new Date().toISOString(),
      remainingSeconds:
        fresh.expiresAt && fresh.status === AssessmentSessionStatus.IN_PROGRESS
          ? Math.max(0, Math.floor((fresh.expiresAt.getTime() - Date.now()) / 1000))
          : null,
    };
  }

  // ── Internals ────────────────────────────────────────────────

  private async findByCodeHash(codeHash: string) {
    return this.prisma.assessmentSession.findUnique({
      where: { codeHash },
      include: {
        assignment: {
          include: {
            version: {
              include: {
                assessment: true,
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  include: { options: { orderBy: { sortOrder: 'asc' } } },
                },
              },
            },
          },
        },
      },
    });
  }

  private async requireTokenSession(token: string): Promise<CandidateSessionTree> {
    const payload = this.tokens.verify(token);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: payload.sub },
      include: {
        assignment: {
          include: {
            version: {
              include: {
                assessment: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    instructions: true,
                    durationMinutes: true,
                    maxAttempts: true,
                  },
                },
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    type: true,
                    prompt: true,
                    instructions: true,
                    sortOrder: true,
                    required: true,
                    points: true,
                    options: {
                      orderBy: { sortOrder: 'asc' },
                      select: { id: true, label: true, sortOrder: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session) {
      throw new UnauthorizedException({
        code: 'SESSION_NOT_FOUND',
        message: 'Assessment session not found.',
      });
    }
    // Token/session binding: the token must belong to this session's code.
    if (!session.codeHash.startsWith(payload.cv) && payload.cv !== session.codeHash.slice(0, 16)) {
      throw new UnauthorizedException({
        code: 'TOKEN_MISMATCH',
        message: 'Token does not match this session.',
      });
    }
    return session as unknown as CandidateSessionTree;
  }

  /** Server-authoritative expiry: transitions terminal states exactly once. */
  private async ensureActive(session: {
    id: string;
    status: AssessmentSessionStatus;
    expiresAt: Date | null;
  }): Promise<void> {
    if (
      (session.status === AssessmentSessionStatus.NOT_STARTED ||
        session.status === AssessmentSessionStatus.IN_PROGRESS) &&
      session.expiresAt &&
      session.expiresAt.getTime() <= Date.now()
    ) {
      const full = await this.prisma.assessmentSession.findUnique({
        where: { id: session.id },
        include: {
          assignment: {
            include: { version: { include: { assessment: { select: { name: true } } } } },
          },
        },
      });
      if (full) await this.expire(full as never, 'time expired');
    }
  }

  private async expire(
    session: {
      id: string;
      companyId: string;
      applicationId: string;
      assignment: { id: string; version: { assessment: { name: string } } };
    },
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.updateMany({
        where: {
          id: session.id,
          status: {
            in: [AssessmentSessionStatus.NOT_STARTED, AssessmentSessionStatus.IN_PROGRESS],
          },
        },
        data: { status: AssessmentSessionStatus.EXPIRED },
      });
      await tx.assessmentAssignment.updateMany({
        where: {
          id: session.assignment.id,
          status: {
            in: [AssessmentAssignmentStatus.ASSIGNED, AssessmentAssignmentStatus.IN_PROGRESS],
          },
        },
        data: { status: AssessmentAssignmentStatus.EXPIRED },
      });
    });
    await this.audit.record({
      companyId: session.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_EXPIRED,
      actorType: ApplicationActorType.SYSTEM,
      entityType: 'AssessmentSession',
      entityId: session.id,
      description: `Assessment expired (${reason}): ${session.assignment.version.assessment.name}`,
      applicationId: session.applicationId,
    });
    this.logger.log(
      `Assessment session ${session.id} expired (${reason}); saved answers preserved`,
    );
  }

  private async missingRequired(
    session: CandidateSessionTree,
  ): Promise<{ questionId: string; sortOrder: number }[]> {
    const responses = await this.prisma.assessmentResponse.findMany({
      where: { sessionId: session.id },
    });
    const answered = new Map<string, { selected: number; text: number }>();
    for (const r of responses) {
      const selected = Array.isArray(r.selectedOptionIds)
        ? (r.selectedOptionIds as string[]).length
        : 0;
      answered.set(r.questionId, { selected, text: (r.textAnswer ?? '').trim().length });
    }
    const missing: { questionId: string; sortOrder: number }[] = [];
    for (const q of session.assignment.version.questions) {
      if (!q.required) continue;
      const a = answered.get(q.id);
      const hasAnswer =
        q.type === AssessmentQuestionType.SHORT_TEXT || q.type === AssessmentQuestionType.LONG_TEXT
          ? (a?.text ?? 0) > 0
          : (a?.selected ?? 0) > 0;
      if (!hasAnswer) missing.push({ questionId: q.id, sortOrder: q.sortOrder });
    }
    return missing;
  }

  private normalizeResponse(
    type: AssessmentQuestionType,
    dto: SaveAssessmentResponseDto,
    validOptionIds: string[],
  ): {
    selectedOptionIds: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
    textAnswer: string | null;
  } {
    if (type === AssessmentQuestionType.SHORT_TEXT || type === AssessmentQuestionType.LONG_TEXT) {
      const text = (dto.textAnswer ?? '').slice(0, 20000);
      const max = type === AssessmentQuestionType.SHORT_TEXT ? 2000 : 20000;
      if (text.length > max) {
        throw new BadRequestException({
          code: 'ANSWER_TOO_LONG',
          message: `Answer exceeds ${max} characters.`,
        });
      }
      return { selectedOptionIds: Prisma.JsonNull, textAnswer: text.length > 0 ? text : null };
    }
    const ids = dto.selectedOptionIds ?? [];
    const allowed = new Set(validOptionIds);
    for (const id of ids) {
      if (!allowed.has(id)) {
        throw new BadRequestException({
          code: 'INVALID_OPTION',
          message: 'Selected option is not part of this question.',
        });
      }
    }
    if (
      (type === AssessmentQuestionType.SINGLE_CHOICE ||
        type === AssessmentQuestionType.TRUE_FALSE) &&
      ids.length > 1
    ) {
      throw new BadRequestException({
        code: 'TOO_MANY_SELECTIONS',
        message: 'This question accepts a single answer.',
      });
    }
    return { selectedOptionIds: ids as unknown as Prisma.InputJsonValue, textAnswer: null };
  }

  private toAccessDto(session: Record<string, unknown>): Record<string, unknown> {
    const s = session as unknown as CandidateSessionTree & {
      assignment: CandidateSessionTree['assignment'] & {
        version: { assessment: { name: string } };
      };
    };
    return {
      sessionId: s.id,
      status: s.status,
      assessmentName: (s.assignment.version.assessment as { name: string }).name,
      expiresAt: s.expiresAt,
    };
  }

  private async toCandidateView(session: CandidateSessionTree) {
    const version = session.assignment.version;
    const order: string[] | null = Array.isArray(session.questionOrder)
      ? (session.questionOrder as string[])
      : null;
    const byId = new Map(version.questions.map((q) => [q.id, q]));
    const ordered =
      order && order.length > 0
        ? order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
        : version.questions;
    // Own saved answers only — required so refresh/navigation never loses work.
    const responses = await this.prisma.assessmentResponse.findMany({
      where: { sessionId: session.id },
    });
    return {
      sessionId: session.id,
      status: session.status,
      attemptNumber: session.attemptNumber,
      assessment: {
        name: version.assessment.name,
        description: version.assessment.description,
        instructions: version.assessment.instructions,
        durationMinutes: version.assessment.durationMinutes,
        versionNumber: version.versionNumber,
        questionCount: version.questions.length,
      },
      questions: ordered.map((q, index) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        instructions: q.instructions,
        position: index + 1,
        required: q.required,
        points: q.points,
        options: q.options,
      })),
      responses: responses.map((r) => this.toResponseDto(r)),
      serverNow: new Date().toISOString(),
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingSeconds:
        session.expiresAt && session.status === AssessmentSessionStatus.IN_PROGRESS
          ? Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
          : null,
    };
  }

  private toResponseDto(response: {
    id: string;
    questionId: string;
    selectedOptionIds: unknown;
    textAnswer: string | null;
    updatedAt: Date;
  }) {
    return {
      id: response.id,
      questionId: response.questionId,
      selectedOptionIds: Array.isArray(response.selectedOptionIds)
        ? response.selectedOptionIds
        : [],
      textAnswer: response.textAnswer,
      updatedAt: response.updatedAt.toISOString(),
    };
  }
}
