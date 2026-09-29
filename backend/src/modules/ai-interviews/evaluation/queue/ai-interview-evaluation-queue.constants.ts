export const AI_INTERVIEW_EVALUATION_QUEUE = 'ai-interview-evaluation';
export const AI_INTERVIEW_EVALUATE_JOB = 'evaluate-interview';

export interface AiInterviewEvaluateJobData {
  evaluationId: string;
  aiInterviewId: string;
  companyId: string;
}
