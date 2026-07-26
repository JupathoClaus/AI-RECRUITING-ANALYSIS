export interface AiScreeningJobData {
  screeningId: string;
  applicationId: string;
  companyId: string;
  initiatedByUserId: string;
  requestId?: string;
  inputFingerprint: string;
}
