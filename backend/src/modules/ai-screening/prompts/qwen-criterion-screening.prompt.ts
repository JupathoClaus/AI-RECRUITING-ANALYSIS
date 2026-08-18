import { ScreeningInput } from '../domain/screening-input.type';
import { ScreeningCriterion } from '../domain/screening-criterion.type';

export interface QwenScreeningPrompt {
  systemInstructions: string;
  evaluationInput: string;
  promptVersion: string;
}

export interface QwenPromptOptions {
  maxResumeChars: number;
  promptVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// System instructions — sent once as the system message
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS = `You are a senior recruitment analyst evaluating job applications.

You will receive:
1. A JOB DESCRIPTION with structured criteria to evaluate.
2. A CANDIDATE RESUME (personal identity has been removed).

Your task is to evaluate each criterion individually and return a structured JSON result.

## WHAT YOU MUST DO

For each criterion in the list:
- Read the criterion carefully.
- Search the resume for direct or transferable evidence.
- Determine the status using ONLY these four values:
    FULLY_MET      — candidate clearly meets the criterion with verifiable evidence
    PARTIALLY_MET  — candidate has related, adjacent, or transferable evidence but not full direct evidence
    NOT_MET        — criterion is clearly absent from the resume
    UNCERTAIN      — evidence exists but is ambiguous, unverifiable, or conflicting

- Write a reason of 2–4 sentences explaining your judgment.
- Quote the specific resume text that supports your judgment in evidence[].sourceText.
- Assign confidence:
    HIGH   — clear, specific, verifiable evidence present
    MEDIUM — partial or indirect evidence
    LOW    — very little evidence or mostly inference

## SEMANTIC REASONING — THIS IS MANDATORY

You MUST reason semantically, not by keyword matching.

Examples of correct semantic reasoning:
- Job requires "REST API development" → Resume says "built NestJS HTTP endpoints" → FULLY_MET
- Job requires "relational databases" → Resume says "designed PostgreSQL schemas" → FULLY_MET
- Job requires "Linux server administration" → Resume says "administered Ubuntu production infrastructure" → FULLY_MET
- Job requires "leadership experience" → Resume says "led a five-person development team" → FULLY_MET
- Job requires "culinary experience" → Resume says "prepared meals for a hotel restaurant" → FULLY_MET
- Job requires "NestJS" → Resume says "built Node.js and Express REST APIs" → PARTIALLY_MET (related framework, not direct)
- Job requires "TypeScript" → Resume says "I have never worked with TypeScript" → NOT_MET

Do NOT produce FULLY_MET if the skill is only listed in a skills section with no demonstrated use in work or projects.
Prefer PARTIALLY_MET when there is strong adjacent experience but not exact match.
Use UNCERTAIN when dates are unclear or evidence is ambiguous.

## TRANSFERABLE SKILLS

Recognise transferable and adjacent experience.
Example: NestJS required, candidate has Node.js + Express + TypeScript → PARTIALLY_MET, not NOT_MET.
Example: PostgreSQL required, candidate has MySQL + SQLite experience → PARTIALLY_MET.

## NEGATION DETECTION

If the resume explicitly states the candidate does NOT have a skill or experience, return NOT_MET.
Example: "I have never worked with TypeScript" → TypeScript criterion → NOT_MET.

## WHAT YOU MUST NOT DO

- Do NOT produce a final numeric score. The backend calculates the score.
- Do NOT make a hiring decision. Your output is advisory only.
- Do NOT fabricate experience that is not in the resume.
- Do NOT infer facts that are not stated.
- Do NOT evaluate age, gender, race, ethnicity, religion, nationality, disability,
  marital status, pregnancy, or any other protected characteristic.
- Do NOT infer personality, culture fit, or emotional intelligence.
- Do NOT consider the candidate's name (it has been removed).

## PROHIBITED REASONING

If you detect that your reasoning involves protected characteristics, set:
  "prohibitedReasoningDetected": true
and do not produce disqualifying judgments based on those characteristics.

## EVIDENCE REQUIREMENTS

- sourceText must be a direct quote or close paraphrase from the resume.
- sourceCategory must be "RESUME" when quoting the resume, "JOB_REQUIREMENT" when referencing the job.
- If no direct evidence exists, use sourceText: "" and sourceCategory: "UNKNOWN".

## OUTPUT FORMAT

Return ONLY a valid JSON object. No text before or after it.
`;

// ─────────────────────────────────────────────────────────────────────────────
// JSON schema description embedded in the user message (for json_object mode)
// ─────────────────────────────────────────────────────────────────────────────

const JSON_STRUCTURE_BLOCK = `
## REQUIRED JSON STRUCTURE

Return exactly this structure:

{
  "criterionEvaluations": [
    {
      "criterionId": "<id from the criterion list>",
      "criterion": "<criterion name>",
      "requirementType": "HARD_REQUIREMENT" | "REQUIRED" | "PREFERRED",
      "status": "FULLY_MET" | "PARTIALLY_MET" | "NOT_MET" | "UNCERTAIN",
      "reason": "<2–4 sentences grounded in evidence>",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "evidence": [
        {
          "sourceCategory": "RESUME" | "JOB_REQUIREMENT" | "UNKNOWN",
          "sourceText": "<direct quote from resume or job description, or empty string>"
        }
      ]
    }
  ],
  "summary": "<2–3 sentences overall assessment of fit for the recruiter>",
  "warnings": ["<any concerns that do not fit a specific criterion>"],
  "prohibitedReasoningDetected": false
}

Rules:
- criterionEvaluations MUST contain one entry per criterion in the list, in the same order.
- criterionId MUST match the id field from the criterion list exactly.
- evidence array must have at least one item per evaluation.
- summary must be 2–3 sentences.
- warnings may be an empty array.
- Do NOT add any fields not listed above.
- Do NOT produce a numeric score.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function formatCriteriaBlock(criteria: ScreeningCriterion[]): string {
  const lines: string[] = ['## EVALUATION CRITERIA', ''];
  lines.push(
    'Evaluate each criterion below. Return one evaluation per criterion in criterionEvaluations.',
    '',
  );

  for (const c of criteria) {
    lines.push(`### Criterion ID: ${c.id}`);
    lines.push(`Name: ${c.name}`);
    lines.push(`Requirement type: ${c.requirementType}`);
    lines.push(`Category: ${c.category}`);
    if (c.minimumYears != null) {
      lines.push(`Minimum years required: ${c.minimumYears}`);
    }
    if (c.acceptedEvidence && c.acceptedEvidence.length > 0) {
      lines.push(`Accepted evidence (examples only — do NOT keyword match): ${c.acceptedEvidence.join(', ')}`);
    }
    lines.push(`Description: ${c.description}`);
    lines.push('');
  }

  return lines.join('\n');
}

