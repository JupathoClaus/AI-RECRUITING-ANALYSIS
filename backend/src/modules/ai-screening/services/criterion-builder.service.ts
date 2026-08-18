import { Injectable } from '@nestjs/common';
import {
  ScreeningCriterion,
  CriterionCategory,
  CriterionRequirementType,
} from '../domain/screening-criterion.type';
import { ApplicationData } from './screening-input-builder.service';

// Weight budgets — must sum to 1.0 across a well-formed job.
// The builder normalises after construction so rounding never breaks scoring.
const WEIGHT_SKILL_REQUIRED = 0.12;
const WEIGHT_SKILL_PREFERRED = 0.05;
const WEIGHT_EXPERIENCE_REQUIRED = 0.25;
const WEIGHT_EXPERIENCE_PREFERRED = 0.08;
const WEIGHT_EDUCATION_REQUIRED = 0.15;
const WEIGHT_EDUCATION_PREFERRED = 0.05;

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  NONE: 'No formal education required',
  SECONDARY: 'Secondary / High School diploma',
  CERTIFICATE: 'Certificate qualification',
  DIPLOMA: 'Diploma',
  ASSOCIATE: "Associate's degree",
  BACHELORS: "Bachelor's degree",
  MASTERS: "Master's degree",
  DOCTORATE: 'Doctorate / PhD',
  PROFESSIONAL: 'Professional degree (MD, JD, etc.)',
  OTHER: 'Recognised qualification',
};

const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  ENTRY: 'Entry-level (0–1 years)',
  JUNIOR: 'Junior (1–3 years)',
  MID: 'Mid-level (3–5 years)',
  SENIOR: 'Senior (5–8 years)',
  LEAD: 'Lead / Principal (8+ years)',
  MANAGER: 'Manager',
  DIRECTOR: 'Director',
  EXECUTIVE: 'Executive / C-level',
  NOT_SPECIFIED: 'Not specified',
};

function toNumber(v: number | { toNumber(): number }): number {
  return typeof v === 'number' ? v : v.toNumber();
}

function importanceToCriterionType(importance: string): CriterionRequirementType {
  switch (importance) {
    case 'REQUIRED':
      return 'REQUIRED';
    case 'PREFERRED':
    case 'OPTIONAL':
      return 'PREFERRED';
    default:
      return 'PREFERRED';
  }
}

/**
 * Normalises weights so they sum to 1.0 (handles rounding and partial job data).
 * Mutates the array in place, returns it for chaining.
 */
function normaliseWeights(criteria: ScreeningCriterion[]): ScreeningCriterion[] {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return criteria;
  const factor = 1 / total;
  for (const c of criteria) {
    // Round to 4 decimal places to avoid floating-point drift
    (c as { weight: number }).weight = Math.round(c.weight * factor * 10000) / 10000;
  }
  return criteria;
}

