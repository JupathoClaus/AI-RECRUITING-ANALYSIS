/**
 * CANDIDATES WALKTHROUGH + TWO-CANDIDATE ISOLATION (Issue #2)
 *
 * Covers: candidates page load/search, Add Candidate (two candidates, distinct
 * jobs/resumes), double-click prevention, candidate details + resume, screening
 * section state, bulk selection + bulk screening mapping, refresh persistence.
 *
 * NOTE: Qwen endpoint is currently DOWN (environment) — screening jobs reach a
 * terminal FAILED state with a safe message; success-path scoring is blocked by
 * the environment, not by the application.
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

const RUN_ID = Date.now();
const EMAIL = `walk${RUN_ID}@e2e.com`;
const COMPANY = `Walk Co ${RUN_ID}`;
const PASSWORD = `WalkPass!${RUN_ID}`;

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
  console.log('== candidates-walkthrough.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/favicon\.ico|\/manifest\.json/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.url()}`);
      }
    });

    // ── auth + jobs ──
    await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[placeholder="Acme Corp"]', COMPANY],
      ['input[placeholder="you@company.com"]', EMAIL],
      ['input[placeholder="John"]', 'Zed'],
      ['input[placeholder="Doe"]', 'Yon'],
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

    const login = await fetch(`${BE_URL}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const token = (await login.json()).data.tokens.accessToken;

    const mkJob = async (title, description) => {
      const r = await fetch(`${BE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description }),
      });
      const j = (await r.json()).data;
      ids.jobIds.push(j.id);
      await fetch(`${BE_URL}/api/v1/jobs/${j.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      return j;
    };
    const jobA = await mkJob(`Backend Engineer ${RUN_ID}`, 'Builds the platform backend services.');
    const jobB = await mkJob(`Data Analyst ${RUN_ID}`, 'Analyses metrics and builds dashboards.');
    note('jobs', `created + published jobA=${jobA.title} jobB=${jobB.title}`);

    const addCandidateViaUI = async ({ name, email, jobTitle, dbl }) => {
      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      const parts = name.split(' ');
      await page.fill('input[placeholder="e.g. John Smith"]', name);
      await page.fill('input[placeholder="john@example.com"]', email);
      await d.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
      await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      const addBtn = d.getByRole('button', { name: 'Add Candidate', exact: true });
      if (dbl) {
        await addBtn.click({ clickCount: 2, delay: 80 });
      } else {
        await addBtn.click();
      }
      try {
        await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
      } catch {
        const txt = (await d.innerText().catch(() => '')).slice(0, 500);
        note('create.fail', `${name}: ${txt.replace(/\n+/g, ' | ')}`);
        throw new Error(`create failed for ${name}`);
      }
      note('create.ok', `${name} created + ready for screening`);
      await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
      await sleep(800);
    };

    // ── two candidates (candidate B via double-click) ──
    const candAEmail = `walkA${RUN_ID}@e2e.com`;
    const candBEmail = `walkB${RUN_ID}@e2e.com`;
    await addCandidateViaUI({ name: `Ada ${RUN_ID}`, email: candAEmail, jobTitle: jobA.title, dbl: false });
    await addCandidateViaUI({ name: `Ben ${RUN_ID}`, email: candBEmail, jobTitle: jobB.title, dbl: true });

    const candA = await prisma.candidate.findFirst({ where: { normalizedEmail: candAEmail.toLowerCase() } });
    const candB = await prisma.candidate.findFirst({ where: { normalizedEmail: candBEmail.toLowerCase() } });
    ids.candidateIds.push(candA.id, candB.id);
    const aCount = await prisma.candidate.count({ where: { normalizedEmail: candAEmail.toLowerCase() } });
    const bCount = await prisma.candidate.count({ where: { normalizedEmail: candBEmail.toLowerCase() } });
    note('duplicate.check', `candidate A rows=${aCount} candidate B rows=${bCount} (double-click must be 1)`);

    const appA = await prisma.application.findFirst({ where: { candidateId: candA.id }, orderBy: { createdAt: 'desc' } });
    const appB = await prisma.application.findFirst({ where: { candidateId: candB.id }, orderBy: { createdAt: 'desc' } });
    ids.applicationIds.push(appA.id, appB.id);
    const sfA = await prisma.storedFile.findFirst({ where: { applicationId: appA.id, category: 'RESUME' } });
    const sfB = await prisma.storedFile.findFirst({ where: { applicationId: appB.id, category: 'RESUME' } });
    ids.storedFileIds.push(sfA.id, sfB.id);
    const exA = await prisma.resumeTextExtraction.findFirst({ where: { storedFileId: sfA.id } });
    const exB = await prisma.resumeTextExtraction.findFirst({ where: { storedFileId: sfB.id } });
    if (exA) ids.extractionIds.push(exA.id);
    if (exB) ids.extractionIds.push(exB.id);
    const isolationOk =
      appA.jobId === jobA.id && appB.jobId === jobB.id &&
      appA.companyId === ids.companyId && appB.companyId === ids.companyId;
    note('isolation', `A->jobA=${appA.jobId === jobA.id} B->jobB=${appB.jobId === jobB.id} -> ${isolationOk ? 'ISOLATED' : 'MISMATCH'}`);

    // ── candidates page UI: search + details ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByText(`Ada ${RUN_ID}`, { exact: false }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(SHOTS, 'walk-candidates-list.png'), fullPage: true });
    const searchBox = page.locator('input[placeholder*="Search"]').first();
    if ((await searchBox.count()) > 0) {
      await searchBox.fill(`Ben ${RUN_ID}`);
      await sleep(1200);
      const benVisible = await page.getByText(`Ben ${RUN_ID}`, { exact: false }).first().isVisible();
      const adaHidden = (await page.getByText(`Ada ${RUN_ID}`, { exact: false }).count()) === 0;
      note('search', `search "Ben" -> benVisible=${benVisible} adaFiltered=${adaHidden}`);
      await searchBox.fill('');
      await sleep(1200);
    }

    // open candidate A details
    await page.getByText(`Ada ${RUN_ID}`, { exact: false }).first().click();
    const detailDialog = page.getByRole('dialog');
    await detailDialog.getByText('AI Screening', { exact: true }).waitFor({ timeout: 10000 });
    const resumeShown = (await detailDialog.innerText()).includes('minimal-resume.pdf');
    const startBtn = await detailDialog.getByRole('button', { name: 'Start AI Screening', exact: true }).count();
    note('details', `candidate details: resume shown=${resumeShown} start-screening-btn=${startBtn === 1}`);
    await page.screenshot({ path: join(SHOTS, 'walk-candidate-details.png'), fullPage: true });

    // start screening from the detail dialog (endpoint down -> FAILED with safe message)
    if (startBtn > 0) {
      await detailDialog.getByRole('button', { name: 'Start AI Screening', exact: true }).first().click();
      await sleep(2000);
      let scr = null;
      for (let t = 0; t < 100; t++) {
        await sleep(2000);
        scr = await prisma.aiScreeningResult.findFirst({ where: { applicationId: appA.id }, orderBy: { createdAt: 'desc' } });
        if (scr && ['COMPLETED', 'FAILED'].includes(scr.status)) break;
      }
      const exCheck = await prisma.resumeTextExtraction.findFirst({ where: { storedFileId: sfA.id } });
      note('extraction.afterStart', `extraction status=${exCheck?.status} hasText=${(exCheck?.extractedText ?? '').length > 10}`);
      if (exCheck) ids.extractionIds.push(exCheck.id);
      note('detail.screening', `status=${scr?.status} failureCode=${scr?.failureCode} msg=${scr?.failureMessageSafe}`);
      const dText = (await detailDialog.innerText()).slice(0, 400);
      note('detail.screening.ui', dText.replace(/\n+/g, ' | '));
      const retryVisible = (await detailDialog.getByRole('button', { name: 'Retry', exact: true }).count()) > 0;
      note('detail.retryBtn', `retry button visible: ${retryVisible}`);
      await page.screenshot({ path: join(SHOTS, 'walk-detail-screening-failed.png'), fullPage: true });
    }

    // ── bulk selection + bulk screening ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByText(`Ada ${RUN_ID}`, { exact: false }).first().waitFor({ timeout: 20000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    const n = await checkboxes.count();
    note('bulk', `checkboxes found: ${n}`);
    if (n >= 2) {
      await checkboxes.nth(0).check().catch(() => {});
      await checkboxes.nth(1).check().catch(() => {});
      await sleep(500);
      const bulkBtn = page.getByRole('button', { name: /Run AI Screening|Bulk AI Screening|AI Screening/i }).first();
      if ((await bulkBtn.count()) > 0) {
        await bulkBtn.click();
        await sleep(800);
        // confirm dialog if present
        const confirm = page.getByRole('button', { name: /Confirm|Start|Run/i }).first();
        if ((await page.getByRole('dialog').count()) > 0 && (await confirm.count()) > 0) {
          await confirm.click();
        }
        await sleep(3000);
        let batch = null;
        for (let t = 0; t < 100; t++) {
          await sleep(2000);
          const batches = await prisma.aiScreeningBatch.findMany({ where: { companyId: ids.companyId }, orderBy: { createdAt: 'desc' } });
          if (batches.length) {
            batch = batches[0];
            const items = await prisma.aiScreeningBatchItem.findMany({ where: { batchId: batch.id } });
            const results = await prisma.aiScreeningResult.findMany({ where: { batchId: batch.id } });
            const allTerminal = results.length > 0 && results.every((r) => ['COMPLETED', 'FAILED'].includes(r.status));
            if (allTerminal) {
              note('bulk.terminal', `batch=${batch.id} items=${items.length} results=${results.length} statuses=${results.map((r) => r.status).join(',')} codes=${results.map((r) => r.failureCode ?? '-').join(',')}`);
              const appIdsUsed = results.map((r) => r.applicationId).sort();
              const expected = [appA.id, appB.id].sort();
              note('bulk.mapping', `applicationIds match=${JSON.stringify(appIdsUsed) === JSON.stringify(expected)} (${appIdsUsed.join(',')})`);
              break;
            }
          }
        }
        if (!batch) note('bulk.terminal', 'no batch reached terminal state');
      } else {
        note('bulk', 'no bulk screening button found');
      }
    }
    await page.screenshot({ path: join(SHOTS, 'walk-bulk.png'), fullPage: true });

    // ── refresh persistence ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    const bothVisible = (await page.getByText(`Ada ${RUN_ID}`, { exact: false }).count()) > 0 &&
      (await page.getByText(`Ben ${RUN_ID}`, { exact: false }).count()) > 0;
    note('refresh', `both candidates present after reload: ${bothVisible}`);

    const fatal = browserErrors.filter((e) => !/net::ERR_ABORTED/.test(e) && !/409 \(Conflict\)/.test(e));
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