import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AssessmentQuestionType } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  AssessmentValidationService,
  ValidationQuestionInput,
} from './assessment-validation.service';
import { AssessmentsService, AssessmentActor } from './assessments.service';
import { GenerateQuestionsDto } from '../dto/assignment.dto';

export interface QuestionDraft {
  type: AssessmentQuestionType;
  prompt: string;
  instructions?: string;
  competency?: string;
  points: number;
  required: boolean;
  aiEvaluated: boolean;
  options?: { label: string; sortOrder: number; isCorrect: boolean }[];
  rubricCriteria?: {
    name: string;
    description?: string;
    guidance?: string;
    maxScore: number;
    weight: number;
    sortOrder: number;
  }[];
}

const CHOICE_TYPES = [
  AssessmentQuestionType.SINGLE_CHOICE,
  AssessmentQuestionType.MULTIPLE_CHOICE,
  AssessmentQuestionType.SHORT_TEXT,
  AssessmentQuestionType.LONG_TEXT,
  AssessmentQuestionType.TRUE_FALSE,
];

/**
 * AI-assisted question drafting. The pipeline is strictly
 * DRAFT → AI GENERATES → RECRUITER REVIEWS → RECRUITER EDITS → RECRUITER APPROVES:
 * generated questions persist with `aiGenerated=true, aiApproved=false` and
 * block publishing until explicitly approved. Generation input is
 * job/competency-driven; no candidate PII is ever involved.
 */
@Injectable()
export class AssessmentGenerationService {
  private readonly logger = new Logger(AssessmentGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly assessments: AssessmentsService,
    private readonly validation: AssessmentValidationService,
  ) {}

