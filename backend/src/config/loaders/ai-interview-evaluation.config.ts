import { registerAs } from '@nestjs/config';

export interface AiInterviewEvaluationConfig {
  provider: 'mock' | 'qwen';
  timeoutMs: number;
  promptVersion: string;
  schemaVersion: string;
  workerConcurrency: number;
}

export default registerAs('aiInterviewEvaluation', (): AiInterviewEvaluationConfig => {
  const provider = (process.env.AI_INTERVIEW_EVALUATION_PROVIDER ||
    'mock') as AiInterviewEvaluationConfig['provider'];

  const timeoutRaw = parseInt(process.env.AI_INTERVIEW_EVALUATION_TIMEOUT_MS || '60000', 10);
  const timeoutMs = Math.max(5000, Math.min(180000, isNaN(timeoutRaw) ? 60000 : timeoutRaw));

  const concurrencyRaw = parseInt(
    process.env.AI_INTERVIEW_EVALUATION_WORKER_CONCURRENCY || '3',
    10,
  );
  const workerConcurrency = isNaN(concurrencyRaw) ? 3 : Math.max(1, Math.min(20, concurrencyRaw));

  return {
    provider,
    timeoutMs,
    promptVersion: (process.env.AI_INTERVIEW_EVALUATION_PROMPT_VERSION || 'v1').trim() || 'v1',
    schemaVersion: (process.env.AI_INTERVIEW_EVALUATION_SCHEMA_VERSION || 'v1').trim() || 'v1',
    workerConcurrency,
  };
});
