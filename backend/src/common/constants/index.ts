export const APP_CONSTANTS = {
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 10,
  DEFAULT_PAGE: 1,
  DATE_FORMAT: 'YYYY-MM-DD',
  DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\+?[\d\s-]+$/,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

export const CACHE_KEYS = {
  USER: 'user:',
  COMPANY: 'company:',
  JOB: 'job:',
  CANDIDATE: 'candidate:',
  APPLICATION: 'application:',
  INTERVIEW: 'interview:',
  REPORT: 'report:',
  ANALYTICS: 'analytics:',
  SETTINGS: 'settings:',
} as const;

export const CACHE_TTL = {
  SHORT: 30,
  MEDIUM: 300,
  LONG: 3600,
  VERY_LONG: 86400,
} as const;

export const PAGINATION = {
  DEFAULT_SKIP: 0,
  DEFAULT_TAKE: 10,
  MAX_TAKE: 100,
} as const;

export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password-reset',
  INTERVIEW_INVITATION: 'interview-invitation',
  APPLICATION_RECEIVED: 'application-received',
  APPLICATION_STATUS_CHANGED: 'application-status-changed',
} as const;

export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  AI_PROCESSING: 'ai-processing',
} as const;

export const JOB_PRIORITIES = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
  CRITICAL: 15,
} as const;
