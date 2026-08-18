import { ScreeningConfidence } from '../domain/screening-confidence.enum';
import { ScreeningSourceCategory } from '../domain/screening-source-category.enum';
import { CriterionStatus, QwenScreeningOutput, CriterionEvaluation } from '../domain/criterion-evaluation.type';
import { CriterionRequirementType } from '../domain/screening-criterion.type';
import { AiScreeningMalformedResponseError } from '../providers/ai-screening-provider.errors';

const ALLOWED_STATUSES = new Set<CriterionStatus>(['FULLY_MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN']);
const ALLOWED_CONFIDENCE = new Set(Object.values(ScreeningConfidence));
const ALLOWED_SOURCE_CATEGORIES = new Set(Object.values(ScreeningSourceCategory));
const ALLOWED_REQUIREMENT_TYPES = new Set<CriterionRequirementType>(['HARD_REQUIREMENT', 'REQUIRED', 'PREFERRED']);

const MAX_CRITERIA = 50;
const MAX_EVIDENCE_PER_CRITERION = 20;
const MAX_WARNINGS = 20;
const MAX_STRING_LEN = 5000;

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AiScreeningMalformedResponseError(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_STRING_LEN) {
    throw new AiScreeningMalformedResponseError(`${field} exceeds max length ${MAX_STRING_LEN}`);
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new AiScreeningMalformedResponseError(`${field} must be a string`);
  }
  return value;
}

/**
 * Validate and parse the raw JSON object returned by the Qwen model.
 * Throws AiScreeningMalformedResponseError on any schema violation.
 */
export function validateQwenOutput(raw: unknown, expectedCriterionIds?: string[]): QwenScreeningOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new AiScreeningMalformedResponseError('Qwen output must be a non-null object');
  }

  const obj = raw as Record<string, unknown>;

  // ── criterionEvaluations ──────────────────────────────────────────────────
  if (!Array.isArray(obj.criterionEvaluations)) {
    throw new AiScreeningMalformedResponseError('criterionEvaluations must be an array');
  }

  if (obj.criterionEvaluations.length > MAX_CRITERIA) {
    throw new AiScreeningMalformedResponseError(
      `criterionEvaluations exceeds max length ${MAX_CRITERIA}`,
    );
  }

  const evaluations: CriterionEvaluation[] = [];

  for (let i = 0; i < obj.criterionEvaluations.length; i++) {
    const item = obj.criterionEvaluations[i];
    if (typeof item !== 'object' || item === null) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}] must be a non-null object`,
      );
    }

    const ev = item as Record<string, unknown>;

    const criterionId = assertNonEmptyString(ev.criterionId, `criterionEvaluations[${i}].criterionId`);
    const criterion = assertNonEmptyString(ev.criterion, `criterionEvaluations[${i}].criterion`);

    const requirementType = assertString(ev.requirementType, `criterionEvaluations[${i}].requirementType`);
    if (!ALLOWED_REQUIREMENT_TYPES.has(requirementType as CriterionRequirementType)) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}].requirementType must be one of: ${Array.from(ALLOWED_REQUIREMENT_TYPES).join(', ')}`,
      );
    }

    const status = assertString(ev.status, `criterionEvaluations[${i}].status`);
    if (!ALLOWED_STATUSES.has(status as CriterionStatus)) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}].status must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}`,
      );
    }

    const reason = assertNonEmptyString(ev.reason, `criterionEvaluations[${i}].reason`);

    const confidence = assertString(ev.confidence, `criterionEvaluations[${i}].confidence`);
    if (!ALLOWED_CONFIDENCE.has(confidence as ScreeningConfidence)) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}].confidence must be one of: ${Array.from(ALLOWED_CONFIDENCE).join(', ')}`,
      );
    }

    // evidence
    if (!Array.isArray(ev.evidence)) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}].evidence must be an array`,
      );
    }
    if (ev.evidence.length > MAX_EVIDENCE_PER_CRITERION) {
      throw new AiScreeningMalformedResponseError(
        `criterionEvaluations[${i}].evidence exceeds max length ${MAX_EVIDENCE_PER_CRITERION}`,
      );
    }

    for (let j = 0; j < ev.evidence.length; j++) {
      const evItem = ev.evidence[j];
      if (typeof evItem !== 'object' || evItem === null) {
        throw new AiScreeningMalformedResponseError(
          `criterionEvaluations[${i}].evidence[${j}] must be a non-null object`,
        );
      }
      const e = evItem as Record<string, unknown>;
      const sourceCat = assertString(e.sourceCategory, `criterionEvaluations[${i}].evidence[${j}].sourceCategory`);
      if (!ALLOWED_SOURCE_CATEGORIES.has(sourceCat as ScreeningSourceCategory)) {
        throw new AiScreeningMalformedResponseError(
          `criterionEvaluations[${i}].evidence[${j}].sourceCategory invalid: ${sourceCat}`,
        );
      }
      if (typeof e.sourceText !== 'string') {
        throw new AiScreeningMalformedResponseError(
          `criterionEvaluations[${i}].evidence[${j}].sourceText must be a string`,
        );
      }
      if (e.sourceText.length > MAX_STRING_LEN) {
        throw new AiScreeningMalformedResponseError(
          `criterionEvaluations[${i}].evidence[${j}].sourceText exceeds max length`,
        );
      }
    }

    evaluations.push({
      criterionId,
      criterion,
      requirementType: requirementType as CriterionRequirementType,
      status: status as CriterionStatus,
      reason,
      confidence: confidence as ScreeningConfidence,
      evidence: (ev.evidence as Array<Record<string, string>>).map((e) => ({
        sourceCategory: e.sourceCategory as ScreeningSourceCategory,
        sourceText: e.sourceText,
      })),
    });
  }

  // ── Cross-check criterion IDs if we know what to expect ───────────────────
  if (expectedCriterionIds && expectedCriterionIds.length > 0) {
    const returnedIds = new Set(evaluations.map((e) => e.criterionId));
    const missingIds = expectedCriterionIds.filter((id) => !returnedIds.has(id));
    if (missingIds.length > 0) {
      throw new AiScreeningMalformedResponseError(
        `Qwen did not evaluate all criteria. Missing: ${missingIds.join(', ')}`,
      );
    }
  }

  // ── summary ───────────────────────────────────────────────────────────────
  const summary = assertNonEmptyString(obj.summary, 'summary');

  // ── warnings ─────────────────────────────────────────────────────────────
  if (!Array.isArray(obj.warnings)) {
    throw new AiScreeningMalformedResponseError('warnings must be an array');
  }
  if (obj.warnings.length > MAX_WARNINGS) {
    throw new AiScreeningMalformedResponseError(`warnings exceeds max length ${MAX_WARNINGS}`);
  }
  for (const w of obj.warnings) {
    if (typeof w !== 'string') {
      throw new AiScreeningMalformedResponseError('Each warning must be a string');
    }
  }

  // ── prohibitedReasoningDetected ───────────────────────────────────────────
  if (typeof obj.prohibitedReasoningDetected !== 'boolean') {
    throw new AiScreeningMalformedResponseError('prohibitedReasoningDetected must be a boolean');
  }

  return {
    criterionEvaluations: evaluations,
    summary,
    warnings: obj.warnings as string[],
    prohibitedReasoningDetected: obj.prohibitedReasoningDetected,
  };
}
