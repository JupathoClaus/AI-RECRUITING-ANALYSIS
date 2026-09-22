/* eslint-disable no-console */
/**
 * REAL failure-mode verification for the Qwen provider (never mocked).
 *
 * Boots the app with provider=qwen pointing at intentionally-broken targets and
 * drives the ACTUAL DI provider instance through provider.screen(). All probes
 * are free (connection-refused / 401 — no inference tokens consumed), except a
 * zero-cost /v1/models identity check against the HF router.
 *
 * Execute:  npx ts-node -r tsconfig-paths/register test/qwen-hf-failure-modes.verify.ts
 *
 * Exit 0 = all probes behaved as coded. NOT matched by jest (naming).
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AI_SCREENING_PROVIDER } from '../src/modules/ai-screening/providers/ai-screening-provider.token';
import { AiScreeningProvider } from '../src/modules/ai-screening/providers/ai-screening-provider.interface';
import { AiScreeningProviderError } from '../src/modules/ai-screening/providers/ai-screening-provider.errors';
import { ScreeningInput } from '../src/modules/ai-screening/domain/screening-input.type';

const HF_TOKEN_FILE = join(process.env.USERPROFILE ?? '', '.cache', 'huggingface', 'token');
const HF_MODEL = 'Qwen/Qwen3.5-9B';
const HF_ROUTER = 'https://router.huggingface.co/v1';

function readHfToken(): string {
  if (!existsSync(HF_TOKEN_FILE)) {
    throw new Error(`HF token not found at ${HF_TOKEN_FILE}`);
  }
  const tok = readFileSync(HF_TOKEN_FILE, 'utf8').trim();
  if (!tok || tok.length < 16) throw new Error('HF token missing or too short');
  return tok;
}

const BASE_INPUT: ScreeningInput = {
  applicationId: 'app-fm',
  candidateId: 'cand-fm',
  jobId: 'job-fm',
  companyId: 'co-fm',
  jobTitle: 'Systems Administrator',
  jobDescription: 'Administer servers, network and monitoring.',
  jobResponsibilities: 'Windows/Linux admin, networking, troubleshooting.',
  jobQualifications: 'Windows and Linux administration; networking.',
  experienceLevel: 'Mid-level (3–5 years)',
  requiredSkills: ['Windows Server Administration', 'Linux Administration'],
  preferredSkills: ['Security Hardening'],
  requiredExperience: 'Minimum 4 years in IT infrastructure',
  preferredExperience: '',
  requiredEducation: "Associate's degree or equivalent",
  preferredEducation: '',
  requiredCertifications: [],
  preferredCertifications: [],
  resumeText:
    'Alex: system administrator with 5 years of Windows Server and Linux administration, networking and monitoring.',
  screeningQuestions: [],
  promptVersion: 'v1',
  criteria: [
    {
      id: 'skill-1',
      name: 'Windows Server Administration',
      description: 'Required skill: Windows Server Administration.',
      requirementType: 'REQUIRED',
      category: 'SKILL',
      weight: 1,
      acceptedEvidence: ['Windows Server'],
    },
  ],
};

let run = 0;

async function boot(
  envs: Record<string, string>,
): Promise<{ app: INestApplication; provider: AiScreeningProvider }> {
  for (const [k, v] of Object.entries(envs)) process.env[k] = v;
  process.env.REDIS_KEY_PREFIX = `talentai_test:qhffm:${Date.now()}:${run++}:`;
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api/v1');
  await app.init();
  const provider = app.get(AI_SCREENING_PROVIDER) as AiScreeningProvider;
  return { app, provider };
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectProviderError(
  provider: AiScreeningProvider,
  expectedSafeCode: string,
  retryable: boolean,
  label: string,
): Promise<Record<string, unknown>> {
  let outcome: 'NO_ERROR' | 'WRONG_CODE' | 'OK' = 'NO_ERROR';
  let actual = '';
  let actualRetryable: boolean | undefined;
  const start = Date.now();
  try {
    const result = await provider.screen(BASE_INPUT);
    actual = `unexpected success (${JSON.stringify(result).slice(0, 120)})`;
  } catch (err) {
    if (err instanceof AiScreeningProviderError) {
      actual = err.safeCode;
      actualRetryable = err.retryable;
      outcome = err.safeCode === expectedSafeCode ? 'OK' : 'WRONG_CODE';
    } else {
      actual = `non-ProviderError: ${(err as Error).message ?? err}`;
    }
  }
  const elapsedMs = Date.now() - start;
  assert(outcome === 'OK', `${label}: expected safeCode ${expectedSafeCode}, got "${actual}"`);
  assert(
    actualRetryable === retryable,
    `${label}: expected retryable=${retryable}, got ${actualRetryable}`,
  );
  return { label, expectedSafeCode, outcome: 'OK', retryable: actualRetryable, elapsedMs };
}

async function main() {
  const hfToken = readHfToken();
  dotenv.config({ path: join(__dirname, 'env', 'test.env') });
  process.env.NODE_ENV = 'test';

  const results: Record<string, unknown>[] = [];

  // 1. Unreachable host → PROVIDER_UNAVAILABLE (retryable) — real provider, dead URL
  {
    const { app, provider } = await boot({
      AI_SCREENING_PROVIDER: 'qwen',
      QWEN_BASE_URL: 'http://127.0.0.1:9/v1',
      QWEN_MODEL: HF_MODEL,
      QWEN_API_KEY: 'any',
      AI_SCREENING_TIMEOUT_MS: '5000',
      AI_SCREENING_MAX_RESUME_CHARS: '15000',
    });
    try {
      results.push(
        await expectProviderError(provider, 'PROVIDER_UNAVAILABLE', true, 'unreachable-host'),
      );
    } finally {
      await app.close();
    }
  }

  // 2. Router + invalid key → PROVIDER_AUTH_ERROR (terminal) — real 401 from HF, free
  {
    const { app, provider } = await boot({
      AI_SCREENING_PROVIDER: 'qwen',
      QWEN_BASE_URL: HF_ROUTER,
      QWEN_MODEL: HF_MODEL,
      QWEN_API_KEY: 'hf_invalid_NOT_A_REAL_KEY',
      AI_SCREENING_TIMEOUT_MS: '20000',
      AI_SCREENING_MAX_RESUME_CHARS: '15000',
    });
    try {
      results.push(
        await expectProviderError(provider, 'PROVIDER_AUTH_ERROR', false, 'bad-key-401'),
      );
    } finally {
      await app.close();
    }
  }

  // 3. Free identity probe: /v1/models on the HF router with the valid token
  {
    const r = await fetch(`${HF_ROUTER}/models`, {
      headers: { Authorization: `Bearer ${hfToken}` },
      signal: AbortSignal.timeout(30000),
    });
    assert(r.status === 200, `/v1/models expected 200, got ${r.status}`);
    const body = (await r.json()) as { data?: Array<{ id: string }> };
    const ids = (body.data ?? []).map((m) => m.id);
    assert(ids.includes(HF_MODEL), `/v1/models must list ${HF_MODEL}; got ${ids.join(',')}`);
    results.push({ label: 'router-models', status: 200, models: ids });
  }

  console.log('QWEEN_HF_FM_VERIFY_PASS ' + JSON.stringify(results, null, 2));
}

main().then(
  () => setTimeout(() => process.exit(0), 200),
  (err) => {
    console.error('QWEEN_HF_FM_VERIFY_FAIL ' + ((err as Error).message ?? err));
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 200);
  },
);
