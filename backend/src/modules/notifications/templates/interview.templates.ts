/** Email template IDs for interview notifications.
 *  In a real deployment, these map to templates in SendGrid / Mailgun / SES. */

export const INTERVIEW_TEMPLATES = {
  SCHEDULED: 'interview-scheduled',
  REMINDER: 'interview-reminder',
  RESCHEDULED: 'interview-rescheduled',
  CANCELLED: 'interview-cancelled',
  COMPLETED: 'interview-completed',
  STATUS_CHANGED: 'application-status-changed',
} as const;

export type InterviewTemplateId = (typeof INTERVIEW_TEMPLATES)[keyof typeof INTERVIEW_TEMPLATES];

export interface InterviewScheduledData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  interviewType: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  location?: string;
  meetingProvider?: string;
  instructions?: string;
  interviewerNames: string[];
}

export interface InterviewReminderData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  scheduledAt: string;
  timezone: string;
  minutesUntilInterview: number;
  location?: string;
  meetingProvider?: string;
}
