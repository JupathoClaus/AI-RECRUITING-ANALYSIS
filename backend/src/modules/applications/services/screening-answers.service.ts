import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ApplicationActorType,
  ApplicationAuditEventType,
  ScreeningQuestionType,
} from '@prisma/client';
import { ApplicationAuditService } from './application-audit.service';
import { ScreeningAnswerInputDto } from '../dto/create-application.dto';

@Injectable()
export class ScreeningAnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ApplicationAuditService,
  ) {}

  async getAnswers(applicationId: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    const answers = await this.prisma.applicationScreeningAnswer.findMany({
      where: { applicationId },
    });
    // Never expose expectedAnswer from questions
    return answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      textAnswer: a.textAnswer,
      numericAnswer: a.numericAnswer ? Number(a.numericAnswer) : null,
      dateAnswer: a.dateAnswer,
      answer: a.answer,
      isComplete: a.isComplete,
      recruiterReviewed: a.recruiterReviewed,
      recruiterReviewNotes: a.recruiterReviewNotes,
    }));
  }

  async upsertAnswers(
    applicationId: string,
    companyId: string,
    answers: ScreeningAnswerInputDto[],
    membershipId: string,
    requestId?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
      include: { job: { include: { screeningQuestions: { where: { deletedAt: null } } } } },
    });
    if (!app)
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });

    const jobQuestionIds = new Set(app.job.screeningQuestions.map((q: any) => q.id));
    const questionsMap = new Map(app.job.screeningQuestions.map((q: any) => [q.id, q]));

    for (const answer of answers) {
      if (!jobQuestionIds.has(answer.questionId)) {
        throw new BadRequestException({
          code: 'APPLICATION_STAGE_INVALID',
          message: `Question ${answer.questionId} does not belong to this job`,
        });
      }
      const q = questionsMap.get(answer.questionId) as any;
      this.validateAnswerType(q, answer);
    }

    return this.prisma.$transaction(async (tx) => {
      for (const a of answers) {
        const isComplete = !!(a.textAnswer || a.numericAnswer != null || a.dateAnswer || a.answer);
        await tx.applicationScreeningAnswer.upsert({
          where: { applicationId_questionId: { applicationId, questionId: a.questionId } },
          update: {
            textAnswer: a.textAnswer ?? null,
            numericAnswer: a.numericAnswer ?? null,
            dateAnswer: a.dateAnswer ? new Date(a.dateAnswer) : null,
            answer: a.answer ?? undefined,
            isComplete,
            answeredAt: new Date(),
          },
          create: {
            applicationId,
            questionId: a.questionId,
            textAnswer: a.textAnswer ?? null,
            numericAnswer: a.numericAnswer ?? null,
            dateAnswer: a.dateAnswer ? new Date(a.dateAnswer) : null,
            answer: a.answer ?? undefined,
            isComplete,
          },
        });
      }

      await this.auditService.record({
        companyId,
        applicationId,
        candidateId: app.candidateId,
        actorType: ApplicationActorType.RECRUITER,
        actorMembershipId: membershipId,
        eventType: ApplicationAuditEventType.APPLICATION_SCREENING_ANSWERS_UPDATED,
        entityType: 'Application',
        entityId: applicationId,
        description: `${answers.length} screening answer(s) updated`,
        requestId,
        tx,
      });

      return this.getAnswers(applicationId, companyId);
    });
  }

  private validateAnswerType(question: any, answer: ScreeningAnswerInputDto) {
    switch (question.type as ScreeningQuestionType) {
      case ScreeningQuestionType.NUMBER:
        if (answer.numericAnswer == null && answer.textAnswer == null) break;
        break;
      case ScreeningQuestionType.DATE:
        if (answer.dateAnswer && isNaN(Date.parse(answer.dateAnswer))) {
          throw new BadRequestException(`Invalid date answer for question ${question.id}`);
        }
        break;
    }
  }
}
