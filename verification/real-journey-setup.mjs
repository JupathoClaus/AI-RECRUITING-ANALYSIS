/**
 * OBJECTIVE A/B/C — REAL production integration setup.
 *
 * Creates controlled data and sends a REAL Gmail invitation to the user's
 * inbox, then hands off to the human interview step.
 *
 *   Recruiter: create AI interview -> send invitation (REAL Gmail SMTP)
 *   Candidate: user performs the real Tavus interview from their inbox
 *   Verification continues in real-journey-verify.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'real-journey-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME = fileURLToPath(new URL('./fixtures/live-backend-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const RECRUITER_EMAIL = 'sarah@airecruiter.com';
const RECRUITER_PASSWORD = 'admin123';
const CANDIDATE_EMAIL = 'jupathoclaus@gmail.com'; // REAL inbox supplied by the user
const JOB = `Production Integration Role ${RUN_ID}`;

const KEEP = process.argv.includes('--keep');
const PASS = [];
const FAIL = [];
const notes = [];
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

async function apiLogin(email, password) {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body.data?.tokens?.accessToken;
}

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  console.log('== real-journey-setup.mjs ==');
  const ids = { jobIds: [], candidateIds: [], applicationIds: [], interviewIds: [], storedFileIds: [], extractionIds: [] };
  let browser;
  try {
    const token = await apiLogin(RECRUITER_EMAIL, RECRUITER_PASSWORD);
    if (!token) throw new Error('login failed');
    note('auth', 'recruiter logged in via API');

    const jobRes = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: JOB, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Production integration role for the AI Recruiter platform engineer.', qualifications: 'Node.js and TypeScript experience; strong communication; product ownership.', responsibilities: 'Own features end to end; collaborate with product and design.' }),
    });
    const job = (await jobRes.json()).data;
    ids.jobIds.push(job.id);
    await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    note('job', `created + published ${JOB}`);

    // Candidate: reuse an existing candidate for the real inbox if present
    // (the user's earlier manual test created one), otherwise create via UI.
    let cand = await prisma.candidate.findFirst({ where: { normalizedEmail: CANDIDATE_EMAIL.toLowerCase() } });
    let candCreatedViaUi = false;
    if (!cand) {
      browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await fillFormWithRetry(page, [
        ['input[type="email"]', RECRUITER_EMAIL],
        ['input[type="password"]', RECRUITER_PASSWORD],
      ]);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/dashboard/, { timeout: 30000 });

      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', 'Giupato Klaus');
      await page.fill('input[placeholder="john@example.com"]', CANDIDATE_EMAIL);
      await d.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(JOB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME);
      await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
      await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
      await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
      await sleep(800);
      cand = await prisma.candidate.findFirst({ where: { normalizedEmail: CANDIDATE_EMAIL.toLowerCase() } });
      candCreatedViaUi = true;
    }
    if (!cand) throw new Error('candidate could not be created');
    ids.candidateIds.push(cand.id);
    note('candidate', candCreatedViaUi ? `candidate created via UI (${cand.id})` : `reused existing candidate (${cand.id})`);

    // Application for the new job (the pre-existing candidate has none)
    let app = await prisma.application.findFirst({ where: { candidateId: cand.id, deletedAt: null } });
    if (!app) {
      const appRes = await fetch(`${BE_URL}/api/v1/applications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidateId: cand.id, jobId: job.id, source: 'RECRUITER_CREATED' }),
      });
      const appBody = await appRes.json();
      app = appBody.data ?? appBody;
      check('setup: application created for the real candidate', appRes.status === 201 && !!app.id, `status=${appRes.status} ${JSON.stringify(appBody).slice(0, 200)}`);
    } else {
      check('setup: existing application reused', true, app.id);
    }
    ids.applicationIds.push(app.id);
    for (const sf of await prisma.storedFile.findMany({ where: { applicationId: app.id } })) ids.storedFileIds.push(sf.id);
    check('setup: candidate has REAL email', cand.email === CANDIDATE_EMAIL, cand.email);

    // AI interview (TAVUS provider) + real invitation
    const createRes = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: app.id, language: 'en', estimatedDurationMinutes: 30, provider: 'TAVUS' }),
    });
    const interview = (await createRes.json()).data;
    ids.interviewIds.push(interview.id);
    const rawCode = interview.rawCode;
    check('setup: AI interview created (TAVUS)', createRes.status === 201 && interview.provider === 'TAVUS', `status=${createRes.status}`);

    const sendRes = await fetch(`${BE_URL}/api/v1/ai-interviews/${interview.id}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rawCode }),
    });
    const sendBody = await sendRes.json();
    check('setup: invitation send endpoint accepted', sendRes.status === 200, `status=${sendRes.status} ${JSON.stringify(sendBody)}`);
    await sleep(4000);

    // Confirm SMTP acceptance from backend logs
    const log = readFileSync(join(ROOT, 'backend', 'backend-new.log'), 'utf8');
    const sentLine = log.split('\n').filter((l) => l.includes('Email sent to') && l.includes(CANDIDATE_EMAIL)).pop();
    check('email: backend logged SMTP send to real address', !!sentLine, 'no "Email sent to" log line');
    note('email', sentLine ? sentLine.match(/Email sent to [^:]+: [^\x1b]+/)?.[0]?.trim() : 'n/a');

    const interviewLink = `${FE_URL}/interview/access`;
    const summary = {
      runId: RUN_ID,
      interviewId: interview.id,
      jobTitle: JOB,
      candidateName: 'Giupato Klaus',
      candidateEmail: CANDIDATE_EMAIL,
      rawCode,
      interviewLink,
      sendResult: sendBody,
    };
    writeFileSync(join(SHOTS, 'setup.json'), JSON.stringify(summary, null, 2));
    console.log('\n=== HUMAN INTERVIEW HANDOFF ===');
    console.log(`1. Check the REAL inbox (${CANDIDATE_EMAIL}) for the invitation from clausromeo55@gmail.com`);
    console.log(`2. Open ${interviewLink}`);
    console.log(`3. Enter code: ${rawCode}`);
    console.log('4. Complete instructions/consent/device check and START the Tavus interview');
    console.log('5. Speak through 3-5 exchanges with the AI interviewer, then leave/end the call');
    console.log('6. Reply here when the interview is done — verification resumes automatically');
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (!KEEP) {
      // NOTE: keep data for the human interview step — cleanup runs in real-journey-verify.mjs
    }
    await prisma.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  if (FAIL.length) process.exitCode = 1;
}

main();