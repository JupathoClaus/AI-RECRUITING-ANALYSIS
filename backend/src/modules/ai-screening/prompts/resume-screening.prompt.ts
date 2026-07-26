import { ScreeningInput } from '../domain/screening-input.type';

export interface ResumeScreeningPrompt {
  systemInstructions: string;
  evaluationInput: string;
  promptVersion: string;
}

const MAX_RESUME_CHARS = 15000;
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

export function buildResumeScreeningPrompt(input: ScreeningInput): ResumeScreeningPrompt {
  const truncatedResume = input.resumeText.length > MAX_RESUME_CHARS
    ? input.resumeText.slice(0, MAX_RESUME_CHARS) + '\n... [resume truncated]'
    : input.resumeText;

  const evaluationInput = [
    `## JOB DETAILS`,
    `Title: ${input.jobTitle}`,
    `Description: ${input.jobDescription}`,
    ``,
    `## REQUIRED SKILLS`,
    input.requiredSkills.length > 0 ? input.requiredSkills.map((s) => `  - ${s}`).join('\n') : '  (none specified)',
    ``,
    `## PREFERRED SKILLS`,
    input.preferredSkills.length > 0 ? input.preferredSkills.map((s) => `  - ${s}`).join('\n') : '  (none specified)',
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
    input.requiredCertifications.length > 0 ? input.requiredCertifications.map((c) => `  - ${c}`).join('\n') : '  (none specified)',
    ``,
    `## PREFERRED CERTIFICATIONS`,
    input.preferredCertifications.length > 0 ? input.preferredCertifications.map((c) => `  - ${c}`).join('\n') : '  (none specified)',
    ``,
    `## SCREENING QUESTIONS`,
    input.screeningQuestions.length > 0
      ? input.screeningQuestions.map((q, i) => `  Q${i + 1}: ${q.question}\n  A: ${q.answer}\n  Required: ${q.isRequired}`).join('\n')
      : '  (none)',
    ``,
    `## RESUME TEXT`,
    truncatedResume,
  ].join('\n');

  return {
    systemInstructions: `You are an expert recruitment analyst. Evaluate the job application by comparing the resume against the job requirements.${SAFETY_INSTRUCTIONS}`,
    evaluationInput,
    promptVersion: input.promptVersion || 'v1',
  };
}
