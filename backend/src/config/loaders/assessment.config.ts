import { registerAs } from '@nestjs/config';

export interface AssessmentConfig {
  accessTokenSecret: string;
  accessTokenTtlMinutes: number;
  codeLength: number;
  defaultDurationMinutes: number;
  maxBulkAssign: number;
  workerConcurrency: number;
  aiProvider: 'mock' | 'qwen';
  aiTimeoutMs: number;
  aiPromptVersion: string;
  aiSchemaVersion: string;
}

export default registerAs('assessment', (): AssessmentConfig => ({
  accessTokenSecret: process.env.ASSESSMENT_ACCESS_TOKEN_SECRET || '',
  accessTokenTtlMinutes: parseInt(process.env.ASSESSMENT_ACCESS_TOKEN_TTL_MINUTES || '120', 10),
  codeLength: 8,
  defaultDurationMinutes: parseInt(process.env.ASSESSMENT_DEFAULT_DURATION_MINUTES || '30', 10),
  maxBulkAssign: parseInt(process.env.ASSESSMENT_MAX_BULK_ASSIGN || '500', 10),
  workerConcurrency: Math.max(
    1,
    Math.min(20, parseInt(process.env.ASSESSMENT_WORKER_CONCURRENCY || '3', 10) || 3),
  ),
  aiProvider: (process.env.ASSESSMENT_AI_PROVIDER || 'mock') as AssessmentConfig['aiProvider'],
  aiTimeoutMs: Math.max(
    5000,
    Math.min(180000, parseInt(process.env.ASSESSMENT_AI_TIMEOUT_MS || '60000', 10) || 60000),
  ),
  aiPromptVersion: (process.env.ASSESSMENT_AI_PROMPT_VERSION || 'v1').trim() || 'v1',
  aiSchemaVersion: (process.env.ASSESSMENT_AI_SCHEMA_VERSION || 'v1').trim() || 'v1',
}));
