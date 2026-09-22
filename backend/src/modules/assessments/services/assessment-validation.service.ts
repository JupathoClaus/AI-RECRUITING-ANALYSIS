import { Injectable } from '@nestjs/common';
import { AssessmentQuestionType } from '@prisma/client';

export interface ValidationOptionInput {
  id?: string;
  label: string;
  sortOrder: number;
  isCorrect?: boolean | null;
  points?: number | null;
}

export interface ValidationRubricInput {
  id?: string;
  name: string;
  maxScore: number;
  weight?: number | null;
  sortOrder: number;
}

export interface ValidationQuestionInput {
  id?: string;
  type: AssessmentQuestionType;
  prompt: string;
  sortOrder: number;
  required?: boolean | null;
  points?: number | null;
  aiEvaluated?: boolean | null;
  aiGenerated?: boolean | null;
  aiApproved?: boolean | null;
  options?: ValidationOptionInput[];
  rubricCriteria?: ValidationRubricInput[];
}

export interface AssessmentPublishInput {
  durationMinutes?: number | null;
  passingScore?: number | null;
  questions: ValidationQuestionInput[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  questionSortOrder?: number;
}

/**
 * Deterministic assessment validation. Runs before publish and before any
 * version snapshot is marked PUBLISHED. Pure — no database access, fully
 * unit-testable. AI-generated content must be recruiter-approved first.
 */
@Injectable()
export class AssessmentValidationService {
  private static readonly CHOICE_TYPES: AssessmentQuestionType[] = [
    AssessmentQuestionType.SINGLE_CHOICE,
    AssessmentQuestionType.MULTIPLE_CHOICE,
    AssessmentQuestionType.TRUE_FALSE,
  ];

  private static readonly TEXT_TYPES: AssessmentQuestionType[] = [
    AssessmentQuestionType.SHORT_TEXT,
    AssessmentQuestionType.LONG_TEXT,
  ];

  // Job-relatedness guard: deterministic keyword scan. Mirrors the intent of
  // the screening fairness validator without duplicating its implementation.
  private static readonly PROHIBITED_PATTERNS: { pattern: RegExp; label: string }[] = [
    { pattern: /\brace\b|\bethnic/i, label: 'race/ethnicity' },
    { pattern: /\breligio|\bmuslim\b|\bchristian\b|\bjew(?:ish)?\b|\bhindu\b/i, label: 'religion' },
    {
      pattern: /\bmarital status\b|\bmarried\b|\bsingle mother\b|\bpregnan/i,
      label: 'marital/family status',
    },
    {
      pattern: /\bsexual orientation\b|\bgay\b|\blesbian\b|\btransgender\b/i,
      label: 'sexual orientation',
    },
    { pattern: /\battractive|\bappearance\b|\bgood looks\b|\bbody\b/i, label: 'appearance' },
    {
      pattern: /\baccent\b|\bskin color\b|\bwhere are you (really )?from\b/i,
      label: 'origin/accent',
    },
    { pattern: /\bage\b.*\b(old|young)\b|\bborn in\b/i, label: 'age' },
  ];

