import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, createWriteStream, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ─── Runtime proof: Redis full-consumer outage → bounded failure → self-healing ─────
const BASE = process.argv[2] || '3100';
const API = `http://localhost:${BASE}/api/v1`;
const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url));
const backendRequire = createRequire(join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const envFile = readFileSync(join(BACKEND_DIR, '.env'), 'utf8');
const DATABASE_URL = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1];
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
let seedUserId = null;
const LOG_DIR = mkdtempSync(join(tmpdir(), 'runtime-proof-'));
let backend = null;
let backendPid = null;
console.log(`[runtime-proof ${new Date().toISOString().slice(11, 19)}] Redis outage harness started`);
console.log(`[runtime-proof] backend dir: ${BACKEND_DIR}; api: ${API}`);
console.log(`[runtime-proof] logs: ${LOG_DIR}`);

function docker(...args) {
  try {
    return execSync(`docker ${args.join(' ')}`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : '';
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function http(method, path, body, token) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  } catch (e) {
    return { status: 0, body: { error: String(e) } };
  }
}
async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await predicate();
    if (last) return last;
    await sleep(1200);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}; last=${JSON.stringify(last)}`);
}
function assert(cond, label, detail) {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${label}${detail ? ` -> ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
  console.log(`  PASS  ${label}`);
}
function getLogTail(dir) {
  const out = readFileSync(join(dir, 'backend.out.log'), 'utf8').split('\n');
  const err = readFileSync(join(dir, 'backend.err.log'), 'utf8').split('\n');
  return [...out.slice(-10), '--- stderr ---', ...err.slice(-10)].join('\n');
}

const outStream = createWriteStream(join(LOG_DIR, 'backend.out.log'), { flags: 'a' });
const errStream = createWriteStream(join(LOG_DIR, 'backend.err.log'), { flags: 'a' });

function startBackend() {
  backend = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, APP_PORT: String(BASE), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendPid = backend.pid;
  backend.stdout.pipe(outStream);
  backend.stderr.pipe(errStream);
}

