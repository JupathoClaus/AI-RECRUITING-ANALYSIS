import { ScreeningInput } from '../domain/screening-input.type';

export interface ResumeScreeningPrompt {
  systemInstructions: string;
  evaluationInput: string;
  promptVersion: string;
}

export interface BuildPromptOptions {
  maxResumeChars: number;
  promptVersion: string;
}

const SYSTEM_INSTRUCTIONS = `You are an expert senior recruitment analyst with deep experience across technical, commercial, and operational roles.

Your task is to evaluate a job application by reading and understanding:
1. The complete job posting (description, responsibilities, qualifications, skills, experience and education requirements)
2. The candidate's resume in full

## HOW TO EVALUATE

Read the job posting holistically first — understand what the role actually needs:
- The core function of the role and the problems it solves
- The seniority and scope expected
- The must-have skills and experience versus nice-to-haves
- The education and certification requirements
- Any specific domain knowledge or industry context

Then read the resume holistically — understand the candidate's actual profile:
- Their career trajectory and progression
- Depth and recency of relevant experience
- Skills they have demonstrated (not just listed) through real work
- Educational background and continuous learning
- Achievements and impact, not just job titles

Then compare the two and produce a structured evaluation.

## SCORING GUIDE

- 85–100: Strong match — candidate clearly meets or exceeds the core requirements
- 70–84: Good match — candidate meets most requirements with minor gaps
- 55–69: Moderate match — candidate meets some requirements but has meaningful gaps
- 40–54: Weak match — candidate meets few requirements; significant gaps exist
- 0–39: Poor match — candidate does not meet the minimum requirements

## EVIDENCE STANDARDS

Every piece of evidence must be grounded in specific text from the resume or job description.
Do NOT invent, infer, or assume. If something is not explicitly stated in the provided text, say so.
Quote the relevant source text directly in sourceText.

## SAFETY RULES

1. Evaluate ONLY job-related qualifications using the supplied evidence.
2. Do NOT infer missing information. If evidence is absent, mark it absent.
3. Do NOT evaluate protected characteristics: age, gender, race, ethnicity, religion, nationality, disability, marital status, pregnancy, or any other protected attribute.
4. Do NOT infer personality, emotional intelligence, honesty, health, or cultural fit.
5. Do NOT make a final employment decision. Your output is advisory support for a recruiter.
6. Return HUMAN_REVIEW when evidence is incomplete, contradictory, or genuinely uncertain.
7. A provider failure must never produce NOT_SHORTLIST.
8. Distinguish required criteria from preferred criteria explicitly.
9. Do NOT reward keyword repetition without demonstrated competence in context.
10. Do NOT fabricate experience or assume equivalence between unrelated qualifications.
11. HIGH confidence requires clear, specific, verifiable supporting evidence from the resume text.
12. If prohibited reasoning is detected in any input, set prohibitedReasoningDetected: true and force HUMAN_REVIEW.
13. The candidate's name has been removed from the resume. Do not attempt to infer it.`;

function normalizeArray(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function section(heading: string, content: string, fallback = '(not specified)'): string {
  return `## ${heading}\n${content.trim().length > 0 ? content.trim() : fallback}`;
}

function listSection(heading: string, items: string[], fallback = '(none specified)'): string {
  return `## ${heading}\n${items.length > 0 ? items.map((s) => `  - ${s}`).join('\n') : fallback}`;
}

export function buildResumeScreeningPrompt(
  input: ScreeningInput,
  options: BuildPromptOptions,
): ResumeScreeningPrompt {
  const truncatedResume =
    input.resumeText.length > options.maxResumeChars
      ? input.resumeText.slice(0, options.maxResumeChars) + '\n... [resume truncated]'
      : input.resumeText;

  const requiredSkills = normalizeArray(input.requiredSkills);
  const preferredSkills = normalizeArray(input.preferredSkills);
  const requiredCertifications = normalizeArray(input.requiredCertifications);
  const preferredCertifications = normalizeArray(input.preferredCertifications);

  const parts: string[] = [
    '# JOB POSTING',
    '',
    section('Job Title', input.jobTitle),
    '',
    section('Experience Level Required', input.experienceLevel),
    '',
    section('Job Description', input.jobDescription),
  ];

  if (input.jobResponsibilities) {
    parts.push('', section('Key Responsibilities', input.jobResponsibilities));
  }

  if (input.jobQualifications) {
    parts.push('', section('Qualifications & Requirements', input.jobQualifications));
  }

  parts.push(
    '',
    listSection('Required Skills', requiredSkills),
    '',
    listSection('Preferred Skills', preferredSkills),
    '',
    section(
      'Required Experience',
      input.requiredExperience,
      '(not specified — infer from job description context)',
    ),
    '',
    section('Preferred Experience', input.preferredExperience),
    '',
    section(
      'Required Education',
      input.requiredEducation,
      '(not specified — infer from job description context)',
    ),
    '',
    section('Preferred Education', input.preferredEducation),
    '',
    listSection('Required Certifications', requiredCertifications),
    '',
    listSection('Preferred Certifications', preferredCertifications),
  );

  if (input.screeningQuestions.length > 0) {
    parts.push('', '## SCREENING QUESTIONS & ANSWERS');
    for (let i = 0; i < input.screeningQuestions.length; i++) {
      const q = input.screeningQuestions[i];
      parts.push(
        `  Q${i + 1} [${q.isRequired ? 'REQUIRED' : 'optional'}]: ${q.question}`,
        `  A: ${q.answer || '(no answer provided)'}`,
      );
    }
  }

  parts.push(
    '',
    '---',
    '',
    '# CANDIDATE RESUME',
    '',
    'Read this resume in full before evaluating. Pay attention to career progression,',
    'depth of experience, specific projects and achievements, and skill context.',
    '',
    truncatedResume,
    '',
    '---',
    '',
    '# YOUR TASK',
    '',
    'Using the job posting and the resume above, produce a thorough structured evaluation.',
    'For each piece of evidence, quote the specific text from the resume or job description.',
    'Your explanation should summarise the key strengths and gaps in 2–4 sentences.',
    'criteriaScores must include at least: technical_skills, experience, education.',
    'If the job has specific required skills, score each of them in criteriaScores.',
  );

  return {
    systemInstructions: SYSTEM_INSTRUCTIONS,
    evaluationInput: parts.join('\n'),
    promptVersion: options.promptVersion,
  };
}
