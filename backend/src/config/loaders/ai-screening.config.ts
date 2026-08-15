import { registerAs } from '@nestjs/config';

export interface AiScreeningConfig {
  provider: 'mock' | 'openai' | 'deepseek';
  openAiApiKey: string;
  openAiModel: string;
  deepSeekApiKey: string;
  deepSeekModel: string;
  deepSeekBaseUrl: string;
  timeoutMs: number;
  maxResumeChars: number;
  promptVersion: string;
  schemaVersion: string;
  workerConcurrency: number;
  mockScenario: string;
}

export default registerAs('aiScreening', (): AiScreeningConfig => {
  const provider = (process.env.AI_SCREENING_PROVIDER || 'mock') as AiScreeningConfig['provider'];

  const timeoutRaw = parseInt(process.env.AI_SCREENING_TIMEOUT_MS || '60000', 10);
  const timeoutMs = Math.max(5000, Math.min(180000, isNaN(timeoutRaw) ? 60000 : timeoutRaw));

  const maxResumeCharsRaw = parseInt(process.env.AI_SCREENING_MAX_RESUME_CHARS || '15000', 10);
  const maxResumeChars = Math.max(
    1000,
    Math.min(100000, isNaN(maxResumeCharsRaw) ? 15000 : maxResumeCharsRaw),
  );

  const promptVersion = process.env.AI_SCREENING_PROMPT_VERSION || 'v1';
  const schemaVersion = process.env.AI_SCREENING_SCHEMA_VERSION || 'v1';

  const concurrencyRaw = parseInt(process.env.AI_SCREENING_WORKER_CONCURRENCY || '3', 10);
  const workerConcurrency = isNaN(concurrencyRaw) ? 3 : Math.max(1, Math.min(20, concurrencyRaw));

  return {
    provider,
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepSeekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeoutMs,
    maxResumeChars,
    promptVersion: promptVersion.trim() || 'v1',
    schemaVersion: schemaVersion.trim() || 'v1',
    workerConcurrency,
    mockScenario: process.env.AI_SCREENING_MOCK_SCENARIO || '',
  };
});
