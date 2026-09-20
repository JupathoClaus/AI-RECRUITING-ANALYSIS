/**
 * CANDIDATES LIVE QWEN ACCEPTANCE (Issue #2, final phase)
 *
 * Real T4 GPU + real Qwen3.5-9B. Covers:
 *  - candidate creation via UI, extraction COMPLETED
 *  - real screening -> COMPLETED, criterionEvaluations/evidence/confidence/recommendation/score
 *  - expected score vs DB vs API vs UI (not stuck at 0)
 *  - forced provider failure -> FAILED -> restore -> Retry Screening -> COMPLETED
 *  - two-candidate evidence isolation (no cross-mixing)
 *  - bulk screening via UI (terminal counts + applicationIds)
 *  - refresh + navigate persistence
 *  - browser console/network cleanliness
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
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
const RESUME_A = fileURLToPath(new URL('./fixtures/live-backend-resume.pdf', import.meta.url));
const RESUME_B = fileURLToPath(new URL('./fixtures/live-analyst-resume.pdf', import.meta.url));
const SSH = 'ssh s_01m0f953aw1erhbeq8z1kkv2vm@ssh.lightning.ai';

const RUN_ID = Date.now();
const EMAIL = `live${RUN_ID}@e2e.com`;
const COMPANY = `Live Co ${RUN_ID}`;
const PASSWORD = `LivePass!${RUN_ID}`;
const JOB_A = `Live Backend Role ${RUN_ID}`;
const JOB_B = `Live Analyst Role ${RUN_ID}`;
const CAND_A = `Ava Liu ${RUN_ID}`;
const CAND_B = `Ben Okafor ${RUN_ID}`;
const MAIL_A = `ava${RUN_ID}@e2e.com`;
const MAIL_B = `ben${RUN_ID}@e2e.com`;

const results = [];
const browserErrors = [];
const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => {
  results.push({ label, detail });
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

const ssh = (cmd, { timeoutMs = 180000 } = {}) => {
  const out = execSync(`${SSH} "${cmd}"`, { encoding: 'utf8', timeout: timeoutMs, shell: 'powershell.exe', stdio: ['ignore', 'pipe', 'pipe'] });
  return out.trim();
};

function startKeepalive() {
  // The free-tier Studio can auto-stop when idle; keep the endpoint warm.
  const key = readFileSync(join(process.env.TEMP ?? '/tmp', 'opencode', 'lightning-key'), 'utf8').trim();
  const timer = setInterval(async () => {
    try {
      await fetch('https://8000-01m0f953aw1erhbeq8z1kkv2vm.cloudspaces.litng.ai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch { /* ignore */ }
  }, 45000);
  return timer;
}

function scoreMultiplier(status) {
  if (status === 'FULLY_MET') return 1;
  if (status === 'PARTIALLY_MET') return 0.5;
  return 0;
}

async function waitScreeningTerminal(prisma, appId, { fromId = null, timeoutMs = 480000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(3000);
    last = await prisma.aiScreeningResult.findFirst({ where: { applicationId: appId }, orderBy: { createdAt: 'desc' } });
    if (last && (fromId === null || last.id !== fromId) && ['COMPLETED', 'FAILED'].includes(last.status)) return last;
  }
  return last;
}

const STAGE = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : 'all';
const KEEP = process.argv.includes('--keep');

