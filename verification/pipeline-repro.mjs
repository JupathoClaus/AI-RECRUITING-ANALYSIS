/**
 * PIPELINE PAGE REPRO + FIX VERIFICATION (Issue #3)
 *
 * Phase A (baseline repro): create job + candidate via real UI, open /pipeline,
 *   confirm the blank board with "All Positions", capture network + console.
 * Phase B (fix verification): select the job -> stages render, candidate card in
 *   Applied stage, stage counts, search, multi-job isolation, movement, refresh.
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
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'pipeline-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = `pipe${RUN_ID}@e2e.com`;
const COMPANY = `Pipe Co ${RUN_ID}`;
const PASSWORD = `PipePass!${RUN_ID}`;

const notes = [];
const browserErrors = [];
const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
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
  console.log('== pipeline-repro.mjs ==');
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
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !/favicon|manifest/.test(r.url())) browserErrors.push(`http ${r.status()}: ${r.url()}`);
    });

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
    ids.userId = user.id; ids.companyId = membership.companyId; ids.membershipIds.push(membership.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    await prisma.companySettings.upsert({ where: { companyId: membership.companyId }, update: { requireJobApproval: false }, create: { companyId: membership.companyId, requireJobApproval: false } });
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [['input[type="email"]', EMAIL], ['input[type="password"]', PASSWORD]]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    const login = await fetch(`${BE_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    const token = (await login.json()).data.tokens.accessToken;

    const mkJob = async (title) => {
      const r = await fetch(`${BE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: `Pipeline verification role ${title}.` }),
      });
      const j = (await r.json()).data;
      ids.jobIds.push(j.id);
      await fetch(`${BE_URL}/api/v1/jobs/${j.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      return j;
    };
    const jobA = await mkJob(`Pipeline Backend ${RUN_ID}`);
    const jobB = await mkJob(`Pipeline Analyst ${RUN_ID}`);

    const addCandidate = async ({ name, email, jobTitle }) => {
      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', name);
      await page.fill('input[placeholder="john@example.com"]', email);
      await d.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
      await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
      await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
      await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
      await sleep(800);
    };
    const MAIL_A = `pipeA${RUN_ID}@e2e.com`;
    const MAIL_B = `pipeB${RUN_ID}@e2e.com`;
    await addCandidate({ name: `Ada ${RUN_ID}`, email: MAIL_A, jobTitle: jobA.title });
    await addCandidate({ name: `Ben ${RUN_ID}`, email: MAIL_B, jobTitle: jobB.title });

    // ── PHASE A: baseline repro on /pipeline with All Positions ──
    await page.goto(`${FE_URL}/pipeline`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Pipeline', { exact: true }).first().waitFor({ timeout: 20000 });
    await sleep(2000);
    const header = (await page.locator('body').innerText()).slice(0, 400);
    note('A.header', header.replace(/\n+/g, ' | '));
    await page.screenshot({ path: join(SHOTS, 'pipeline-before.png'), fullPage: true });

    const board = page.locator('.snap-x');
    const boardCount = await board.count();
    const boardText = boardCount > 0 ? (await board.first().innerText()).slice(0, 300) : '(no board container)';
    note('A.board', `board containers=${boardCount} text=[${boardText.replace(/\n+/g, ' | ')}]`);

    const pipelineRequests = [];
    page.on('response', (r) => { if (/pipeline|stages|applications|candidates|jobs/i.test(r.url())) pipelineRequests.push(`${r.status()} ${r.url().replace(BE_URL, '')}`) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    note('A.network', JSON.stringify([...new Set(pipelineRequests)].slice(0, 20)));

    // ── PHASE B: select the job -> board should render ──
    const filterTrigger = page.locator('[role="combobox"]').first();
    await filterTrigger.click();
    await page.getByRole('option', { name: new RegExp(jobA.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await sleep(2500);
    const boardAfter = await page.locator('.snap-x').first().innerText().catch(() => '(no board)');
    note('B.board', boardAfter.replace(/\n+/g, ' | '));
    await page.screenshot({ path: join(SHOTS, 'pipeline-after-fix.png'), fullPage: true });

    const stageNames = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
    const visibleStages = [];
    for (const s of stageNames) {
      const n = await page.getByText(s, { exact: true }).count();
      if (n > 0) visibleStages.push(s);
    }
    check('stage columns render for selected job', visibleStages.length === stageNames.length, `got=${visibleStages.join(',')}`);

    const cardInApplied = await page.locator('.snap-x').first().getByText(`Ada ${RUN_ID}`, { exact: false }).count();
    check('candidate card renders in a stage', cardInApplied > 0, `count=${cardInApplied}`);

    // stage counts from the stage headers
    const headerText = await page.locator('.snap-x').first().innerText();
    const appliedCountMatch = headerText.match(/Applied\s*(\d+)/);
    check('Applied stage count = 1', appliedCountMatch && Number(appliedCountMatch[1]) === 1, `count=${appliedCountMatch?.[1]}`);

    // ── DB verification ──
    const pipeA = await prisma.jobPipeline.findFirst({ where: { jobId: jobA.id } });
    const stagesA = await prisma.jobPipelineStage.findMany({ where: { pipelineId: pipeA.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
    const appA = await prisma.application.findFirst({ where: { candidate: { normalizedEmail: MAIL_A.toLowerCase() } } });
    ids.applicationIds.push(appA.id);
    const candA = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_A.toLowerCase() } });
    ids.candidateIds.push(candA.id);
    const sfA = await prisma.storedFile.findFirst({ where: { applicationId: appA.id, category: 'RESUME' } });
    ids.storedFileIds.push(sfA.id);
    check('job has pipeline with 6 default stages', stagesA.length === 6, `count=${stagesA.length} names=${stagesA.map((s) => s.name).join(',')}`);
    check('application assigned to first stage (Applied)', appA.currentStageId === stagesA[0]?.id, `stage=${appA.currentStageId} expected=${stagesA[0]?.id}`);
    note('B.stages', `stages: ${stagesA.map((s) => `${s.name}(${s.type})`).join(' | ')}`);

    // ── search test (with job A selected) ──
    const searchInput = page.locator('input[placeholder="Search candidates by name, email, or position..."]');
    await searchInput.fill('zzz-nonexistent');
    await sleep(800);
    const searchEmpty = (await page.locator('.snap-x').first().innerText()).includes('No candidates');
    check('search hides nonmatching candidate', searchEmpty, 'no "No candidates" state');
    await searchInput.fill(`Ada ${RUN_ID}`);
    await sleep(800);
    const searchHit = (await page.locator('.snap-x').first().getByText(`Ada ${RUN_ID}`, { exact: false }).count()) > 0;
    check('search finds matching candidate', searchHit, '');
    await searchInput.fill('');
    await sleep(800);

    // ── movement: Ada Applied -> Screening (via detail dialog) ──
    await page.getByText(`Ada ${RUN_ID}`, { exact: false }).first().click();
    const detail = page.getByRole('dialog');
    const moveBtn = detail.getByRole('button', { name: /Move to Screening/ });
    await moveBtn.first().click();
    await sleep(2500);
    const appA2 = await prisma.application.findFirst({ where: { id: appA.id } });
    check('movement persists to DB (Screening stage)', appA2.currentStageId === stagesA[1]?.id, `stage=${appA2.currentStageId} expected=${stagesA[1]?.id}`);
    const movedStatus = appA2.status;
    note('B.movedStatus', `status after move to Screening: ${movedStatus}`);

    // ── refresh persistence ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const filter2 = page.locator('[role="combobox"]').first();
    await filter2.click();
    await page.getByRole('option', { name: new RegExp(jobA.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await sleep(2500);
    const screeningColText = await page.locator('.snap-x > div').nth(1).innerText();
    check('after refresh card stays in Screening', screeningColText.includes(`Ada ${RUN_ID}`), 'card not in Screening after refresh');
    await page.screenshot({ path: join(SHOTS, 'pipeline-after-refresh.png'), fullPage: true });

    // ── multi-job isolation: switch to job B ──
    await filter2.click();
    await page.getByRole('option', { name: new RegExp(jobB.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await sleep(2500);
    const jobBText = await page.locator('.snap-x').first().innerText();
    const benInB = jobBText.includes(`Ben ${RUN_ID}`);
    const adaInB = jobBText.includes(`Ada ${RUN_ID}`);
    check('job B shows only its candidate', benInB && !adaInB, `ben=${benInB} adaPresent=${adaInB}`);
    await page.screenshot({ path: join(SHOTS, 'pipeline-jobB-filtered.png'), fullPage: true });

    // ── All Positions after fix ──
    await filter2.click();
    await page.getByRole('option', { name: 'All Positions', exact: true }).click();
    await sleep(1500);
    const allPosText = await page.locator('body').innerText();
    const allPosBoard = await page.locator('.snap-x').count();
    note('B.allPositions', `board containers=${allPosBoard} | header=${allPosText.match(/Pipeline[\s\S]{0,60}/)?.[0]?.replace(/\n+/g, ' | ')}`);
    await page.screenshot({ path: join(SHOTS, 'pipeline-all-positions.png'), fullPage: true });

    const fatal = browserErrors.filter((e) => !/409 \(Conflict\)|404.*ai-screenings\/latest|net::ERR_ABORTED/.test(e));
    note('console.network', `total=${browserErrors.length} fatal=${fatal.length}`);
    for (const e of fatal.slice(0, 10)) console.log('    - ' + e);

    console.log(`\n== SUMMARY ==`);
    console.log(`PASS: ${PASS.length}`);
    console.log(`FAIL: ${FAIL.length}`);
    if (FAIL.length) FAIL.forEach((f) => console.log('  - ' + f));
  } finally {
    await cleanupExact(prisma, ids, () => {});
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});