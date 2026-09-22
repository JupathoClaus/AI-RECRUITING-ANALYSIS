export const ASSESSMENT_QUEUE = 'assessment-evaluation';
export const ASSESSMENT_EVALUATE_JOB = 'evaluate-submission';
export const ASSESSMENT_BULK_ASSIGN_JOB = 'bulk-assign';

export interface AssessmentEvaluateJobData {
  evaluationId: string;
  sessionId: string;
  companyId: string;
}

export interface AssessmentBulkAssignJobData {
  versionId: string;
  companyId: string;
  applicationIds: string[];
  dueAt: string | null;
  requestedByMembershipId: string;
  requestedByUserId: string;
}