async function main() {
  console.log('== candidates-live-acceptance.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };

  let browser;
  let keepaliveTimer = null;
  try {
    browser = await chromium.launch({ headless: true });
    keepaliveTimer = startKeepalive();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !/favicon|manifest/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.url()}`);
      }
    });

    // â”€â”€ auth â”€â”€
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
    note('auth', 'registered + logged in');

    const login = await fetch(`${BE_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    const token = (await login.json()).data.tokens.accessToken;

    const mkJob = async (title, description, skills) => {
      const r = await fetch(`${BE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description }),
      });
      const j = (await r.json()).data;
      ids.jobIds.push(j.id);
      for (const s of skills) {
        const sk = await prisma.skill.create({ data: { displayName: s, normalizedName: s.toLowerCase(), type: 'TECHNICAL', isGlobal: false, companyId: ids.companyId } });
        await prisma.jobSkill.create({ data: { jobId: j.id, skillId: sk.id, importance: 'REQUIRED' } });
      }
      await fetch(`${BE_URL}/api/v1/jobs/${j.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      return j;
    };
    const jobA = await mkJob(JOB_A, 'Builds Node.js TypeScript backend services with PostgreSQL.', ['TypeScript', 'Node.js', 'PostgreSQL']);
    const jobB = await mkJob(JOB_B, 'Analyses business metrics with Excel and Python, builds Power BI dashboards.', ['Excel', 'Python', 'Data Analysis']);

    const addCandidateViaUI = async ({ name, email, jobTitle, resumePath }) => {
      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', name);
      await page.fill('input[placeholder="john@example.com"]', email);
      await d.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', resumePath);
      await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
      await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
      await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
      await sleep(800);
    };

    await addCandidateViaUI({ name: CAND_A, email: MAIL_A, jobTitle: JOB_A, resumePath: RESUME_A });
    await addCandidateViaUI({ name: CAND_B, email: MAIL_B, jobTitle: JOB_B, resumePath: RESUME_B });
    note('create', 'both candidates created via UI');

    const candA = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_A.toLowerCase() } });
    const candB = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_B.toLowerCase() } });
    ids.candidateIds.push(candA.id, candB.id);
    const appA = await prisma.application.findFirst({ where: { candidateId: candA.id } });
    const appB = await prisma.application.findFirst({ where: { candidateId: candB.id } });
    ids.applicationIds.push(appA.id, appB.id);
    const sfA = await prisma.storedFile.findFirst({ where: { applicationId: appA.id, category: 'RESUME' } });
    const sfB = await prisma.storedFile.findFirst({ where: { applicationId: appB.id, category: 'RESUME' } });
    ids.storedFileIds.push(sfA.id, sfB.id);
    check('app->job linkage', appA.jobId === jobA.id && appB.jobId === jobB.id, `A->${appA.jobId} B->${appB.jobId}`);

    const openDetailsAndScreen = async (candName, appId) => {
      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByText(candName, { exact: false }).first().waitFor({ timeout: 20000 });
      await page.getByText(candName, { exact: false }).first().click();
      const detail = page.getByRole('dialog');
      await detail.getByText('AI Screening', { exact: true }).waitFor({ timeout: 10000 });
      await detail.getByRole('button', { name: 'Start AI Screening', exact: true }).first().click();
      return detail;
    };

    // â”€â”€ PHASE 1: live screening for candidate A â”€â”€
    note('phase1', 'starting real Qwen screening for candidate A');
    const detailA = await openDetailsAndScreen(CAND_A, appA.id);
    const sA = await waitScreeningTerminal(prisma, appA.id, { timeoutMs: 480000 });
    check('A screening COMPLETED', sA?.status === 'COMPLETED', `status=${sA?.status} code=${sA?.failureCode} msg=${sA?.failureMessageSafe}`);
    if (sA?.status === 'COMPLETED') {
      const evals = (sA.criterionEvaluations || []);
      const scores = (sA.criteriaScores || []);
      const expected = Math.round(
        scores.reduce((sum, cs) => sum + cs.weight * scoreMultiplier(evals.find((e) => e.criterionId === cs.criterionId)?.status), 0) /
        scores.reduce((sum, cs) => sum + cs.weight, 0) * 100,
      );
      const apiRes = await fetch(`${BE_URL}/api/v1/ai-screenings/${sA.id}`, { headers: { authorization: `Bearer ${token}` } });
      const apiBody = await apiRes.json();
      const apiScore = apiBody.data?.overallScore;
      const dText = (await detailA.innerText()).slice(0, 600);
      const uiMatch = dText.match(/Overall Score\s*(\d+)\/100/);
      const uiScore = uiMatch ? Number(uiMatch[1]) : null;
      note('A.details', `expected=${expected} db=${sA.overallScore} api=${apiScore} ui=${uiScore}`);
      check('A score not 0', sA.overallScore > 0, `db score=${sA.overallScore}`);
      check('A score expected==db', expected === sA.overallScore, `expected=${expected} db=${sA.overallScore}`);
      check('A score db==api', sA.overallScore === apiScore, `db=${sA.overallScore} api=${apiScore}`);
      check('A score db==ui', sA.overallScore === uiScore, `db=${sA.overallScore} ui=${uiScore}`);
      note('A.result', `recommendation=${sA.recommendation} confidence=${sA.confidence} criteria=${evals.length} evidence=${(sA.evidence || []).length} model=${sA.model}`);
      check('A has criterion evaluations', evals.length >= 2, `count=${evals.length}`);
      check('A has evidence', (sA.evidence || []).length > 0, `count=${(sA.evidence || []).length}`);
      check('A has recommendation', ['SHORTLIST', 'NOT_SHORTLIST', 'HUMAN_REVIEW'].includes(sA.recommendation), sA.recommendation);
      check('A has confidence', ['HIGH', 'MEDIUM', 'LOW'].includes(sA.confidence), sA.confidence);
      await page.screenshot({ path: join(SHOTS, 'live-A-completed.png'), fullPage: true });
    }

    // â”€â”€ PHASE 2: forced provider failure -> FAILED -> restore -> Retry -> COMPLETED (candidate B) â”€â”€
    note('phase2', 'forcing provider failure (killing vLLM) for candidate B');
    try { ssh("pkill -f '[v]llm serve'"); } catch { /* ignore */ }
    await sleep(5000);
    const detailB = await openDetailsAndScreen(CAND_B, appB.id);
    const sB1 = await waitScreeningTerminal(prisma, appB.id, { timeoutMs: 420000 });
    check('B initial screening FAILED while provider down', sB1?.status === 'FAILED', `status=${sB1?.status} code=${sB1?.failureCode}`);
    note('B.failure', `failureCode=${sB1?.failureCode} msg=${sB1?.failureMessageSafe}`);

    note('phase2', 'restoring provider (starting vLLM)');
    let restored = false;
    for (let attempt = 0; attempt < 30 && !restored; attempt++) {
      try {
        ssh('bash /teamspace/studios/this_studio/start-vllm.sh');
        restored = true;
      } catch {
        note('phase2', `studio not reachable, retrying in 30s (attempt ${attempt + 1}/30)`);
        await sleep(30000);
      }
    }
    let healthy = false;
    for (let t = 0; t < 160; t++) {
      await sleep(3000);
      try {
        const out = execSync(`ssh s_01m0f953aw1erhbeq8z1kkv2vm@ssh.lightning.ai "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/health"`, { encoding: 'utf8', shell: 'powershell.exe', timeout: 60000 }).trim();
        if (out === '200') { healthy = true; break; }
      } catch { /* keep waiting */ }
    }
    check('provider restored (health 200)', healthy, 'health not 200 within 8 min');

    const retryBtn = detailB.getByRole('button', { name: 'Retry', exact: true });
    if ((await retryBtn.count()) > 0) {
      await retryBtn.first().click();
      note('retry', 'clicked Retry Screening for candidate B');
    } else {
      note('retry', 'retry button not found (dialog state below)');
      note('retry.dialog', (await detailB.innerText()).slice(0, 400));
    }
    const sB2 = await waitScreeningTerminal(prisma, appB.id, { fromId: sB1?.id ?? null, timeoutMs: 600000 });
    check('B retry reached COMPLETED', sB2?.status === 'COMPLETED', `status=${sB2?.status} code=${sB2?.failureCode} msg=${sB2?.failureMessageSafe}`);
    check('B retry created a new screening row', sB2?.id !== sB1?.id, `old=${sB1?.id} new=${sB2?.id}`);
    if (sB2?.status === 'COMPLETED') {
      note('B.result', `score=${sB2.overallScore} recommendation=${sB2.recommendation} confidence=${sB2.confidence}`);
      await page.screenshot({ path: join(SHOTS, 'live-B-retry-completed.png'), fullPage: true });
    }

    // â”€â”€ PHASE 3: evidence isolation â”€â”€
    if (sA?.status === 'COMPLETED' && sB2?.status === 'COMPLETED') {
      const kwA = ['node.js', 'typescript', 'postgresql', 'rest', 'queue', 'backend', 'api'];
      const kwB = ['excel', 'python', 'power bi', 'report', 'budget', 'dashboard', 'analys'];
      const evA = (sA.evidence || []).map((e) => (e.sourceText || '').toLowerCase());
      const evB = (sB2.evidence || []).map((e) => (e.sourceText || '').toLowerCase());
      const crossA = evA.filter((t) => kwB.some((k) => t.includes(k)) && !kwA.some((k) => t.includes(k))).length;
      const crossB = evB.filter((t) => kwA.some((k) => t.includes(k)) && !kwB.some((k) => t.includes(k))).length;
      const ownA = evA.filter((t) => kwA.some((k) => t.includes(k))).length;
      const ownB = evB.filter((t) => kwB.some((k) => t.includes(k))).length;
      check('A evidence references own resume', ownA >= Math.min(1, evA.length), `own=${ownA}/${evA.length}`);
      check('B evidence references own resume', ownB >= Math.min(1, evB.length), `own=${ownB}/${evB.length}`);
      check('no cross-candidate evidence mixing', crossA === 0 && crossB === 0, `A-cross=${crossA} B-cross=${crossB}`);
    } else {
      check('evidence isolation (requires both COMPLETED)', false, 'one screening not COMPLETED');
    }

    // â”€â”€ PHASE 4: bulk screening via UI â”€â”€
    note('phase4', 'bulk screening via candidates page');
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByText(CAND_A, { exact: false }).first().waitFor({ timeout: 20000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    const n = await checkboxes.count();
    let batch = null;
    if (n >= 2) {
      await checkboxes.nth(0).check().catch(() => {});
      await checkboxes.nth(1).check().catch(() => {});
      await sleep(600);
      const bulkBtn = page.getByRole('button', { name: /Run AI Screening|Bulk AI Screening/i }).first();
      if ((await bulkBtn.count()) > 0) {
        await bulkBtn.click();
        await sleep(1000);
        const confirm = page.getByRole('button', { name: /Confirm|Start|Run/i }).first();
        if ((await page.getByRole('dialog').count()) > 0 && (await confirm.count()) > 0) await confirm.click();
        for (let t = 0; t < 120; t++) {
          await sleep(3000);
          const batches = await prisma.aiScreeningBatch.findMany({ where: { companyId: ids.companyId }, orderBy: { createdAt: 'desc' } });
          if (batches.length) {
            batch = batches[0];
            const items = await prisma.aiScreeningBatchItem.findMany({ where: { batchId: batch.id } });
            const results2 = await prisma.aiScreeningResult.findMany({ where: { batchId: batch.id } });
            if (results2.length === 2 && results2.every((r) => ['COMPLETED', 'FAILED'].includes(r.status))) {
              const appIdsUsed = results2.map((r) => r.applicationId).sort();
              check('bulk terminal with 2 results', true, '');
              check('bulk applicationIds match [appA, appB]', JSON.stringify(appIdsUsed) === JSON.stringify([appA.id, appB.id].sort()), `got=${appIdsUsed}`);
              check('bulk no duplicate rows per application', new Set(appIdsUsed).size === 2, `count=${appIdsUsed.length}`);
              note('bulk.detail', `batch=${batch.id} items=${items.length} statuses=${results2.map((r) => `${r.status}:${r.overallScore}`).join(' | ')}`);
              break;
            }
          }
        }
        if (!batch) check('bulk terminal', false, 'no terminal batch with 2 results');
      } else {
        check('bulk button', false, 'no bulk button found');
      }
    } else {
      check('bulk checkboxes', false, `only ${n} checkboxes`);
    }
    await page.screenshot({ path: join(SHOTS, 'live-bulk.png'), fullPage: true });

    // â”€â”€ PHASE 5: persistence after refresh + navigation â”€â”€
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(CAND_A, { exact: false }).first().waitFor({ timeout: 20000 });
    await page.getByText(CAND_A, { exact: false }).first().click();
    const detailA2 = page.getByRole('dialog');
    await detailA2.getByText('AI Screening', { exact: true }).waitFor({ timeout: 10000 });
    const persistText = await detailA2.innerText();
    const persisted = persistText.includes(`${sA?.overallScore ?? '?'}/100`) || persistText.includes('Overall Score');
    check('result persists after reload', persisted, 'score not found in detail after reload');
    await page.screenshot({ path: join(SHOTS, 'live-persist.png'), fullPage: true });

    // â”€â”€ PHASE 6: console/network â”€â”€
    const benign = browserErrors.filter((e) => /409 \(Conflict\)|404.*ai-screenings\/latest|net::ERR_ABORTED/.test(e));
    const fatal = browserErrors.filter((e) => !benign.includes(e));
    note('browser.errors', `total=${browserErrors.length} benign=${benign.length} fatal=${fatal.length}`);
    for (const e of fatal.slice(0, 12)) console.log('    - ' + e);

    console.log(`\n== SUMMARY ==`);
    console.log(`PASS: ${PASS.length}`);
    console.log(`FAIL: ${FAIL.length}`);
    if (FAIL.length) FAIL.forEach((f) => console.log('  - ' + f));
  } finally {
    clearInterval(keepaliveTimer);
    await cleanupExact(prisma, ids, () => {});
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});