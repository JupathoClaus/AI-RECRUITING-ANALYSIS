/**
 * JOB ANALYTICS BROWSER PROOF
 *
 * Verifies, in a real browser against the production build, that the Job
 * Workspace analytics section renders truthful backend aggregates (not
 * frontend estimates): it calls GET /api/v1/jobs/:id/analytics and displays
 * the returned counts, stages, and screening metrics. Also smoke-checks the
 * AI-interviews and dashboard routes for unexplained console/page/HTTP errors.
 *
 * RSC route-prefetch requests cancelled with net::ERR_ABORTED during SPA
 * navigation are expected Next.js App Router behavior (navigation cancels
 * stale prefetches); they are logged but do not fail the verdict. Every other
 * console error, page error, request failure, or non-2xx HTTP response fails.
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'job-analytics-shots');
mkdirSync(SHOTS, { recursive: true });

const RUN_ID = Date.now();
const EMAIL = `analytics${RUN_ID}@e2e.com`;
const COMPANY = `Analytics Co ${RUN_ID}`;
const PASSWORD = `Vrf$Gr8!${RUN_ID}`;
const JOB_TITLE = `Analytics Proof Role ${RUN_ID}`;

const results = [];
const browserErrors = [];
const rscAborts = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let ok = true;
    for (const [selector, value] of fields) {
      try {
        await page.fill(selector, value);
      } catch (err) {
        ok = false;
        break;
      }
    }
    if (ok) {
      let allSet = true;
      for (const [selector, value] of fields) {
        const v = await page.inputValue(selector).catch(() => null);
        if (v !== value) {
          allSet = false;
          break;
        }
      }
      if (allSet) return;
    }
    await sleep(1200);
  }
  throw new Error(`fillFormWithRetry failed after 4 attempts: ${fields.map(([s]) => s).join(', ')}`);
}

async function registerAndLogin(page, prisma) {
  await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[placeholder="Acme Corp"]', COMPANY],
    ['input[placeholder="you@company.com"]', EMAIL],
    ['input[placeholder="John"]', 'Ada'],
    ['input[placeholder="Doe"]', 'Analytics'],
    ['input[placeholder="At least 12 characters"]', PASSWORD],
    ['input[placeholder="Re-enter your password"]', PASSWORD],
  ]);
  await page.check('#acceptTerms');
  await page.click('button[type="submit"]');
  try {
    await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
  } catch {
    const txt = (await page.locator('body').innerText()).slice(0, 900).replace(/\n+/g, ' | ');
    throw new Error(`registration failed. Page: ${txt}`);
  }
  note('register', `registered ${EMAIL}`);
  const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
  const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
  if (!user || !membership) throw new Error('user/membership not found after registration');
  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
  });
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.companySettings.upsert({
    where: { companyId: membership.companyId },
    update: { requireJobApproval: false },
    create: { companyId: membership.companyId, requireJobApproval: false },
  });
  await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[type="email"]', EMAIL],
    ['input[type="password"]', PASSWORD],
  ]);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  note('login', 'logged in');
  return { userId: user.id, companyId: membership.companyId, membershipId: membership.id };
}

async function apiLoginToken() {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`api login failed ${res.status}`);
  return body.data.tokens.accessToken;
}

async function createJobViaApi(token, title) {
  const res = await fetch(`${BE_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title,
      employmentType: 'FULL_TIME',
      workplaceType: 'HYBRID',
      experienceLevel: 'MID',
      description: 'A role used by the job analytics browser verification run.',
    }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`api job create failed ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.id;
}

async function seedAnalyticsData(prisma, ids) {
  const jobId = ids.jobIds[ids.jobIds.length - 1];
  const candidate = await prisma.candidate.create({
    data: {
      firstName: 'Ada',
      lastName: 'Analytics',
      email: `ada.analytics${RUN_ID}@e2e.com`,
      normalizedEmail: `ada.analytics${RUN_ID}@e2e.com`,
      source: 'RECRUITER_CREATED',
      status: 'ACTIVE',
    },
  });
  ids.candidateIds.push(candidate.id);

  const companyCandidate = await prisma.companyCandidate.create({
    data: {
      companyId: ids.companyId,
      candidateId: candidate.id,
      source: 'RECRUITER_CREATED',
      status: 'ACTIVE',
    },
  });

  const pipeline = await prisma.jobPipeline.findUnique({ where: { jobId } });
  if (!pipeline) throw new Error('job pipeline not auto-created');
  const appliedStage = await prisma.jobPipelineStage.findFirst({
    where: { pipelineId: pipeline.id },
    orderBy: { sortOrder: 'asc' },
  });
  if (!appliedStage) throw new Error('job pipeline has no stages');

  const application = await prisma.application.create({
    data: {
      companyId: ids.companyId,
      jobId,
      candidateId: candidate.id,
      companyCandidateId: companyCandidate.id,
      applicationNumber: `APP-${RUN_ID}`,
      publicReference: `REF-${RUN_ID}`,
      source: 'RECRUITER_CREATED',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      currentStageId: appliedStage.id,
    },
  });
  ids.applicationIds.push(application.id);

  await prisma.aiScreeningResult.create({
    data: {
      applicationId: application.id,
      jobId,
      candidateId: candidate.id,
      companyId: ids.companyId,
      initiatedByUserId: ids.userId,
      status: 'COMPLETED',
      overallScore: 82,
      recommendation: 'SHORTLIST',
      confidence: 'HIGH',
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  await prisma.interview.create({
    data: {
      companyId: ids.companyId,
      applicationId: application.id,
      jobId,
      type: 'PHONE',
      title: 'Screening call',
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMinutes: 30,
      createdByMembershipId: ids.membershipIds[0],
    },
  });

  note('seed', `seeded 1 candidate, 1 SUBMITTED application (stage "${appliedStage.name}"), COMPLETED screening score 82 (SHORTLIST), scheduled interview`);
  return appliedStage.name;
}

async function main() {
  console.log(`== job-analytics-proof.mjs ==`);
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = {
    userId: null,
    companyId: null,
    membershipIds: [],
    jobIds: [],
    candidateIds: [],
    applicationIds: [],
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      if (r.url().includes('_rsc=') && r.failure()?.errorText === 'net::ERR_ABORTED') {
        rscAborts.push(`${r.method()} ${r.url().replace(/\?_rsc=.*$/, '?…_rsc')}`);
        return;
      }
      browserErrors.push(`requestfailed: ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/favicon\.ico|\/manifest\.json/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`);
      }
    });

    const { userId, companyId, membershipId } = await registerAndLogin(page, prisma);
    ids.userId = userId;
    ids.companyId = companyId;
    ids.membershipIds.push(membershipId);
    const token = await apiLoginToken();

    const jobId = await createJobViaApi(token, JOB_TITLE);
    ids.jobIds.push(jobId);
    const appliedStageName = await seedAnalyticsData(prisma, ids);

    // (a) dedicated /jobs/:id/analytics route calls the real aggregate
    const analyticResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/jobs/${jobId}/analytics`) && r.request().method() === 'GET',
      { timeout: 20000 },
    );
    await page.goto(`${FE_URL}/jobs/${jobId}/analytics`, { waitUntil: 'domcontentloaded' });
    const analyticsRes = await analyticResponse;
    const analyticsJson = await analyticsRes.json();
    const payload = analyticsJson.data ?? analyticsJson;
    note('analytics.http', `GET /api/v1/jobs/${jobId}/analytics -> HTTP ${analyticsRes.status()}`);

    await page.getByText('Average screening score', { exact: true }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(SHOTS, 'analytics-page.png'), fullPage: true });

    const bodyText = await page.locator('body').innerText();
    const s = payload.screening ?? {};
    const a = payload.applications ?? {};
    const iv = payload.interviews ?? {};
    const apiChecks = {
      'api applications.total === 1, active === 1': a.total === 1 && a.active === 1,
      'api screening.completed === 1, averageScore === 82, SHORTLIST === 1':
        s.completed === 1 && s.averageScore === 82 && s.byRecommendation?.SHORTLIST === 1,
      'api interviews.total === 1, upcoming === 1': iv.total === 1 && iv.upcoming === 1,
      'api one stage with a count of 1': Array.isArray(a.byStage) && a.byStage.some((st) => st.count === 1),
      'api timeToHireDays null (no hires recorded)': payload.timeToHireDays === null,
    };
    const uiChecks = {
      'ui renders Applications 1 active': /1 active in pipeline/.test(bodyText),
      'ui renders Screening pending/failed zeros': /0 pending · 0 failed/.test(bodyText),
      'ui renders Average screening score card': /average screening score/i.test(bodyText),
      'ui renders 1 scored results': /\b1 scored results\b/.test(bodyText),
      'ui renders Interviews 1 upcoming': /\b1 upcoming\b/.test(bodyText),
      'ui renders Pipeline distribution + stage count': new RegExp(`Pipeline distribution[\\s\\S]*?${appliedStageName}`).test(bodyText),
      'ui renders Shortlist recommendation card (Shortlist + Human review + count 1)': /shortlist/i.test(bodyText) && /human review/i.test(bodyText) && /\b1\b/.test(bodyText.split('Screening recommendations')[1] ?? ''),
      'ui shows no error card': !bodyText.includes('Job analytics unavailable'),
    };
    for (const [label, ok] of Object.entries({ ...apiChecks, ...uiChecks })) note(`${label}: ${ok ? 'PASS' : 'FAIL'}`, ok ? 'present' : 'MISSING');
    await page.screenshot({ path: join(SHOTS, 'analytics-verified.png'), fullPage: true });

    // (b) workspace: open the job and switch to the Analytics tab
    await page.goto(`${FE_URL}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
    const analyticsTab = page.getByRole('link', { name: 'Analytics' });
    try {
      await analyticsTab.waitFor({ timeout: 20000 });
    } catch {
      const dump = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
      console.log(`    [workspace dump] ${JSON.stringify(dump)}`);
      throw new Error('workspace header/nav did not render on /jobs/:id');
    }
    await analyticsTab.click();
    await page.waitForURL(new RegExp(`/jobs/${jobId}/analytics`), { timeout: 20000 });
    await page.getByText('Average screening score', { exact: true }).waitFor({ timeout: 20000 });
    note('workspace.tab', 'analytics tab opened from the job workspace');
    await page.screenshot({ path: join(SHOTS, 'workspace-analytics.png'), fullPage: true });

    // (c) smoke: AI Interviews + dashboard routes
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.getByText('AI Interviews', { exact: false }).first().waitFor({ timeout: 20000 });
    note('smoke.ai-interviews', 'page rendered');
    await page.screenshot({ path: join(SHOTS, 'ai-interviews.png'), fullPage: true });

    await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ timeout: 20000 });
    note('smoke.dashboard', 'page rendered');
    await page.screenshot({ path: join(SHOTS, 'dashboard.png'), fullPage: true });

    await sleep(500);
    const failedChecks = Object.entries({ ...apiChecks, ...uiChecks }).filter(([, ok]) => !ok).map(([label]) => label);
    note('browser.unexpectedErrors', `unexpected browser errors: ${browserErrors.length}`);
    for (const e of browserErrors) console.log(`    - ${e}`);
    note('browser.rscAborts.expected', `skipped ${rscAborts.length} Next.js RSC prefetch aborts (net::ERR_ABORTED during SPA navigation) — expected`);

    const allPass =
      analyticsRes.status() === 200 &&
      failedChecks.length === 0 &&
      browserErrors.length === 0 &&
      !results.some((r) => (r.detail || '').includes('MISSING'));
    console.log(`\n== SUMMARY ==`);
    console.log(`  analytics HTTP status: ${analyticsRes.status()}`);
    console.log(`  failed UI checks: ${failedChecks.join(', ') || 'none'}`);
    console.log(`  unexpected browser errors: ${browserErrors.length}`);
    console.log(`  RSC prefetch aborts (expected): ${rscAborts.length}`);
    console.log(`  verdict: ${allPass ? 'PASS' : 'FAIL'}`);
    process.exitCode = allPass ? 0 : 1;
  } finally {
    await cleanupExact(prisma, ids, (msg) => note('cleanup', msg));
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});