/** Focused pipeline movement test via the detail-dialog "Move to X" button. */
import { createRequire } from 'node:module';
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
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));
const RUN_ID = Date.now();
const EMAIL = `pvm${RUN_ID}@e2e.com`;
const COMPANY = `Pvm Co ${RUN_ID}`;
const PASSWORD = `PvmPass!${RUN_ID}`;
const JOB_TITLE = `Pvm Role ${RUN_ID}`;
const CAND = `Mia ${RUN_ID}`;
const CAND_EMAIL = `mia${RUN_ID}@e2e.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (l, d) => console.log(`  [${l}] ${d}`);

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

async function main() {
  console.log('== pipeline-movement.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
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
    const jr = await fetch(`${BE_URL}/api/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ title: JOB_TITLE, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Pipeline movement verification role.' }) });
    const job = (await jr.json()).data;
    ids.jobIds.push(job.id);
    await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
    const d = page.getByRole('dialog');
    await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
    await page.fill('input[placeholder="e.g. John Smith"]', CAND);
    await page.fill('input[placeholder="john@example.com"]', CAND_EMAIL);
    await d.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: new RegExp(JOB_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
    await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
    await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
    await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
    await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
    await sleep(800);

    const cand = await prisma.candidate.findFirst({ where: { normalizedEmail: CAND_EMAIL.toLowerCase() } });
    const app = await prisma.application.findFirst({ where: { candidateId: cand.id } });
    const sf = await prisma.storedFile.findFirst({ where: { applicationId: app.id, category: 'RESUME' } });
    ids.candidateIds.push(cand.id); ids.applicationIds.push(app.id); ids.storedFileIds.push(sf.id);

    const pipe = await prisma.jobPipeline.findFirst({ where: { jobId: job.id } });
    const stages = await prisma.jobPipelineStage.findMany({ where: { pipelineId: pipe.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
    note('stages', stages.map((s) => `${s.name}:${s.id.slice(0, 8)}`).join(' | '));
    note('app.initial', `stage=${app.currentStageId} (${stages.find((s) => s.id === app.currentStageId)?.name})`);

    await page.goto(`${FE_URL}/pipeline`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Pipeline', { exact: true }).first().waitFor({ timeout: 20000 });
    await sleep(1500);
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: new RegExp(JOB_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await sleep(2500);

    // open the candidate card (detail dialog) and use the explicit "Move to Screening" button
    await page.getByText(CAND, { exact: false }).first().click();
    const detail = page.getByRole('dialog');
    const moveBtn = detail.getByRole('button', { name: /Move to Screening/ });
    note('move.btn', `"Move to Screening" button found: ${(await moveBtn.count()) > 0}`);
    await moveBtn.first().click();
    await sleep(2500);

    const app2 = await prisma.application.findFirst({ where: { id: app.id } });
    const screeningStage = stages[1];
    note('app.after', `stage=${app2.currentStageId} (${stages.find((s) => s.id === app2.currentStageId)?.name ?? 'UNKNOWN'}) expected=${screeningStage.id} (${screeningStage.name})`);
    console.log(`${app2.currentStageId === screeningStage.id ? 'PASS' : 'FAIL'}  movement Applied -> Screening via detail dialog`);
    const deleted = await prisma.jobPipelineStage.count({ where: { pipelineId: pipe.id, deletedAt: { not: null } } });
    console.log(`${deleted === 0 ? 'PASS' : 'FAIL'}  no stages soft-deleted by the move  <-- deleted=${deleted}`);

    // refresh -> card should be in Screening column
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: new RegExp(JOB_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await sleep(2500);
    const cols = page.locator('.snap-x > div');
    const screeningText = await cols.nth(1).innerText();
    const refreshed = screeningText.includes(CAND);
    console.log(`${refreshed ? 'PASS' : 'FAIL'}  card stays in Screening after refresh  <-- col1=[${screeningText.replace(/\n+/g, ' | ').slice(0, 80)}]`);
  } finally {
    await cleanupExact(prisma, ids, () => {});
    await prisma.$disconnect().catch(() => {});
    await browser.close();
  }
}
main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });