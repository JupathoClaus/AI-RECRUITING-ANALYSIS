/**
 * CANDIDATES E2E PROOF (Issue #2)
 *
 * Stage 1: baseline happy-path candidate creation + real screening attempt
 *          (provider endpoint may be down â†’ records the actual failureCode).
 * Stage 2: abort reproduction â€” artificially delay POST /api/v1/candidates
 *          beyond the 15s client timeout and observe the surfaced error,
 *          the DB state after the abort, and retry recovery via idempotency.
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

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'candidates-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));

const STAGE = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : '1';
const RUN_ID = Date.now();
const EMAIL = `cand${RUN_ID}@e2e.com`;
const COMPANY = `Cand Co ${RUN_ID}`;
const PASSWORD = `CandPass!${RUN_ID}`;
const JOB_TITLE = `Candidate Test Role ${RUN_ID}`;
const CAND_A = `Ava Test ${RUN_ID}`;
const CAND_A_EMAIL = `ava${RUN_ID}@e2e.com`;

const notes = [];
const browserErrors = [];
const note = (label, detail) => {
  notes.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let ok = true;
    for (const [selector, value] of fields) {
      try { await page.fill(selector, value); } catch { ok = false; break; }
    }
    if (ok) {
      let allSet = true;
      for (const [selector, value] of fields) {
        const v = await page.inputValue(selector).catch(() => null);
        if (v !== value) { allSet = false; break; }
      }
      if (allSet) return;
    }
    await sleep(1200);
  }
  throw new Error('fillFormWithRetry failed');
}

async function main() {
  console.log(`== candidates-e2e-proof.mjs (stage=${STAGE}) ==`);
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/favicon\.ico|\/manifest\.json/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`);
      }
    });

    // â”€â”€ auth setup (UI) â”€â”€
    await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[placeholder="Acme Corp"]', COMPANY],
      ['input[placeholder="you@company.com"]', EMAIL],
      ['input[placeholder="John"]', 'Cam'],
      ['input[placeholder="Doe"]', 'Dido'],
      ['input[placeholder="At least 12 characters"]', PASSWORD],
      ['input[placeholder="Re-enter your password"]', PASSWORD],
    ]);
    await page.check('#acceptTerms');
    await page.click('button[type="submit"]');
    await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
    const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
    const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
    ids.userId = user.id;
    ids.companyId = membership.companyId;
    ids.membershipIds.push(membership.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
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
    note('auth', 'registered + logged in');

    // â”€â”€ job via API (published so it is selectable in the dialog) â”€â”€
    const login = await fetch(`${BE_URL}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const token = (await login.json()).data.tokens.accessToken;
    const jobRes = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: JOB_TITLE, employmentType: 'FULL_TIME', workplaceType: 'HYBRID',
        experienceLevel: 'MID',
        description: 'Runs the platform services and tooling. Candidate e2e verification role.',
      }),
    });
    const job = (await jobRes.json()).data;
    ids.jobIds.push(job.id);
    const pubRes = await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    note('job.publish', `publish status=${pubRes.status}`);
    if (pubRes.status !== 200 && pubRes.status !== 201) {
      note('job.publish', (await pubRes.text()).slice(0, 200));
    }

    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });

    if (STAGE === '1') {
      // â”€â”€ baseline creation â”€â”€
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', CAND_A);
      await page.fill('input[placeholder="john@example.com"]', CAND_A_EMAIL);
      await page.fill('input[placeholder="+1 555-0100"]', `+1 555 ${String(RUN_ID).slice(-4)}`);
      await dialog.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(JOB_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
      await dialog.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      await dialog.getByRole('button', { name: 'Add Candidate', exact: true }).click();
      let reachedReady = false;
      try {
        await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
        reachedReady = true;
      } catch {
        const txt = (await dialog.innerText().catch(() => '')).slice(0, 700);
        note('create.uploadFail', `flow did not reach ready state. dialog: ${txt.replace(/\n+/g, ' | ')}`);
        note('create.uploadFailErrors', JSON.stringify(browserErrors.slice(0, 12)));
        throw new Error('ready-for-screening wait failed');
      }
      note('create.baseline', `candidate + application + resume upload + extraction completed (ready=${reachedReady})`);

      const candRow = await prisma.candidate.findFirst({ where: { normalizedEmail: CAND_A_EMAIL.toLowerCase() } });
      ids.candidateIds.push(candRow.id);
      const app = await prisma.application.findFirst({ where: { candidateId: candRow.id } });
      ids.applicationIds.push(app.id);
      const sf = await prisma.storedFile.findFirst({ where: { applicationId: app.id, category: 'RESUME' } });
      ids.storedFileIds.push(sf.id);
      const candCount = await prisma.candidate.count({ where: { normalizedEmail: CAND_A_EMAIL.toLowerCase() } });
      const appCount = await prisma.application.count({ where: { candidateId: candRow.id } });
      const sfCount = await prisma.storedFile.count({ where: { applicationId: app.id } });
      note('create.db', `DB: candidates=${candCount} applications=${appCount} storedFiles=${sfCount} (jobId match=${app.jobId === job.id}, companyId match=${app.companyId === ids.companyId})`);

      // â”€â”€ start AI screening from the dialog â”€â”€
      await dialog.getByRole('button', { name: 'Start AI Screening', exact: true }).click();
      note('screening.started', 'Start AI Screening clicked');
      await page.waitForTimeout(3000);

      // wait up to ~3 min for extraction + screening to reach a terminal state
      let result = null;
      for (let t = 0; t < 100; t++) {
        await sleep(2000);
        result = await prisma.aiScreeningResult.findFirst({ where: { applicationId: app.id }, orderBy: { createdAt: 'desc' } });
        if (result && ['COMPLETED', 'FAILED'].includes(result.status)) break;
      }
      if (result) {
        note('screening.terminal', `screening status=${result.status} failureCode=${result.failureCode} failureMessageSafe=${result.failureMessageSafe}`);
        if (result.status === 'COMPLETED') {
          note('screening.score', `overallScore=${result.overallScore} recommendation=${result.recommendation} confidence=${result.confidence}`);
        }
      } else {
        note('screening.terminal', 'NO TERMINAL STATE within timeout');
      }
      const dialogText = (await dialog.innerText().catch(() => '')).slice(0, 500);
      note('screening.dialog', `dialog text: ${dialogText.replace(/\n+/g, ' | ')}`);
      await page.screenshot({ path: join(SHOTS, 'stage1-screening-result.png'), fullPage: true });

      const extractions = await prisma.resumeTextExtraction.findMany({ where: { storedFileId: sf.id } });
      note('extraction', `extraction rows=${extractions.length} status=${extractions.map((e) => e.status).join(',')} hasText=${(extractions[0]?.extractedText ?? '').length > 10}`);
      if (extractions[0]) ids.extractionIds.push(extractions[0].id);
    } else {
      // â”€â”€ STAGE 2: abort reproduction â”€â”€
      let candidateResponseDelay = null;
      await context.route('**/api/v1/candidates', async (route) => {
        const req = route.request();
        if (req.method() === 'POST') {
          candidateResponseDelay = route;
          // do NOT fulfill yet â€” hold the request open past the 15s client timeout
          return;
        }
        await route.continue();
      });

      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', CAND_A);
      await page.fill('input[placeholder="john@example.com"]', CAND_A_EMAIL);
      await page.fill('input[placeholder="+1 555-0100"]', `+1 555 ${String(RUN_ID).slice(-4)}`);
      await dialog.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(JOB_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
      await dialog.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      await dialog.getByRole('button', { name: 'Add Candidate', exact: true }).click();

      // wait past the 15s client timeout while the server request hangs
      await sleep(20000);
      const dialogText = (await dialog.innerText().catch(() => '')).slice(0, 600);
      note('abort.surface', `dialog after timeout: ${dialogText.replace(/\n+/g, ' | ')}`);

      // release the held request; the server proceeds and creates the candidate
      if (candidateResponseDelay) await candidateResponseDelay.continue();
      await sleep(3000);
      const candRow = await prisma.candidate.findFirst({ where: { normalizedEmail: CAND_A_EMAIL.toLowerCase() } });
      const candCount = await prisma.candidate.count({ where: { normalizedEmail: CAND_A_EMAIL.toLowerCase() } });
      note('abort.db', `candidate rows in DB after abort: ${candCount} (id=${candRow?.id})`);
      if (candRow) ids.candidateIds.push(candRow.id);

      // retry path in the dialog
      const retryBtn = dialog.getByRole('button', { name: /Retry from Candidate Creation|Retry Application Creation|Retry Resume Upload/ });
      if ((await retryBtn.count()) > 0) {
        await retryBtn.first().click();
        await page.waitForTimeout(5000);
        const afterText = (await dialog.innerText().catch(() => '')).slice(0, 400);
        note('abort.retry', `after retry: ${afterText.replace(/\n+/g, ' | ')}`);
      } else {
        note('abort.retry', 'no retry button visible (dialog state: ' + (await page.getByRole('dialog').count()) + ')');
      }
      const candCount2 = await prisma.candidate.count({ where: { normalizedEmail: CAND_A_EMAIL.toLowerCase() } });
      note('abort.finalCount', `final candidate count: ${candCount2}`);
      const apps = await prisma.application.findMany({ where: { candidateId: candRow?.id } });
      note('abort.apps', `applications for candidate: ${apps.length}`);
      for (const a of apps) ids.applicationIds.push(a.id);
      await page.screenshot({ path: join(SHOTS, 'stage2-abort.png'), fullPage: true });
    }

    const fatal = browserErrors.filter((e) => !/net::ERR_ABORTED/.test(e));
    note('browser.errors', `total=${browserErrors.length} fatal=${fatal.length}`);
    for (const e of fatal.slice(0, 10)) console.log('    - ' + e);
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