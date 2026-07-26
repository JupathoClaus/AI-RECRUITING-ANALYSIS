import { registerAs } from '@nestjs/config';

export interface AiScreeningConfig {
  provider: 'mock' | 'openai';
  openAiApiKey: string;
  openAiModel: string;
  timeoutMs: number;
  maxResumeChars: number;
  promptVersion: string;
  schemaVersion: string;
  workerConcurrency: number;
  mockScenario: string;
}

export default registerAs('aiScreening', (): AiScreeningConfig => {
  const provider = (process.env.AI_SCREENING_PROVIDER || 'mock') as AiScreeningConfig['provider'];

  const timeoutRaw = parseInt(process.env.AI_SCREENING_TIMEOUT_MS || '30000', 10);
  const timeoutMs = Math.max(5000, Math.min(120000, isNaN(timeoutRaw) ? 30000 : timeoutRaw));

  const maxResumeCharsRaw = parseInt(process.env.AI_SCREENING_MAX_RESUME_CHARS || '15000', 10);
  const maxResumeChars = Math.max(1000, Math.min(100000, isNaN(maxResumeCharsRaw) ? 15000 : maxResumeCharsRaw));

  const promptVersion = process.env.AI_SCREENING_PROMPT_VERSION || 'v1';
  const schemaVersion = process.env.AI_SCREENING_SCHEMA_VERSION || 'v1';

  const concurrencyRaw = parseInt(process.env.AI_SCREENING_WORKER_CONCURRENCY || '3', 10);
  const workerConcurrency = isNaN(concurrencyRaw) ? 3 : Math.max(1, Math.min(20, concurrencyRaw));

  return {
    provider,
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs,
    maxResumeChars,
    promptVersion: promptVersion.trim() || 'v1',
    schemaVersion: schemaVersion.trim() || 'v1',
    workerConcurrency,
    mockScenario: process.env.AI_SCREENING_MOCK_SCENARIO || '',
  };
});