@Injectable()
export class CriterionBuilderService {
  /**
   * Build a ScreeningCriterion[] from structured job data on the Application.
   *
   * Source priority:
   * 1. JobSkill records (required + preferred skills)
   * 2. JobExperienceRequirement records
   * 3. JobEducationRequirement records
   * 4. Fallback: experienceLevel enum label when no explicit requirements exist
   *
   * The AI is never asked to invent criteria — it only evaluates these.
   */
  build(application: ApplicationData): ScreeningCriterion[] {
    const job = application.job;
    const criteria: ScreeningCriterion[] = [];
    let counter = 0;

    const nextId = (prefix: string) => `${prefix}-${++counter}`;

    // ── 1. Skills ────────────────────────────────────────────────────────────
    for (const js of job.skills) {
      const isRequired = js.importance === 'REQUIRED';
      const requirementType: CriterionRequirementType = importanceToCriterionType(js.importance);
      const weight = isRequired ? WEIGHT_SKILL_REQUIRED : WEIGHT_SKILL_PREFERRED;

      criteria.push({
        id: nextId('skill'),
        name: js.skill.displayName,
        description: `${requirementType === 'REQUIRED' ? 'Required' : 'Preferred'} skill: ${js.skill.displayName}. Look for demonstrated use in work, projects, or education — not just a listing in a skills section.`,
        requirementType,
        category: 'SKILL',
        weight,
        acceptedEvidence: [js.skill.displayName],
      });
    }

    // ── 2. Experience requirements ───────────────────────────────────────────
    for (const er of job.experienceRequirements ?? []) {
      const requirementType = importanceToCriterionType(er.importance);
      const isRequired = requirementType === 'REQUIRED';
      const min = toNumber(er.minimumYears);
      const max = er.maximumYears != null ? toNumber(er.maximumYears) : null;
      const yearsPart = max != null ? `${min}–${max} years` : `${min}+ years`;
      const domainPart = er.domain ? ` in ${er.domain}` : '';
      const titlePart = er.title ? ` as ${er.title}` : '';
      const notePart = er.description ? ` (${er.description})` : '';
      const name = `${yearsPart}${domainPart}${titlePart}`;
      const description =
        `${isRequired ? 'Required' : 'Preferred'} experience: ${yearsPart}${domainPart}${titlePart}${notePart}. ` +
        `Evaluate total relevant experience shown across all roles, including transferable or adjacent experience. ` +
        `Partial credit is appropriate if the candidate shows strong adjacent experience below the stated minimum.`;

      criteria.push({
        id: nextId('exp'),
        name,
        description,
        requirementType,
        category: 'EXPERIENCE',
        weight: isRequired ? WEIGHT_EXPERIENCE_REQUIRED : WEIGHT_EXPERIENCE_PREFERRED,
        minimumYears: min,
      });
    }

    // ── 3. Education requirements ────────────────────────────────────────────
    for (const ed of job.educationRequirements ?? []) {
      const requirementType = importanceToCriterionType(ed.importance);
      const isRequired = requirementType === 'REQUIRED';
      const levelLabel = EDUCATION_LEVEL_LABELS[ed.level] || ed.level;
      const fieldPart = ed.fieldOfStudy ? ` in ${ed.fieldOfStudy}` : '';
      const notePart = ed.notes ? ` — ${ed.notes}` : '';
      const name = `${levelLabel}${fieldPart}`;
      const description =
        `${isRequired ? 'Required' : 'Preferred'} education: ${levelLabel}${fieldPart}${notePart}. ` +
        `Relevant equivalent professional experience may satisfy this requirement — judge contextually.`;

      criteria.push({
        id: nextId('edu'),
        name,
        description,
        requirementType,
        category: 'EDUCATION',
        weight: isRequired ? WEIGHT_EDUCATION_REQUIRED : WEIGHT_EDUCATION_PREFERRED,
      });
    }

    // ── 4. Fallback experience criterion ────────────────────────────────────
    // If no explicit experience requirements exist, synthesise one from the
    // job's experienceLevel enum so the model always has seniority context.
    if (
      (job.experienceRequirements ?? []).length === 0 &&
      job.experienceLevel &&
      job.experienceLevel !== 'NOT_SPECIFIED'
    ) {
      const label = EXPERIENCE_LEVEL_LABELS[job.experienceLevel] || job.experienceLevel;
      criteria.push({
        id: nextId('exp'),
        name: `${label} experience`,
        description:
          `Required seniority: ${label}. ` +
          `Evaluate the candidate's overall career progression, scope of responsibilities, ` +
          `and demonstrated impact against this seniority expectation.`,
        requirementType: 'REQUIRED' as const,
        category: 'EXPERIENCE' as const,
        weight: WEIGHT_EXPERIENCE_REQUIRED,
      });
    }

    if (criteria.length === 0) return criteria;

    return normaliseWeights(criteria);
  }

  /**
   * Returns true when the job has enough structured data to produce
   * meaningful criteria for the Qwen provider.
   */
  hasSufficientCriteria(application: ApplicationData): boolean {
    const job = application.job;
    return (
      job.skills.length > 0 ||
      (job.experienceRequirements ?? []).length > 0 ||
      (job.educationRequirements ?? []).length > 0 ||
      !!(job.experienceLevel && job.experienceLevel !== 'NOT_SPECIFIED')
    );
  }
}