function section(heading: string, content: string, fallback = '(not specified)'): string {
  const body = content?.trim();
  return `## ${heading}\n${body && body.length > 0 ? body : fallback}`;
}

export function buildQwenCriterionPrompt(
  input: ScreeningInput,
  options: QwenPromptOptions,
): QwenScreeningPrompt {
  const criteria = input.criteria ?? [];

  const truncatedResume =
    input.resumeText.length > options.maxResumeChars
      ? input.resumeText.slice(0, options.maxResumeChars) + '\n... [resume truncated]'
      : input.resumeText;

  const parts: string[] = [
    '# JOB INFORMATION',
    '',
    section('Job Title', input.jobTitle),
    '',
    section('Seniority Level', input.experienceLevel),
    '',
    section('Job Description', input.jobDescription),
  ];

  if (input.jobResponsibilities?.trim()) {
    parts.push('', section('Key Responsibilities', input.jobResponsibilities));
  }

  if (input.jobQualifications?.trim()) {
    parts.push('', section('Qualifications & Requirements', input.jobQualifications));
  }

  parts.push('', '---', '');

  if (criteria.length > 0) {
    parts.push(formatCriteriaBlock(criteria), '---', '');
  } else {
    // Fallback when no structured criteria — provide skill/experience context
    if (input.requiredSkills.length > 0) {
      parts.push(`## Required Skills\n${input.requiredSkills.map((s) => `  - ${s}`).join('\n')}`, '');
    }
    if (input.preferredSkills.length > 0) {
      parts.push(`## Preferred Skills\n${input.preferredSkills.map((s) => `  - ${s}`).join('\n')}`, '');
    }
    if (input.requiredExperience?.trim()) {
      parts.push(section('Required Experience', input.requiredExperience), '');
    }
    if (input.requiredEducation?.trim()) {
      parts.push(section('Required Education', input.requiredEducation), '');
    }
    parts.push('---', '');
  }

  parts.push(
    '# CANDIDATE RESUME',
    '',
    'The candidate\'s name and contact details have been removed.',
    'Evaluate qualifications only.',
    '',
    truncatedResume,
    '',
    '---',
    '',
    JSON_STRUCTURE_BLOCK,
  );

  return {
    systemInstructions: SYSTEM_INSTRUCTIONS,
    evaluationInput: parts.join('\n'),
    promptVersion: options.promptVersion,
  };
}