  async generateForAssessment(
    assessmentId: string,
    dto: GenerateQuestionsDto,
    actor: AssessmentActor,
  ): Promise<{ versionId: string; generated: number; rejected: number; questions: unknown[] }> {
    const assessment = await this.assessments.requireCompanyAssessment(
      assessmentId,
      actor.companyId,
    );
    const job = assessment.jobId
      ? await this.prisma.job.findFirst({
          where: { id: assessment.jobId, companyId: actor.companyId },
          include: { skills: { include: { skill: true } } },
        })
      : null;

    const provider = this.configService.get<string>('assessment.aiProvider') || 'mock';
    const rawDrafts =
      provider === 'qwen'
        ? await this.generateWithQwen(assessment.name, job, dto)
        : this.generateWithMock(assessment.name, job, dto);

    const { accepted, rejected } = this.filterDrafts(rawDrafts);
    if (accepted.length === 0) {
      throw new BadRequestException({
        code: 'GENERATION_REJECTED',
        message: `All ${rejected} generated draft(s) failed deterministic quality checks. Try adjusting focus areas or instructions.`,
      });
    }

    const version = await this.assessments.createDraftVersion(assessmentId, actor);
    const existingCount = await this.prisma.assessmentQuestion.count({
      where: { versionId: version.id },
    });

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < accepted.length; i++) {
        const d = accepted[i];
        await tx.assessmentQuestion.create({
          data: {
            versionId: version.id,
            type: d.type,
            prompt: d.prompt,
            instructions: d.instructions || null,
            sortOrder: existingCount + i,
            required: d.required,
            points: d.points,
            competency: d.competency || null,
            aiEvaluated: d.aiEvaluated,
            aiGenerated: true,
            aiApproved: false,
            options: d.options
              ? {
                  create: d.options.map((o) => ({
                    label: o.label,
                    sortOrder: o.sortOrder,
                    isCorrect: o.isCorrect,
                  })),
                }
              : undefined,
            rubricCriteria: d.rubricCriteria
              ? {
                  create: d.rubricCriteria.map((c) => ({
                    name: c.name,
                    description: c.description || null,
                    guidance: c.guidance || null,
                    maxScore: c.maxScore,
                    weight: c.weight,
                    sortOrder: c.sortOrder,
                  })),
                }
              : undefined,
          },
        });
      }
    });

    const saved = await this.prisma.assessmentQuestion.findMany({
      where: { versionId: version.id, aiGenerated: true, aiApproved: false },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        rubricCriteria: { orderBy: { sortOrder: 'asc' } },
      },
    });
    this.logger.log(
      `Generated ${saved.length} drafts (${rejected} rejected) for assessment ${assessmentId} via ${provider}`,
    );
    return { versionId: version.id, generated: saved.length, rejected, questions: saved };
  }

  private filterDrafts(drafts: QuestionDraft[]): { accepted: QuestionDraft[]; rejected: number } {
    const accepted: QuestionDraft[] = [];
    let rejected = 0;
    for (const d of drafts) {
      const input: ValidationQuestionInput = {
        type: d.type,
        prompt: d.prompt,
        sortOrder: accepted.length,
        required: d.required,
        points: d.points,
        aiEvaluated: d.aiEvaluated,
        aiGenerated: true,
        aiApproved: false,
        options: d.options,
        rubricCriteria: d.rubricCriteria,
      };
      // Deterministic quality gate: structural validity + fairness. Publish
      // rules (e.g. unapproved-AI) are bypassed here by construction.
      const probe = this.validation.validateForPublish({
        questions: [{ ...input, aiApproved: true }],
      });
      const structural = probe.filter((i) =>
        [
          'EMPTY_PROMPT',
          'PROMPT_TOO_LONG',
          'MISSING_OPTIONS',
          'DUPLICATE_OPTIONS',
          'EMPTY_OPTION',
          'MISSING_CORRECT_ANSWER',
          'AMBIGUOUS_CORRECT_ANSWER',
          'INVALID_TRUE_FALSE',
          'MISSING_RUBRIC',
          'INVALID_RUBRIC_SCORE',
          'PROHIBITED_CRITERION',
        ].includes(i.code),
      );
      if (structural.length > 0) {
        this.logger.debug(
          `Rejecting generated draft: ${structural[0].code} — ${d.prompt.slice(0, 80)}`,
        );
        rejected++;
        continue;
      }
      accepted.push(d);
    }
    return { accepted, rejected };
  }

  private resolveTypes(dto: GenerateQuestionsDto): AssessmentQuestionType[] {
    if (dto.questionTypes && dto.questionTypes.length > 0) {
      const valid = dto.questionTypes
        .map((t) => t.toUpperCase())
        .filter((t): t is AssessmentQuestionType => (CHOICE_TYPES as string[]).includes(t));
      if (valid.length > 0) return valid;
    }
    return [AssessmentQuestionType.SINGLE_CHOICE, AssessmentQuestionType.LONG_TEXT];
  }

  private generateWithMock(
    assessmentName: string,
    job: { title: string; description: string; responsibilities?: string | null } | null,
    dto: GenerateQuestionsDto,
  ): QuestionDraft[] {
    const types = this.resolveTypes(dto);
    const areas =
      dto.focusAreas && dto.focusAreas.length > 0 ? dto.focusAreas : ['core responsibilities'];
    const difficulty = dto.difficulty || 'intermediate';
    const subject = job?.title || assessmentName;
    const drafts: QuestionDraft[] = [];
    for (let i = 0; i < dto.count; i++) {
      const type = types[i % types.length];
      const area = areas[i % areas.length];
      if (type === AssessmentQuestionType.LONG_TEXT || type === AssessmentQuestionType.SHORT_TEXT) {
        drafts.push({
          type,
          prompt: `Describe how you would approach ${area} in a ${subject} role. Include a concrete example from your experience.`,
          competency: area,
          points: 0,
          required: true,
          aiEvaluated: true,
          rubricCriteria: [
            {
              name: `${area} — relevance`,
              description: `Response addresses ${area} directly.`,
              guidance: `0 = no relevant evidence; 1 = vague; 2 = adequate; 3 = strong with example; 4 = exceptional with quantified outcome.`,
              maxScore: 4,
              weight: 1,
              sortOrder: 0,
            },
          ],
        });
      } else if (type === AssessmentQuestionType.MULTIPLE_CHOICE) {
        drafts.push({
          type,
          prompt: `Which of the following are important when handling ${area} as a ${subject} (${difficulty} level)? Select all that apply.`,
          competency: area,
          points: 10,
          required: true,
          aiEvaluated: false,
          options: [
            {
              label: `Follow established best practices for ${area}`,
              sortOrder: 0,
              isCorrect: true,
            },
            {
              label: `Document actions and outcomes related to ${area}`,
              sortOrder: 1,
              isCorrect: true,
            },
            { label: `Ignore ${area} until explicitly asked`, sortOrder: 2, isCorrect: false },
            { label: `Delegate ${area} without verification`, sortOrder: 3, isCorrect: false },
          ],
        });
      } else if (type === AssessmentQuestionType.TRUE_FALSE) {
        drafts.push({
          type,
          prompt: `True or false: ${area} is a relevant competency for a ${subject} role.`,
          competency: area,
          points: 5,
          required: true,
          aiEvaluated: false,
          options: [
            { label: 'True', sortOrder: 0, isCorrect: true },
            { label: 'False', sortOrder: 1, isCorrect: false },
          ],
        });
      } else {
        drafts.push({
          type: AssessmentQuestionType.SINGLE_CHOICE,
          prompt: `What is the most appropriate first step when dealing with ${area} as a ${subject}?`,
          competency: area,
          points: 10,
          required: true,
          aiEvaluated: false,
          options: [
            {
              label: `Assess the situation and gather facts about ${area}`,
              sortOrder: 0,
              isCorrect: true,
            },
            { label: `Ignore the issue and continue as normal`, sortOrder: 1, isCorrect: false },
            { label: `Take immediate action without analysis`, sortOrder: 2, isCorrect: false },
            { label: `Wait for someone else to handle ${area}`, sortOrder: 3, isCorrect: false },
          ],
        });
      }
    }
    return drafts;
  }

  private async generateWithQwen(
    assessmentName: string,
    job: { title: string; description: string; responsibilities?: string | null } | null,
    dto: GenerateQuestionsDto,
  ): Promise<QuestionDraft[]> {
    const baseUrl = process.env.QWEN_BASE_URL || 'http://localhost:11434/v1';
    const model = process.env.QWEN_MODEL || 'qwen3.5:9b';
    const timeoutMs = this.configService.get<number>('assessment.aiTimeoutMs') || 60000;
    const client = new OpenAI({ apiKey: process.env.QWEN_API_KEY || 'ollama', baseURL: baseUrl });
    const types = this.resolveTypes(dto);

    const context = [
      `ASSESSMENT: ${assessmentName}`,
      job ? `JOB TITLE: ${job.title}` : null,
      job ? `<JOB_DESCRIPTION>${job.description.slice(0, 4000)}</JOB_DESCRIPTION>` : null,
      job?.responsibilities
        ? `<RESPONSIBILITIES>${job.responsibilities.slice(0, 2000)}</RESPONSIBILITIES>`
        : null,
      dto.focusAreas?.length ? `FOCUS AREAS: ${dto.focusAreas.join(', ')}` : null,
      dto.difficulty ? `DIFFICULTY: ${dto.difficulty}` : null,
      dto.instructions
        ? `<RECRUITER_INSTRUCTIONS>${dto.instructions.slice(0, 2000)}</RECRUITER_INSTRUCTIONS>`
        : null,
      `ALLOWED TYPES: ${types.join(', ')} (use only these)`,
      `COUNT: ${dto.count}`,
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          {
            role: 'system',
            content:
              'You draft job-related assessment questions as JSON. Rules: every question measures a job-related competency (never race, religion, family status, appearance, accent, age, or other protected characteristics); SINGLE_CHOICE/TRUE_FALSE have exactly one correct option; MULTIPLE_CHOICE has 2+ correct options; LONG_TEXT/SHORT_TEXT include exactly one rubric criterion with maxScore 4 and aiEvaluated true; keep prompts under 500 characters; options unique. Respond with {"questions":[{...}]} only.',
          },
          {
            role: 'user',
            content: `${context}\n\nJSON SHAPE: {"questions":[{"type":"SINGLE_CHOICE|MULTIPLE_CHOICE|SHORT_TEXT|LONG_TEXT|TRUE_FALSE","prompt":"...","competency":"...","points":10,"required":true,"aiEvaluated":false,"options":[{"label":"...","sortOrder":0,"isCorrect":true}],"rubricCriteria":[{"name":"...","description":"...","guidance":"...","maxScore":4,"weight":1,"sortOrder":0}]}]}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 6000,
      },
      { timeout: timeoutMs },
    );
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return [];
    try {
      const parsed = JSON.parse(content) as { questions?: unknown[] };
      if (!Array.isArray(parsed.questions)) return [];
      return parsed.questions.slice(0, dto.count).flatMap((q) => {
        if (typeof q !== 'object' || q === null) return [];
        const r = q as Record<string, unknown>;
        const type = String(r.type ?? '').toUpperCase();
        if (!(CHOICE_TYPES as string[]).includes(type)) return [];
        return [
          {
            type: type as AssessmentQuestionType,
            prompt: String(r.prompt ?? '').slice(0, 5000),
            competency: typeof r.competency === 'string' ? r.competency.slice(0, 120) : undefined,
            points: Number.isInteger(r.points)
              ? Math.max(0, Math.min(1000, r.points as number))
              : 10,
            required: r.required !== false,
            aiEvaluated: r.aiEvaluated === true,
            options: Array.isArray(r.options)
              ? r.options.slice(0, 20).flatMap((o, i) => {
                  if (typeof o !== 'object' || o === null) return [];
                  const oo = o as Record<string, unknown>;
                  if (typeof oo.label !== 'string' || !oo.label.trim()) return [];
                  return [
                    {
                      label: oo.label.trim().slice(0, 1000),
                      sortOrder: i,
                      isCorrect: oo.isCorrect === true,
                    },
                  ];
                })
              : undefined,
            rubricCriteria: Array.isArray(r.rubricCriteria)
              ? r.rubricCriteria.slice(0, 20).flatMap((c, i) => {
                  if (typeof c !== 'object' || c === null) return [];
                  const cc = c as Record<string, unknown>;
                  if (typeof cc.name !== 'string' || !cc.name.trim()) return [];
                  return [
                    {
                      name: cc.name.trim().slice(0, 200),
                      description:
                        typeof cc.description === 'string'
                          ? cc.description.slice(0, 2000)
                          : undefined,
                      guidance:
                        typeof cc.guidance === 'string' ? cc.guidance.slice(0, 2000) : undefined,
                      maxScore: 4,
                      weight: 1,
                      sortOrder: i,
                    },
                  ];
                })
              : undefined,
          } as QuestionDraft,
        ];
      });
    } catch {
      this.logger.warn('Qwen question generation returned unparseable output');
      return [];
    }
  }
}
