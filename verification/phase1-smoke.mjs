// Phase 1 smoke (post Phase-2 fixes, restored runtime): spot-checks that the
// recruit-side product surfaces still render without errors after the Phase 2
// pass and that tenant isolation holds between two freshly-registered
// companies. Time-boxed by design; deep evidence lives in product-proof.mjs.
//
//   node verification/phase1-smoke.mjs
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BACKEND = join(ROOT, 'backend');
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';

const RUN = Date.now();
const EMAIL_A = `s1a${RUN}@e2e.com`;
const EMAIL_B = `s1b${RUN}@e2e.com`;
const PASSWORD = 'PortNyx!Q70z';
const JOB_TITLE = `Smoke Engineer ${RUN}`;
const CAND_NAME = `Smoke Candidate ${RUN}`;

const results = [];
const browserErrors = [];
const ok = (label, detail) => { results.push(label); console.log(`  [PASS] ${label} - ${detail}`); };
const fail = (label, detail) => { results.push(label); throw new Error(`CHECK FAILED: ${label} ${detail}`); };

const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
const ids = {};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BE_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

async function setup() {
  console.log('== setup ==');
  const mk = async (email, firstName) => {
    const reg = await api('/auth/register-company', {
      method: 'POST',
      body: { companyName: `Smoke Co ${firstName}`, email, firstName, lastName: 'Smoke', password: PASSWORD, passwordConfirmation: PASSWORD, acceptTerms: true },
    });
    if (reg.status !== 201 || !reg.json?.data?.companyId) fail(`register-${firstName}`, `status=${reg.status} ${reg.text}`);
    await prisma.user.update({ where: { id: reg.json.data.userId }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const login = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    const token = login.json?.data?.accessToken ?? login.json?.data?.tokens?.accessToken ?? login.json?.accessToken;
    if (login.status !== 200 || !token) fail(`login-${firstName}`, `status=${login.status} ${login.text}`);
    ok(`setup-${firstName}`, `registered + activated + JWT`);
    return { companyId: reg.json.data.companyId, membershipId: reg.json.data.membershipId, token };
  };
  ids.a = await mk(EMAIL_A, 'Alpha');
  ids.b = await mk(EMAIL_B, 'Beta');
  if (ids.a.companyId === ids.b.companyId) fail('setup-tenant', 'companies collided');

  const now = new Date().toISOString();
  ids.jobId = randomUUID();
  ids.appId = randomUUID();
  ids.candId = `cand-smoke-a-${RUN}`;
  const stamp = `S1${RUN}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, status, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
     VALUES ('${ids.jobId}', '${ids.a.companyId}', 'JB-${stamp}', 'smoke-${stamp}', '${JOB_TITLE}', 'PUBLISHED', 'FULL_TIME', 'ON_SITE', 'MID', 'x', '${ids.a.membershipId}', '${ids.a.membershipId}', '${now}', '${now}')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
     VALUES ('${ids.candId}', 'Smoke', 'Candidate', 'cand-smoke-${RUN}@e2e.com', 'RECRUITER_CREATED', '${now}', '${now}')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
     VALUES ('cc-smoke-${RUN}', '${ids.a.companyId}', '${ids.candId}', 'RECRUITER_CREATED', '${now}')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "publicReference", "applicationNumber", source, status, "consentConfirmed", "createdAt", "updatedAt")
     VALUES ('${ids.appId}', '${ids.a.companyId}', '${ids.jobId}', '${ids.candId}', 'cc-smoke-${RUN}', 'REF-${stamp}', 'REF-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${now}', '${now}')`,
  );
  ok('setup-fixtures', 'company A job PUBLISHED + 1 candidate + 1 application');
}

async function tenantIsolation() {
  console.log('== tenant isolation ==');
  const hit = await api(`/jobs/${ids.jobId}`, { token: ids.b.token });
  if (hit.status !== 404 && hit.status !== 403) fail('tenant-404', `company B saw company A job: status=${hit.status} ${hit.text}`);
  ok('tenant-404', `company B token → ${hit.status} on company A job (resource hidden)`);
  const cands = await api('/candidates', { token: ids.b.token });
  const list = cands.json?.data?.data ?? cands.json?.data ?? [];
  const leak = (list ?? []).some((c) => c.id === ids.candId || `${c.firstName ?? ''} ${c.lastName ?? ''}`.includes('CAND'));
  if (leak) fail('tenant-no-leak', 'company B saw company A candidates');
  ok('tenant-no-leak', 'company B candidate list has no company A data');
}

async function pages() {
  console.log('== recruiter pages ==');
  const browser = await chromium.launch({ headless: true, args: ['--single-process', '--no-zygote', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const record = (kind, detail) => { browserErrors.push({ kind, detail }); console.error(`  [browser.${kind}] ${detail}`); };
  page.on('console', (m) => { if (m.type() === 'error') record('console', m.text()); });
  page.on('pageerror', (e) => record('pageerror', e.message));
  page.on('requestfailed', (r) => record('requestfailed', r.failure()?.errorText ?? r.url()));
  page.on('response', (r) => {
    if (r.status() >= 500) record('http5xx', `${r.status()} ${r.url()}`);
  });

  await page.goto(`${FE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@company.com').fill(EMAIL_A);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  ok('login-ui', `redirected to ${new URL(page.url()).pathname}`);

  await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'networkidle' });
  if (!/dashboard/.test(page.url())) fail('dashboard-route', page.url());
  ok('dashboard-route', 'dashboard renders');

  await page.goto(`${FE_URL}/jobs`, { waitUntil: 'networkidle' });
  const jobsText = await page.locator('body').innerText();
  if (!jobsText.includes(JOB_TITLE)) fail('jobs-active', `job not in Active view`);
  ok('jobs-active', `"${JOB_TITLE}" visible on job list`);

  await page.goto(`${FE_URL}/applications`, { waitUntil: 'networkidle' });
  const appsText = await page.locator('body').innerText();
  if (!appsText.includes('Smoke Candidate')) fail('applications-list', `candidate not listed`);
  ok('applications-list', 'candidate row rendered (smoke)');

  await page.goto(`${FE_URL}/candidates`, { waitUntil: 'networkidle' });
  const cText = await page.locator('body').innerText();
  if (!cText.includes('Smoke Candidate')) fail('candidates', `candidate not listed`);
  ok('candidates', 'candidate directory rendered');

  await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'networkidle' });
  const iText = await page.locator('body').innerText();
  if (!/ai interviews|interview/i.test(iText)) fail('ai-interviews', 'page empty/unhelpful');
  ok('ai-interviews', 'AI Interviews page renders (honest state)');

  const failures = browserErrors.filter(
    (e) => e.kind !== 'requestfailed' || !/(net::ERR_ABORTED|Failed to load resource)/.test(e.detail),
  );
  if (failures.length) fail('browser-error-budget', `${failures.length} unexpected: ${failures.map((f) => `${f.kind} ${f.detail}`).slice(0, 5).join(' | ')}`);
  ok('browser-error-budget', 'zero console/pageerror/request-failed(non-ERR_ABORTED)/HTTP>=500 errors');
  await browser.close();
}

async function main() {
  console.log('== phase1-smoke.mjs ==');
  console.log(`run id: ${RUN}`);
  assertLocalVerificationDb(resolveDatabaseUrl());
  const feOk = await (await fetch(`${FE_URL}/login`, { headers: { pragma: 'no-cache' } })).ok;
  const beOk = await (await fetch(`${BE_URL}/api/v1/health`, { headers: { pragma: 'no-cache' } })).ok;
  if (!feOk || !beOk) throw new Error(`frontend (${FE_URL}?${feOk}) / backend (${BE_URL}?${beOk}) unreachable`);
  ok('preflight', 'frontend + backend reachable');

  try {
    await setup();
    await tenantIsolation();
    await pages();
    console.log(`== done: ${results.length}/${results.length} checks passed ==`);
  } finally {
    console.log('== cleanup ==');
    try {
      await cleanupExact(prisma, { companyId: ids.a?.companyId, candidateIds: [ids.candId].filter(Boolean), jobIds: [ids.jobId].filter(Boolean), applicationIds: [ids.appId].filter(Boolean) });
      await cleanupExact(prisma, { companyId: ids.b?.companyId });
      ok('cleanup', 'exact-row cleanup done');
    } catch (e) {
      console.error(`  cleanup warning: ${e.message}`);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});