  validateForPublish(input: AssessmentPublishInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (input.durationMinutes != null) {
      if (
        !Number.isInteger(input.durationMinutes) ||
        input.durationMinutes < 1 ||
        input.durationMinutes > 1440
      ) {
        issues.push({
          code: 'INVALID_DURATION',
          message: 'Duration must be between 1 and 1440 minutes.',
        });
      }
    }
    if (input.passingScore != null) {
      if (
        !Number.isInteger(input.passingScore) ||
        input.passingScore < 0 ||
        input.passingScore > 100
      ) {
        issues.push({
          code: 'INVALID_PASSING_SCORE',
          message: 'Passing score must be an integer between 0 and 100.',
        });
      }
    }

    if (!input.questions || input.questions.length === 0) {
      issues.push({
        code: 'EMPTY_ASSESSMENT',
        message: 'An assessment must contain at least one question.',
      });
      return issues;
    }
    if (input.questions.length > 200) {
      issues.push({
        code: 'TOO_MANY_QUESTIONS',
        message: 'An assessment cannot contain more than 200 questions.',
      });
    }

    const orders = input.questions.map((q) => q.sortOrder);
    if (new Set(orders).size !== orders.length) {
      issues.push({
        code: 'DUPLICATE_ORDER',
        message: 'Question ordering must be unique within a version.',
      });
    }

    let hasScoredQuestion = false;
    for (const q of input.questions) {
      this.validateQuestion(q, issues);
      const points = q.points ?? 0;
      if (
        (AssessmentValidationService.CHOICE_TYPES.includes(q.type) && points > 0) ||
        (AssessmentValidationService.TEXT_TYPES.includes(q.type) &&
          q.aiEvaluated &&
          this.hasValidRubric(q))
      ) {
        hasScoredQuestion = true;
      }
    }

    if (!hasScoredQuestion) {
      issues.push({
        code: 'NO_SCORED_QUESTION',
        message:
          'At least one question must carry points (choice) or an AI rubric (open text) so a score can be computed.',
      });
    }

    return issues;
  }

  assertPublishable(input: AssessmentPublishInput): void {
    const issues = this.validateForPublish(input);
    if (issues.length > 0) {
      const err = new Error(`Assessment is not publishable: ${issues[0].message}`) as Error & {
        code: string;
        issues: ValidationIssue[];
      };
      err.code = 'ASSESSMENT_NOT_PUBLISHABLE';
      err.issues = issues;
      throw err;
    }
  }

  private hasValidRubric(q: ValidationQuestionInput): boolean {
    return !!q.rubricCriteria && q.rubricCriteria.length > 0;
  }

  private validateQuestion(q: ValidationQuestionInput, issues: ValidationIssue[]): void {
    const ctx = { questionSortOrder: q.sortOrder };
    const prompt = (q.prompt || '').trim();
    if (prompt.length < 3) {
      issues.push({ code: 'EMPTY_PROMPT', message: 'Every question must have a prompt.', ...ctx });
    }
    if (prompt.length > 5000) {
      issues.push({
        code: 'PROMPT_TOO_LONG',
        message: 'Question prompt exceeds 5000 characters.',
        ...ctx,
      });
    }
    if ((q.points ?? 0) < 0 || !Number.isInteger(q.points ?? 0)) {
      issues.push({
        code: 'INVALID_POINTS',
        message: 'Question points must be a non-negative integer.',
        ...ctx,
      });
    }
    if (q.aiGenerated && q.aiApproved === false) {
      issues.push({
        code: 'AI_CONTENT_UNAPPROVED',
        message: 'AI-generated content must be reviewed and approved before publishing.',
        ...ctx,
      });
    }
    for (const { pattern, label } of AssessmentValidationService.PROHIBITED_PATTERNS) {
      if (pattern.test(prompt)) {
        issues.push({
          code: 'PROHIBITED_CRITERION',
          message: `Question appears to reference a non-job-related criterion (${label}). Assessments must measure job-related competencies.`,
          ...ctx,
        });
        break;
      }
    }

    if (AssessmentValidationService.CHOICE_TYPES.includes(q.type)) {
      this.validateChoiceQuestion(q, issues, ctx);
    } else {
      if (q.options && q.options.length > 0) {
        issues.push({
          code: 'UNEXPECTED_OPTIONS',
          message: 'Open-text questions must not define options.',
          ...ctx,
        });
      }
      if (q.aiEvaluated) {
        this.validateRubric(q, issues, ctx);
      } else if (q.rubricCriteria && q.rubricCriteria.length > 0) {
        issues.push({
          code: 'UNEXPECTED_RUBRIC',
          message: 'Rubric criteria require aiEvaluated to be enabled for the question.',
          ...ctx,
        });
      }
    }
  }

