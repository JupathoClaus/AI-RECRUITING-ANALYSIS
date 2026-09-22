import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  Prisma,
  AssessmentStatus,
  AssessmentVersionStatus,
  ApplicationAuditEventType,
  ApplicationActorType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import {
  AssessmentValidationService,
  ValidationQuestionInput,
} from './assessment-validation.service';
import { CreateAssessmentDto, UpdateAssessmentDto } from '../dto/assessment.dto';
import { SaveQuestionsDto, ReorderQuestionsDto } from '../dto/question.dto';

const VERSION_WITH_TREE = {
  questions: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: { orderBy: { sortOrder: 'asc' as const } },
      rubricCriteria: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
};

export interface AssessmentActor {
  companyId: string;
  userId: string;
  membershipId: string;
}

function requestHashOf(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Recruiter-owned assessment lifecycle: create → draft versions → validate →
 * publish (immutable) → assign → review. All queries are tenant-scoped by
 * companyId; cross-tenant access resolves to 404 (resource hiding, matching
 * the applications convention).
 */
@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: AssessmentValidationService,
    private readonly audit: ApplicationAuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ── Create / update ──────────────────────────────────────────────

  async create(dto: CreateAssessmentDto, actor: AssessmentActor, idempotencyKey?: string) {
    if (dto.jobId) {
      await this.requireCompanyJob(dto.jobId, actor.companyId);
    }
    const operation = 'assessment.create';
    const requestHash = requestHashOf({ ...dto, companyId: actor.companyId });
    const execute = async (tx: Prisma.TransactionClient) => {
      const assessment = await tx.assessment.create({
        data: {
          company: { connect: { id: actor.companyId } },
          job: dto.jobId ? { connect: { id: dto.jobId } } : undefined,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          instructions: dto.instructions?.trim() || null,
          durationMinutes: dto.durationMinutes ?? null,
          passingScore: dto.passingScore ?? null,
          maxAttempts: dto.maxAttempts ?? 1,
          status: AssessmentStatus.DRAFT,
          createdBy: { connect: { id: actor.membershipId } },
        },
      });
      await tx.assessmentVersion.create({
        data: {
          assessmentId: assessment.id,
          versionNumber: 1,
          status: AssessmentVersionStatus.DRAFT,
          createdByMembershipId: actor.membershipId,
        },
      });
      return {
        resourceType: 'Assessment',
        resourceId: assessment.id,
        responseJson: { id: assessment.id },
      };
    };

    let assessmentId: string;
    if (idempotencyKey) {
      const claim = await this.idempotency.executeTransactional<{ id: string }>({
        companyId: actor.companyId,
        userId: actor.userId,
        operation,
        key: idempotencyKey,
        requestHash,
        execute,
      });
      assessmentId = (claim.responseJson as { id: string } | undefined)?.id ?? claim.resourceId;
    } else {
      const result = await this.prisma.$transaction(execute);
      assessmentId = result.resourceId;
    }

    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_CREATED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'Assessment',
      entityId: assessmentId,
      description: `Assessment created: ${dto.name.trim()}`,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return this.get(assessmentId, actor.companyId);
  }

  async update(id: string, dto: UpdateAssessmentDto, actor: AssessmentActor) {
    const assessment = await this.requireCompanyAssessment(id, actor.companyId);
    if (assessment.status === AssessmentStatus.ARCHIVED) {
      throw new ConflictException({
        code: 'ASSESSMENT_ARCHIVED',
        message: 'Archived assessments cannot be edited.',
      });
    }
    const data: Prisma.AssessmentUpdateInput = {
      updatedBy: { connect: { id: actor.membershipId } },
    };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.instructions !== undefined) data.instructions = dto.instructions?.trim() || null;
    if (dto.durationMinutes !== undefined) data.durationMinutes = dto.durationMinutes;
    if (dto.passingScore !== undefined) data.passingScore = dto.passingScore;
    if (dto.maxAttempts !== undefined) data.maxAttempts = dto.maxAttempts;
    if (dto.aiApproved !== undefined) data.aiApproved = dto.aiApproved;

    await this.prisma.assessment.update({ where: { id }, data });
    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_UPDATED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'Assessment',
      entityId: id,
      description: `Assessment updated: ${dto.name ?? assessment.name}`,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return this.get(id, actor.companyId);
  }

  // ── Read ─────────────────────────────────────────────────────────

  async list(
    companyId: string,
    query: { jobId?: string; status?: AssessmentStatus; page?: number; limit?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.AssessmentWhereInput = { companyId };
    if (query.jobId) where.jobId = query.jobId;
    if (query.status) where.status = query.status;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.assessment.count({ where }),
      this.prisma.assessment.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          jobId: true,
          name: true,
          status: true,
          durationMinutes: true,
          passingScore: true,
          aiGenerated: true,
          aiApproved: true,
          createdAt: true,
          updatedAt: true,
          job: { select: { id: true, title: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 5,
            select: {
              id: true,
              versionNumber: true,
              status: true,
              publishedAt: true,
              questionCount: true,
              totalPoints: true,
            },
          },
          _count: { select: { versions: true } },
        },
      }),
    ]);
    return { data: items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async get(id: string, companyId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, companyId },
      include: {
        job: { select: { id: true, title: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            questionCount: true,
            totalPoints: true,
            createdAt: true,
          },
        },
      },
    });
    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Assessment not found.',
      });
    }
    return assessment;
  }

  /** Full recruiter view of a version (includes correct answers — never exposed to candidates). */
  async getVersion(versionId: string, companyId: string) {
    const version = await this.prisma.assessmentVersion.findFirst({
      where: { id: versionId, assessment: { companyId } },
      include: {
        assessment: {
          select: {
            id: true,
            companyId: true,
            name: true,
            status: true,
            durationMinutes: true,
            passingScore: true,
            jobId: true,
          },
        },
        ...VERSION_WITH_TREE,
      },
    });
    if (!version) {
      throw new NotFoundException({
        code: 'ASSESSMENT_VERSION_NOT_FOUND',
        message: 'Assessment version not found.',
      });
    }
    return version;
  }

  // ── Draft editing (DRAFT versions only) ──────────────────────────

  async saveQuestions(versionId: string, dto: SaveQuestionsDto, actor: AssessmentActor) {
    const version = await this.requireDraftVersion(versionId, actor.companyId);
    this.assertUniqueSortOrders(
      dto.questions.map((q) => q.sortOrder),
      'DUPLICATE_ORDER',
      'Question ordering must be unique.',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { versionId } });
      for (const q of dto.questions) {
        await tx.assessmentQuestion.create({
          data: {
            versionId,
            type: q.type,
            prompt: q.prompt.trim(),
            instructions: q.instructions?.trim() || null,
            sortOrder: q.sortOrder,
            required: q.required ?? true,
            points: q.points ?? 0,
            competency: q.competency?.trim() || null,
            aiEvaluated: q.aiEvaluated ?? false,
            aiGenerated: false,
            aiApproved: q.aiApproved ?? true,
            options: q.options
              ? {
                  create: q.options.map((o) => ({
                    label: o.label.trim(),
                    sortOrder: o.sortOrder,
                    isCorrect: o.isCorrect ?? false,
                    points: o.points ?? null,
                  })),
                }
              : undefined,
            rubricCriteria: q.rubricCriteria
              ? {
                  create: q.rubricCriteria.map((c) => ({
                    name: c.name.trim(),
                    description: c.description?.trim() || null,
                    guidance: c.guidance?.trim() || null,
                    maxScore: c.maxScore,
                    weight: c.weight ?? 1,
                    sortOrder: c.sortOrder,
                  })),
                }
              : undefined,
          },
        });
      }
      await this.refreshVersionTotals(tx, versionId);
    });

    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_UPDATED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AssessmentVersion',
      entityId: versionId,
      description: `Draft questions saved (v${version.versionNumber}, ${dto.questions.length} questions)`,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return this.getVersion(versionId, actor.companyId);
  }

  async reorder(versionId: string, dto: ReorderQuestionsDto, actor: AssessmentActor) {
    const version = await this.requireDraftVersion(versionId, actor.companyId);
    const existing = await this.prisma.assessmentQuestion.findMany({
      where: { versionId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    if (
      dto.orderedIds.length !== existing.length ||
      !dto.orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException({
        code: 'REORDER_MISMATCH',
        message: 'orderedIds must contain exactly the questions of this version.',
      });
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.assessmentQuestion.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    this.logger.debug(`Reordered ${dto.orderedIds.length} questions on version ${version.id}`);
    return this.getVersion(versionId, actor.companyId);
  }

  /** Copy-on-write: a new DRAFT version seeded from the latest version. Published history is never mutated. */
  async createDraftVersion(assessmentId: string, actor: AssessmentActor) {
    const assessment = await this.requireCompanyAssessment(assessmentId, actor.companyId);
    const latest = await this.prisma.assessmentVersion.findFirst({
      where: { assessmentId },
      orderBy: { versionNumber: 'desc' },
      include: { questions: { include: { options: true, rubricCriteria: true } } },
    });
    if (latest && latest.status === AssessmentVersionStatus.DRAFT) {
      return this.getVersion(latest.id, actor.companyId);
    }
    const nextNumber = (latest?.versionNumber ?? 0) + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.assessmentVersion.create({
        data: {
          assessmentId,
          versionNumber: nextNumber,
          status: AssessmentVersionStatus.DRAFT,
          createdByMembershipId: actor.membershipId,
        },
      });
      if (latest) {
        for (const q of latest.questions) {
          await tx.assessmentQuestion.create({
            data: {
              versionId: version.id,
              type: q.type,
              prompt: q.prompt,
              instructions: q.instructions,
              sortOrder: q.sortOrder,
              required: q.required,
              points: q.points,
              competency: q.competency,
              aiEvaluated: q.aiEvaluated,
              aiGenerated: q.aiGenerated,
              aiApproved: q.aiApproved,
              options: {
                create: q.options.map((o) => ({
                  label: o.label,
                  sortOrder: o.sortOrder,
                  isCorrect: o.isCorrect,
                  points: o.points,
                })),
              },
              rubricCriteria: {
                create: q.rubricCriteria.map((c) => ({
                  name: c.name,
                  description: c.description,
                  guidance: c.guidance,
                  maxScore: c.maxScore,
                  weight: c.weight,
                  sortOrder: c.sortOrder,
                })),
              },
            },
          });
        }
        await this.refreshVersionTotals(tx, version.id);
      }
      return version;
    });
    this.logger.log(`Draft version v${nextNumber} created for assessment ${assessment.id}`);
    return this.getVersion(created.id, actor.companyId);
  }

  // ── Publishing ───────────────────────────────────────────────────

  async validateVersion(versionId: string, companyId: string) {
    const version = await this.getVersion(versionId, companyId);
    const assessment = await this.requireCompanyAssessment(version.assessmentId, companyId);
    const issues = this.validation.validateForPublish({
      durationMinutes: assessment.durationMinutes,
      passingScore: assessment.passingScore,
      questions: version.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        sortOrder: q.sortOrder,
        required: q.required,
        points: q.points,
        aiEvaluated: q.aiEvaluated,
        aiGenerated: q.aiGenerated,
        aiApproved: q.aiApproved,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          sortOrder: o.sortOrder,
          isCorrect: o.isCorrect,
          points: o.points,
        })),
        rubricCriteria: q.rubricCriteria.map((c) => ({
          id: c.id,
          name: c.name,
          maxScore: c.maxScore,
          weight: c.weight,
          sortOrder: c.sortOrder,
        })),
      })),
    });
    return { valid: issues.length === 0, issues };
  }

  async publish(versionId: string, actor: AssessmentActor, idempotencyKey?: string) {
    const version = await this.getVersion(versionId, actor.companyId);
    if (version.status === AssessmentVersionStatus.PUBLISHED) {
      return version;
    }
    if (version.status !== AssessmentVersionStatus.DRAFT) {
      throw new ConflictException({
        code: 'VERSION_NOT_DRAFT',
        message: 'Only draft versions can be published.',
      });
    }
    const assessment = await this.requireCompanyAssessment(version.assessmentId, actor.companyId);
    const questions: ValidationQuestionInput[] = version.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      sortOrder: q.sortOrder,
      required: q.required,
      points: q.points,
      aiEvaluated: q.aiEvaluated,
      aiGenerated: q.aiGenerated,
      aiApproved: q.aiApproved,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        sortOrder: o.sortOrder,
        isCorrect: o.isCorrect,
        points: o.points,
      })),
      rubricCriteria: q.rubricCriteria.map((c) => ({
        id: c.id,
        name: c.name,
        maxScore: c.maxScore,
        weight: c.weight,
        sortOrder: c.sortOrder,
      })),
    }));
    this.validation.assertPublishable({
      durationMinutes: assessment.durationMinutes,
      passingScore: assessment.passingScore,
      questions,
    });

    const totalPoints =
      version.questions.reduce((s, q) => s + (q.points ?? 0), 0) +
      version.questions
        .flatMap((q) => q.rubricCriteria)
        .reduce((s, c) => s + c.maxScore * (c.weight ?? 1), 0);
    const contentHash = requestHashOf({ v: version.versionNumber, q: questions });

    const operation = 'assessment.publish';
    const execute = async (tx: Prisma.TransactionClient) => {
      // Concurrent publish attempts: only one DRAFT→PUBLISHED transition wins.
      const claimed = await tx.assessmentVersion.updateMany({
        where: { id: versionId, status: AssessmentVersionStatus.DRAFT },
        data: {
          status: AssessmentVersionStatus.PUBLISHED,
          publishedAt: new Date(),
          totalPoints: Math.round(totalPoints),
          questionCount: version.questions.length,
          contentHash,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'VERSION_ALREADY_PUBLISHED',
          message: 'Version was published concurrently.',
        });
      }
      await tx.assessment.update({
        where: { id: assessment.id },
        data: {
          status: AssessmentStatus.PUBLISHED,
          updatedBy: { connect: { id: actor.membershipId } },
        },
      });
      return {
        resourceType: 'AssessmentVersion',
        resourceId: versionId,
        responseJson: { id: versionId },
      };
    };

    if (idempotencyKey) {
      await this.idempotency.executeTransactional({
        companyId: actor.companyId,
        userId: actor.userId,
        operation,
        key: idempotencyKey,
        requestHash: requestHashOf({ versionId }),
        execute,
      });
    } else {
      await this.prisma.$transaction(execute);
    }

    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_PUBLISHED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'AssessmentVersion',
      entityId: versionId,
      description: `Assessment published: ${assessment.name} v${version.versionNumber}`,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return this.getVersion(versionId, actor.companyId);
  }

  async archive(id: string, actor: AssessmentActor) {
    await this.requireCompanyAssessment(id, actor.companyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: {
          status: AssessmentStatus.ARCHIVED,
          updatedBy: { connect: { id: actor.membershipId } },
        },
      });
      await tx.assessmentVersion.updateMany({
        where: { assessmentId: id, status: AssessmentVersionStatus.DRAFT },
        data: { status: AssessmentVersionStatus.ARCHIVED },
      });
    });
    await this.audit.record({
      companyId: actor.companyId,
      eventType: ApplicationAuditEventType.ASSESSMENT_ARCHIVED,
      actorType: ApplicationActorType.RECRUITER,
      entityType: 'Assessment',
      entityId: id,
      description: 'Assessment archived',
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    });
    return this.get(id, actor.companyId);
  }

  /** Explicit recruiter approval for AI-generated drafts (never auto-approved). */
  async approveAiContent(
    versionId: string,
    questionIds: string[] | undefined,
    actor: AssessmentActor,
  ) {
    const version = await this.requireDraftVersion(versionId, actor.companyId);
    const where: Prisma.AssessmentQuestionWhereInput = { versionId };
    if (questionIds && questionIds.length > 0) where.id = { in: questionIds };
    const updated = await this.prisma.assessmentQuestion.updateMany({
      where,
      data: { aiApproved: true },
    });
    this.logger.debug(
      `Approved AI content for ${updated.count} questions on version ${version.id}`,
    );
    return this.getVersion(versionId, actor.companyId);
  }

  // ── Analytics (server-side aggregates; never ships raw PII lists) ──

  async getSummary(assessmentId: string, companyId: string) {
    const assessment = await this.requireCompanyAssessment(assessmentId, companyId);
    const versions = await this.prisma.assessmentVersion.findMany({
      where: { assessmentId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        publishedAt: true,
        questionCount: true,
        totalPoints: true,
      },
      orderBy: { versionNumber: 'desc' },
    });
    const versionIds = versions.map((v) => v.id);

    const assignments = await this.prisma.assessmentAssignment.groupBy({
      by: ['status'],
      where: { companyId, versionId: { in: versionIds } },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of assignments) byStatus[row.status] = row._count._all;

    const scoreAgg = await this.prisma.assessmentResult.aggregate({
      where: { companyId, versionId: { in: versionIds } },
      _avg: { totalScore: true },
      _count: { _all: true },
    });

    const completionTimes = await this.prisma.assessmentSession.findMany({
      where: { companyId, status: 'EVALUATED', assignment: { versionId: { in: versionIds } } },
      select: { startedAt: true, submittedAt: true },
      take: 2000,
    });
    const durations = completionTimes
      .filter((s) => s.startedAt && s.submittedAt)
      .map((s) => s.submittedAt!.getTime() - s.startedAt!.getTime());
    const avgCompletionMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const perQuestion = await this.prisma.assessmentResponse.groupBy({
      by: ['questionId'],
      where: { session: { companyId, assignment: { versionId: { in: versionIds } } } },
      _avg: { deterministicScore: true },
      _count: { _all: true },
    });

    const assigned = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const completed = (byStatus.SUBMITTED ?? 0) + (byStatus.EVALUATED ?? 0);
    return {
      assessment: { id: assessment.id, name: assessment.name, status: assessment.status },
      versions,
      assigned,
      byStatus,
      completed,
      completionRate: assigned > 0 ? Math.round((completed / assigned) * 1000) / 10 : 0,
      averageScore:
        scoreAgg._avg.totalScore != null ? Math.round(scoreAgg._avg.totalScore * 100) / 100 : null,
      scoredResults: scoreAgg._count._all,
      avgCompletionMs,
      questionPerformance: perQuestion.map((q) => ({
        questionId: q.questionId,
        averageScore: q._avg.deterministicScore,
        responseCount: q._count._all,
      })),
    };
  }

  // ── Internals ────────────────────────────────────────────────

  async requireCompanyAssessment(id: string, companyId: string) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id, companyId } });
    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Assessment not found.',
      });
    }
    return assessment;
  }

  async requireDraftVersion(versionId: string, companyId: string) {
    const version = await this.prisma.assessmentVersion.findFirst({
      where: { id: versionId, assessment: { companyId } },
      include: { assessment: { select: { id: true } } },
    });
    if (!version) {
      throw new NotFoundException({
        code: 'ASSESSMENT_VERSION_NOT_FOUND',
        message: 'Assessment version not found.',
      });
    }
    if (version.status !== AssessmentVersionStatus.DRAFT) {
      throw new ConflictException({
        code: 'VERSION_IMMUTABLE',
        message: 'Published versions are immutable. Create a new draft version to make changes.',
      });
    }
    return version;
  }

  async requirePublishedVersion(versionId: string, companyId: string) {
    const version = await this.prisma.assessmentVersion.findFirst({
      where: {
        id: versionId,
        status: AssessmentVersionStatus.PUBLISHED,
        assessment: { companyId },
      },
      include: {
        assessment: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            passingScore: true,
            maxAttempts: true,
            jobId: true,
          },
        },
        ...VERSION_WITH_TREE,
      },
    });
    if (!version) {
      throw new NotFoundException({
        code: 'ASSESSMENT_VERSION_NOT_PUBLISHED',
        message: 'Published assessment version not found.',
      });
    }
    return version;
  }

  private async requireCompanyJob(jobId: string, companyId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }
    return job;
  }

  private assertUniqueSortOrders(orders: number[], code: string, message: string): void {
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException({ code, message });
    }
  }

  private async refreshVersionTotals(
    tx: Prisma.TransactionClient,
    versionId: string,
  ): Promise<void> {
    const questions = await tx.assessmentQuestion.findMany({
      where: { versionId },
      include: { rubricCriteria: true },
    });
    const choicePoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
    const rubricPoints = questions
      .flatMap((q) => q.rubricCriteria)
      .reduce((s, c) => s + c.maxScore * (c.weight ?? 1), 0);
    await tx.assessmentVersion.update({
      where: { id: versionId },
      data: {
        questionCount: questions.length,
        totalPoints: Math.round(choicePoints + rubricPoints),
      },
    });
  }
}
