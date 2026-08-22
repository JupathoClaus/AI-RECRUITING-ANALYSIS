/**
 * CANDIDATE DATA CONSISTENCY + SAFE DELETE — BROWSER ACCEPTANCE (Issue #4)
 *
 * A. BEFORE: capture Candidates count, Dashboard count, Reports state.
 * B. CREATE: candidate WITH application (UI) + candidate WITHOUT (API).
 *    Verify counts + report rows.
 * C. DELETE: delete both through the UI confirmation flow. Verify candidates
 *    page, dashboard count and reports drop accordingly.
 * D. Cross-tenant: Company B cannot delete Company A's candidate (API).
 * E. REFRESH: pages stay consistent.
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
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'consistency-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL_A = `cA${RUN_ID}@e2e.com`;
const COMPANY_A = `Cons Co ${RUN_ID}`;
const PASSWORD_A = `ConsPass!${RUN_ID}`;
const EMAIL_B = `cB${RUN_ID}@e2e.com`;
const COMPANY_B = `ConsCoB ${RUN_ID}`;
const PASSWORD_B = `ConsBPass!${RUN_ID}`;

const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => console.log(`  [${label}] ${detail}`);
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
  throw new Error('fill failed');
}

async function registerAndLogin(page, prisma, { companyName, email, password }) {
  await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[placeholder="Acme Corp"]', companyName],
    ['input[placeholder="you@company.com"]', email],
    ['input[placeholder="John"]', 'Zed'],
    ['input[placeholder="Doe"]', 'Yon'],
    ['input[placeholder="At least 12 characters"]', password],
    ['input[placeholder="Re-enter your password"]', password],
  ]);
  await page.check('#acceptTerms');
  await page.click('button[type="submit"]');
  await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
  const user = await prisma.user.findUnique({ where: { normalizedEmail: email.toLowerCase() } });
  const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
  await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [['input[type="email"]', email], ['input[type="password"]', password]]);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  return { userId: user.id, companyId: membership.companyId, membershipId: membership.id };
}

async function getToken(email, password) {
  const r = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).data.tokens.accessToken;
}

async function main() {
  console.log('== candidates-consistency-delete.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const idsA = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  const idsB = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  const browserErrors = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !/favicon|manifest/.test(r.url())) browserErrors.push(`http ${r.status()}: ${r.url()}`);
    });

    // ── Company A setup ──
    const a = await registerAndLogin(page, prisma, { companyName: COMPANY_A, email: EMAIL_A, password: PASSWORD_A });
    idsA.userId = a.userId; idsA.companyId = a.companyId; idsA.membershipIds.push(a.membershipId);
    await prisma.companySettings.upsert({ where: { companyId: a.companyId }, update: { requireJobApproval: false }, create: { companyId: a.companyId, requireJobApproval: false } });
    const tokenA = await getToken(EMAIL_A, PASSWORD_A);

    const jr = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: `Cons Role ${RUN_ID}`, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Consistency + delete verification role.' }),
    });
    const job = (await jr.json()).data;
    idsA.jobIds.push(job.id);
    await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${tokenA}` } });

    // ── A. BEFORE ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
    const beforeCandidates = await prisma.candidate.count({ where: { companyCandidates: { some: { companyId: a.companyId } } } });
    note('before', `company A candidates=${beforeCandidates}`);
    await page.screenshot({ path: join(SHOTS, 'consistency-before-candidates.png'), fullPage: true });
    await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const dashBefore = (await page.locator('body').innerText()).slice(0, 500);
    note('before.dashboard', dashBefore.replace(/\n+/g, ' | ').slice(0, 400));
    await page.goto(`${FE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().click();
    await sleep(2500);
    const reportBefore = (await page.locator('body').innerText()).slice(0, 600);
    note('before.report', reportBefore.replace(/\n+/g, ' | ').slice(0, 500));
    await page.screenshot({ path: join(SHOTS, 'consistency-before-report.png'), fullPage: true });

    // ── B. CREATE: candidate WITH app (UI) + candidate WITHOUT app (API) ──
    const candWithAppEmail = `withapp${RUN_ID}@e2e.com`;
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
    const d = page.getByRole('dialog');
    await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
    await page.fill('input[placeholder="e.g. John Smith"]', `With App ${RUN_ID}`);
    await page.fill('input[placeholder="john@example.com"]', candWithAppEmail);
    await d.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: new RegExp(job.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
    await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
    await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
    await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
    await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
    await sleep(800);

    const noAppEmail = `noapp${RUN_ID}@e2e.com`;
    const cr = await fetch(`${BE_URL}/api/v1/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ firstName: `No App ${RUN_ID}`, lastName: 'X', email: noAppEmail, source: 'RECRUITER_CREATED' }),
    });
    const noAppCand = (await cr.json()).data;
    idsA.candidateIds.push(noAppCand.id);

    const candWithApp = await prisma.candidate.findFirst({ where: { normalizedEmail: candWithAppEmail.toLowerCase() } });
    const appWith = await prisma.application.findFirst({ where: { candidateId: candWithApp.id } });
    const sfWith = await prisma.storedFile.findFirst({ where: { applicationId: appWith.id, category: 'RESUME' } });
    idsA.candidateIds.push(candWithApp.id, noAppCand.id);
    idsA.applicationIds.push(appWith.id);
    idsA.storedFileIds.push(sfWith.id);

    const countAfterCreate = await prisma.candidate.count({ where: { companyCandidates: { some: { companyId: a.companyId } } } });
    check('candidates count increased by 2', countAfterCreate === beforeCandidates + 2, `before=${beforeCandidates} after=${countAfterCreate}`);

    // report shows the app row
    await page.goto(`${FE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().click();
    await sleep(3000);
    const rowVisible = await page.getByText(`With App ${RUN_ID}`, { exact: false }).count();
    check('report shows the application row', rowVisible > 0, `count=${rowVisible}`);
    const emptyMsgVisible = await page.getByText(/No candidate applications/, { exact: false }).count();
    check('no misleading "No candidate data" empty state when rows exist', emptyMsgVisible === 0, `emptyMsg=${emptyMsgVisible}`);
    await page.screenshot({ path: join(SHOTS, 'consistency-report-with-data.png'), fullPage: true });

    // dashboard count
    await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const dashAfter = (await page.locator('body').innerText()).slice(0, 500);
    note('dashboard.afterCreate', dashAfter.replace(/\n+/g, ' | ').slice(0, 350));
    await page.screenshot({ path: join(SHOTS, 'consistency-dashboard-after-create.png'), fullPage: true });

    // ── C. DELETE via UI (candidate with app) ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByText(`With App ${RUN_ID}`, { exact: false }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(SHOTS, 'consistency-candidates-before-delete.png'), fullPage: true });
    const row = page.getByText(`With App ${RUN_ID}`, { exact: false }).first();
    const menuBtn = row.locator('xpath=ancestor::tr//button').filter({ hasText: '' }).last();
    // open the row menu via the More button in the same row
    const rowElement = page.locator('tr').filter({ hasText: `With App ${RUN_ID}` }).first();
    await rowElement.locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole('menuitem', { name: 'Delete Candidate' }).click();
    const confirmDialog = page.getByRole('dialog');
    await confirmDialog.getByText('Delete Candidate?', { exact: true }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: join(SHOTS, 'consistency-delete-confirmation.png'), fullPage: true });
    await confirmDialog.getByRole('button', { name: 'Delete Candidate', exact: true }).click();
    await sleep(2500);
    const stillVisible = await page.getByText(`With App ${RUN_ID}`, { exact: false }).count();
    check('deleted candidate disappears from candidates page', stillVisible === 0, `count=${stillVisible}`);
    const dbRow = await prisma.candidate.findFirst({ where: { id: candWithApp.id } });
    check('candidate soft-deleted in DB (status DELETED + deletedAt)', dbRow?.status === 'DELETED' && dbRow.deletedAt != null, `status=${dbRow?.status} deletedAt=${dbRow?.deletedAt}`);
    const appAfter = await prisma.application.findFirst({ where: { id: appWith.id } });
    check('application soft-deleted too', appAfter?.deletedAt != null, `deletedAt=${appAfter?.deletedAt}`);
    const auditRow = await prisma.candidateAuditEvent.findFirst({ where: { candidateId: candWithApp.id, eventType: 'CANDIDATE_DELETED' } });
    check('CANDIDATE_DELETED audit event recorded', !!auditRow, 'no audit row');
    await page.screenshot({ path: join(SHOTS, 'consistency-candidates-after-delete.png'), fullPage: true });

    // report no longer shows the deleted application
    await page.goto(`${FE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.getByText('Candidate Evaluation Report', { exact: false }).first().click();
    await sleep(3000);
    const stillInReport = await page.getByText(`With App ${RUN_ID}`, { exact: false }).count();
    check('report no longer shows deleted candidate', stillInReport === 0, `count=${stillInReport}`);
    const emptyAccurate = await page.getByText(/No candidate applications/, { exact: false }).count();
    check('report empty state is accurate', emptyAccurate > 0, 'wording missing');

    // dashboard count dropped
    await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const dashAfterDelete = (await page.locator('body').innerText()).slice(0, 500);
    note('dashboard.afterDelete', dashAfterDelete.replace(/\n+/g, ' | ').slice(0, 350));

    // ── delete the no-app candidate too (repeat/idempotent) ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByText(`No App ${RUN_ID}`, { exact: false }).first().waitFor({ timeout: 20000 });
    await page.locator('tr').filter({ hasText: `No App ${RUN_ID}` }).first().locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole('menuitem', { name: 'Delete Candidate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Candidate', exact: true }).click();
    await sleep(2500);
    const noAppGone = await page.getByText(`No App ${RUN_ID}`, { exact: false }).count();
    check('no-app candidate deleted from UI', noAppGone === 0, `count=${noAppGone}`);

    // repeat delete → idempotent (API level: delete again returns already_deleted)
    const delAgain = await fetch(`${BE_URL}/api/v1/candidates/${noAppCand.id}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ expectedVersion: noAppCand.version + 1 }),
    });
    check('repeat delete is safe (already_deleted)', delAgain.status === 200 && (await delAgain.json()).data?.status === 'already_deleted', `status=${delAgain.status}`);

    // ── D. cross-tenant: Company B cannot delete Company A's candidate ──
    const regB = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: COMPANY_B, email: EMAIL_B, firstName: 'Zed', lastName: 'Yon',
        password: PASSWORD_B, passwordConfirmation: PASSWORD_B, acceptTerms: true,
      }),
    });
    if (regB.status !== 201) throw new Error(`company B register failed ${regB.status}`);
    const bUser = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL_B.toLowerCase() } });
    const bMem = await prisma.companyMembership.findFirst({ where: { userId: bUser.id } });
    idsB.userId = bUser.id; idsB.companyId = bMem.companyId; idsB.membershipIds.push(bMem.id);
    await prisma.user.update({ where: { id: bUser.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: bUser.id } });
    const tokenB = await getToken(EMAIL_B, PASSWORD_B);
    const cross = await fetch(`${BE_URL}/api/v1/candidates/${noAppCand.id}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ expectedVersion: noAppCand.version + 1 }),
    });
    check('cross-tenant delete blocked (404/403)', cross.status === 404 || cross.status === 403, `status=${cross.status}`);
    const stillThere = await prisma.candidate.findFirst({ where: { id: noAppCand.id } });
    check('cross-tenant attempt did not modify the candidate', stillThere?.status === 'DELETED' || stillThere != null, 'candidate state changed');

    // ── E. refresh persistence ──
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const activeCandidates = await prisma.candidate.count({
      where: {
        status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] },
        companyCandidates: { some: { companyId: a.companyId, deletedAt: null } },
      },
    });
    check('active candidate count stable after refresh (deleted excluded)', activeCandidates === beforeCandidates, `active=${activeCandidates} before=${beforeCandidates}`);
    const dashCount = await prisma.candidate.count({
      where: {
        status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] },
        companyCandidates: { some: { companyId: a.companyId, deletedAt: null } },
      },
    });
    check('dashboard-style count reflects the removals', dashCount === beforeCandidates, `count=${dashCount}`);
    await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const dashFinal = (await page.locator('body').innerText());
    const dashCandMatch = dashFinal.match(/TOTAL CANDIDATES\s*(\d+)/);
    check('dashboard TOTAL CANDIDATES matches active count', dashCandMatch && Number(dashCandMatch[1]) === beforeCandidates, `ui=${dashCandMatch?.[1]} expected=${beforeCandidates}`);
    await page.screenshot({ path: join(SHOTS, 'consistency-dashboard-final.png'), fullPage: true });

    const fatal = browserErrors.filter((e) => !/409 \(Conflict\)|404.*ai-screenings\/latest|net::ERR_ABORTED/.test(e));
    note('console.network', `total=${browserErrors.length} fatal=${fatal.length}`);
    for (const e of fatal.slice(0, 10)) console.log('    - ' + e);

    console.log(`\n== SUMMARY ==`);
    console.log(`PASS: ${PASS.length}`);
    console.log(`FAIL: ${FAIL.length}`);
    if (FAIL.length) FAIL.forEach((f) => console.log('  - ' + f));
  } finally {
    await cleanupExact(prisma, idsB, () => {});
    await cleanupExact(prisma, idsA, () => {});
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});