  private validateChoiceQuestion(
    q: ValidationQuestionInput,
    issues: ValidationIssue[],
    ctx: { questionSortOrder: number },
  ): void {
    const options = q.options || [];
    if (options.length < 2) {
      issues.push({
        code: 'MISSING_OPTIONS',
        message: 'Choice questions require at least two options.',
        ...ctx,
      });
      return;
    }
    if (options.length > 20) {
      issues.push({
        code: 'TOO_MANY_OPTIONS',
        message: 'A question cannot have more than 20 options.',
        ...ctx,
      });
    }
    const labels = options.map((o) => o.label.trim().toLowerCase());
    if (labels.some((l) => l.length === 0)) {
      issues.push({ code: 'EMPTY_OPTION', message: 'Options must not be blank.', ...ctx });
    }
    if (new Set(labels).size !== labels.length) {
      issues.push({
        code: 'DUPLICATE_OPTIONS',
        message: 'Options must be unique (case-insensitive).',
        ...ctx,
      });
    }
    const orders = options.map((o) => o.sortOrder);
    if (new Set(orders).size !== orders.length) {
      issues.push({
        code: 'DUPLICATE_OPTION_ORDER',
        message: 'Option ordering must be unique.',
        ...ctx,
      });
    }
    for (const o of options) {
      if (o.points != null && (o.points < 0 || !Number.isInteger(o.points))) {
        issues.push({
          code: 'INVALID_OPTION_POINTS',
          message: 'Option points must be non-negative integers.',
          ...ctx,
        });
      }
    }
    const correct = options.filter((o) => o.isCorrect).length;
    if (correct === 0) {
      issues.push({
        code: 'MISSING_CORRECT_ANSWER',
        message: 'Deterministically scored questions require at least one correct option.',
        ...ctx,
      });
    }
    if (
      (q.type === AssessmentQuestionType.SINGLE_CHOICE ||
        q.type === AssessmentQuestionType.TRUE_FALSE) &&
      correct > 1
    ) {
      issues.push({
        code: 'AMBIGUOUS_CORRECT_ANSWER',
        message: `${q.type} questions must have exactly one correct option.`,
        ...ctx,
      });
    }
    if (q.type === AssessmentQuestionType.TRUE_FALSE && options.length !== 2) {
      issues.push({
        code: 'INVALID_TRUE_FALSE',
        message: 'True/false questions must have exactly two options.',
        ...ctx,
      });
    }
  }

  private validateRubric(
    q: ValidationQuestionInput,
    issues: ValidationIssue[],
    ctx: { questionSortOrder: number },
  ): void {
    const criteria = q.rubricCriteria || [];
    if (criteria.length === 0) {
      issues.push({
        code: 'MISSING_RUBRIC',
        message: 'AI-evaluated questions require at least one rubric criterion.',
        ...ctx,
      });
      return;
    }
    const orders = criteria.map((c) => c.sortOrder);
    if (new Set(orders).size !== orders.length) {
      issues.push({
        code: 'DUPLICATE_RUBRIC_ORDER',
        message: 'Rubric ordering must be unique.',
        ...ctx,
      });
    }
    for (const c of criteria) {
      if (!c.name || c.name.trim().length < 2) {
        issues.push({
          code: 'INVALID_RUBRIC_NAME',
          message: 'Rubric criteria must have a name.',
          ...ctx,
        });
      }
      if (!Number.isInteger(c.maxScore) || c.maxScore < 1 || c.maxScore > 100) {
        issues.push({
          code: 'INVALID_RUBRIC_SCORE',
          message: 'Rubric maxScore must be an integer between 1 and 100.',
          ...ctx,
        });
      }
      if (c.weight != null && (!(c.weight > 0) || c.weight > 10)) {
        issues.push({
          code: 'INVALID_RUBRIC_WEIGHT',
          message: 'Rubric weight must be within (0, 10].',
          ...ctx,
        });
      }
    }
  }
}
