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

const SAFETY_INSTRUCTIONS = `
## SAFETY RULES

1. Evaluate ONLY job-related qualifications using the supplied evidence.
2. Do NOT infer missing information. If evidence is absent, state it is absent.
3. Do NOT evaluate protected characteristics: age, gender, race, ethnicity, religion, nationality, disability, marital status, pregnancy, or any other protected attribute.
4. Do NOT infer personality, honesty, emotion, health, intelligence, or cultural fit.
5. Do NOT make a final employment decision. Your output is a recommendation only.
6. Return HUMAN_REVIEW when evidence is incomplete, contradictory, or uncertain.
7. A provider error must never lead to NOT_SHORTLIST.
8. Explanations must cite specific job-related evidence from the input.
9. Distinguish required criteria from preferred criteria in your evaluation.
10. Do NOT reward keyword repetition without demonstrated competence.
11. Do NOT fabricate experience or assume equivalence between unrelated qualifications.
12. HIGH confidence requires clear, specific supporting evidence.
13. If you detect prohibited reasoning in the input, mark prohibitedReasoningDetected as true and force HUMAN_REVIEW.`;

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

  const evaluationInput = [
    `## JOB DETAILS`,
    `Title: ${input.jobTitle}`,
    `Description: ${input.jobDescription}`,
    ``,
    `## REQUIRED SKILLS`,
    requiredSkills.length > 0
      ? requiredSkills.map((s) => `  - ${s}`).join('\n')
      : '  (none specified)',
    ``,
    `## PREFERRED SKILLS`,
    preferredSkills.length > 0
      ? preferredSkills.map((s) => `  - ${s}`).join('\n')
      : '  (none specified)',
    ``,
    `## REQUIRED EXPERIENCE`,
    input.requiredExperience || 'Not specified',
    ``,
    `## PREFERRED EXPERIENCE`,
    input.preferredExperience || 'Not specified',
    ``,
    `## REQUIRED EDUCATION`,
    input.requiredEducation || 'Not specified',
    ``,
    `## PREFERRED EDUCATION`,
    input.preferredEducation || 'Not specified',
    ``,
    `## REQUIRED CERTIFICATIONS`,
    requiredCertifications.length > 0
      ? requiredCertifications.map((c) => `  - ${c}`).join('\n')
      : '  (none specified)',
    ``,
    `## PREFERRED CERTIFICATIONS`,
    preferredCertifications.length > 0
      ? preferredCertifications.map((c) => `  - ${c}`).join('\n')
      : '  (none specified)',
    ``,
    `## SCREENING QUESTIONS`,
    input.screeningQuestions.length > 0
      ? input.screeningQuestions
          .map(
            (q, i) => `  Q${i + 1}: ${q.question}\n  A: ${q.answer}\n  Required: ${q.isRequired}`,
          )
          .join('\n')
      : '  (none)',
    ``,
    `## RESUME TEXT`,
    truncatedResume,
  ].join('\n');

  return {
    systemInstructions: `You are an expert recruitment analyst. Evaluate the job application by comparing the resume against the job requirements.${SAFETY_INSTRUCTIONS}`,
    evaluationInput,
    promptVersion: options.promptVersion,
  };
}