(async () => {
  try {
    // 0. preconditions
    const containers = docker('ps', '--format', '{{.Names}}');
    assert(containers.includes('talentai-redis'), 'talentai-redis container present');
    assert(containers.includes('talentai-postgres'), 'talentai-postgres container present');

    // 0b. self-healing: ensure Redis is STARTED before we begin
    docker('start', 'talentai-redis');
    await waitFor(async () => {
      const ping = docker('exec', 'talentai-redis', 'redis-cli', 'ping');
      return ping.includes('PONG') ? true : null;
    }, 15000, 'redis PONG before start');

    // 1. start our backend instance (not the containerized one)
    console.log('[runtime-proof] starting backend (node dist/src/main.js)...');
    startBackend();
    try {
      await waitFor(async () => (await http('GET', '/health/live')).status === 200, 120000, 'backend liveness');
    } catch (e) {
      console.error('[runtime-proof] backend did not become live; log tail:');
      try {
        console.error(getLogTail(LOG_DIR));
      } catch {}
      throw e;
    }

    // 2. fresh tenant + login
    const stamp = Date.now();
    const user = {
      companyName: `Runtime Proof Corp ${stamp}`,
      email: `runtime-proof-${stamp}@talentai.test`,
      firstName: 'Runtime',
      lastName: 'Proof',
      password: 'E2eStr0ng!Pass',
      passwordConfirmation: 'E2eStr0ng!Pass',
      acceptTerms: true,
    };
    const reg = await http('POST', '/auth/register-company', user);
    assert(reg.status === 201, 'register company 201', reg);
    seedUserId = reg.body.data.userId;

    // Dev runtime has no SMTP sink on :1025, so seed the verification token
    // exactly as the real flow would (sha256 of the raw token) and verify.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await prisma.verificationToken.deleteMany({ where: { userId: seedUserId } });
    await prisma.verificationToken.create({
      data: {
        userId: seedUserId,
        email: user.email.toLowerCase(),
        type: 'EMAIL_VERIFICATION',
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const verify = await http('POST', '/auth/verify-email', { token: rawToken });
    assert(verify.status === 200, 'verify email 200 (token seeded into dev DB)', verify.body?.message ?? verify.status);
    const loginBefore = await http('POST', '/auth/login', { email: user.email, password: user.password });
    assert(loginBefore.status === 200, 'login before outage 200', loginBefore);
    const token = loginBefore.body.data.tokens.accessToken;

    // 3. baseline health: all up
    const healthUp = await waitFor(async () => {
      const r = await http('GET', '/health');
      return r.status === 200 && r.body.checks.queues.status === 'up' ? r : null;
    }, 30000, 'all-queues-up health');
    assert(healthUp.status === 200, 'health 200 + all queues up', {
      status: healthUp.body.status,
      queues: healthUp.body.checks.queues.status,
    });
    const readyUp = await http('GET', '/health/ready');
    assert(readyUp.status === 200 && readyUp.body.status === 'ready', 'readiness ready before outage');

    // 4. OUTAGE: stop redis
    console.log('\n[runtime-proof] --- OUTAGE: stopping talentai-redis ---');
    docker('stop', 'talentai-redis');
    await sleep(4500);
    console.log('[runtime-proof] --- probing during outage ---');

    const healthDown = await http('GET', '/health');
    assert(healthDown.status === 503, 'health 503 during outage', healthDown.status);
    assert(healthDown.body.status === 'error', 'health status=error during outage');
    assert(healthDown.body.checks.redis.status === 'down', 'redis marked down', healthDown.body.checks.redis);
    assert(healthDown.body.checks.queues.status === 'down', 'queues marked down', healthDown.body.checks.queues.status);
    const dbStatus = healthDown.body.checks.database?.status;
    assert(dbStatus === 'up', 'database still up during outage (no supply-side blast radius)', dbStatus);

    const readyDown = await http('GET', '/health/ready');
    assert(readyDown.status === 503 && readyDown.body.status === 'not_ready', 'readiness 503 during outage');

    const loginDown = await http('POST', '/auth/login', { email: user.email, password: user.password });
    assert(loginDown.status === 503, 'login 503 during outage (bounded)', loginDown.status);
    console.log(`[runtime-proof]     login error:`, JSON.stringify(loginDown.body?.error || loginDown.body).slice(0, 200));
    const loginErrBody = loginDown.body?.error ?? {};
    const loginCode = loginErrBody.code || loginErrBody.errorCode || loginDown.body?.errorCode;
    assert(loginCode === 'AUTH_SESSION_STORE_UNAVAILABLE', 'login bound: AUTH_SESSION_STORE_UNAVAILABLE code', loginCode);

    const jobsDown = await http('GET', '/jobs', null, token);
    assert(jobsDown.status === 200, 'GET /jobs still 200 during outage (app alive, bounded)', jobsDown.status);

    const liveDown = await http('GET', '/health/live');
    assert(liveDown.status === 200, 'liveness still 200 during outage');

    console.log(`[runtime-proof]     outage window proven. backend PID: ${backendPid}`);

    // 5. RECOVERY: start redis → self-healing without restart
    console.log('[runtime-proof] --- START redis: expecting self-recovery ---');
    docker('start', 'talentai-redis');
    await waitFor(async () => {
      const r = await http('GET', '/health');
      return r.status === 200 && r.body.checks.queues.status === 'up' ? r : null;
    }, 45000, 'queues up after recovery');
    console.log('[runtime-proof] --- queues reconnected ---');

    const healthBack = await http('GET', '/health');
    assert(healthBack.status === 200 && healthBack.body.status === 'ok', 'health 200 + ok after recovery');

    const readyBack = await http('GET', '/health/ready');
    assert(readyBack.status === 200 && readyBack.body.status === 'ready', 'readiness ready after recovery');

    const loginBack = await http('POST', '/auth/login', { email: user.email, password: user.password });
    assert(loginBack.status === 200, 'login 200 after recovery', loginBack.status);

    console.log(`[runtime-proof]     final backend PID: ${backendPid}`);
    assert(backend && backend.exitCode === null, 'backend process never restarted (same PID, no crash/exit)');

    // 6. bounded screening call points
    console.log('[runtime-proof] --- screening bound check (post-recovery) ---');
    const fakeApp = crypto.randomUUID();
    const screening = await http('POST', `/applications/${fakeApp}/ai-screenings`, {}, null);
    assert(screening.status === 401, 'screening endpoint bounded 401 without auth (auth path healthy)', screening.status);
    const screeningAuth = await http('POST', `/applications/${fakeApp}/ai-screenings`, {}, token);
    assert(screeningAuth.status !== 500 && !(screeningAuth.body && screeningAuth.body.stack), 'screening call bounded (no 500/stack)', screeningAuth.status);

    console.log('────────────────────────────────────────────────');
    console.log('RUNTIME PROOF: PASS — outage bounded, self-recovery without restart');
    console.log(`backend PID: ${backendPid} (unchanged across outage/recovery)`);
  } catch (e) {
    console.error('────────────────────────────────────────────────');
    console.error('RUNTIME PROOF: FAIL');
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    try {
      backend.kill();
    } catch {}
    try {
      docker('start', 'talentai-redis');
    } catch {}
    if (seedUserId) {
      try {
        await prisma.verificationToken.deleteMany({ where: { userId: seedUserId } });
        await prisma.$executeRawUnsafe(
          `DELETE FROM "AuthAuditEvent" WHERE "userId" = ANY(ARRAY['${seedUserId}']::text[]);`,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "CompanyMembership" WHERE "userId" = ANY(ARRAY['${seedUserId}']::text[]);`,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "User" WHERE id = ANY(ARRAY['${seedUserId}']::text[]);`,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Company" WHERE id NOT IN (SELECT "companyId" FROM "CompanyMembership");`,
        );
      } catch {
        console.log('[runtime-proof] seed cleanup best-effort (some rows may persist in dev DB)');
      }
    }
    await prisma.$disconnect();
    await sleep(800);
  }
})();