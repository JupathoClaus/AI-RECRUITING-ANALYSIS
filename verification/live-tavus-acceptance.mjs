/**
 * ISSUE #7 — ONE controlled live Tavus session.
 *
 * Creates a real (billing) Tavus conversation through the public candidate
 * flow with a synthetic test candidate, verifies:
 *   - conversation created with status active + meeting token
 *   - the branded AI Recruiter session shell embeds the Tavus room
 *   - provider conversation ID persisted on the AiInterview record
 *   - conversation ends cleanly (ended via the Tavus API to save minutes)
 *   - simulated shutdown callback completes the record lifecycle
 *
 * Webhook delivery from Tavus cannot reach localhost in this environment;
 * that limitation is documented in the report.
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
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'live-tavus-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME = fileURLToPath(new URL('./fixtures/live-backend-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = 'sarah@airecruiter.com';
const PASSWORD = 'admin123';
const JOB = `Live Tavus Role ${RUN_ID}`;
const CAND = `Tavus Test ${RUN_ID}`;
const MAIL = `tavus${RUN_ID}@e2e.com`;
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
  console.log('== live-tavus-acceptance.mjs ==');
  const ids = { jobIds: [], candidateIds: [], applicationIds: [], interviewIds: [], storedFileIds: [], extractionIds: [] };
  let browser;
  try {
    const token = await apiLogin(EMAIL, PASSWORD);
    if (!token) throw new Error('login failed');
    note('auth', 'logged in via API');

    // job via API
    const jobRes = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: JOB, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Live Tavus acceptance role for an AI recruiter platform engineer.', qualifications: 'Node.js and TypeScript experience; strong communication.', responsibilities: 'Own features end to end; collaborate with product and design.' }),
    });
    const job = (await jobRes.json()).data;
    ids.jobIds.push(job.id);
    await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    note('job', `created + published ${JOB}`);

    // candidate via UI
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[type="email"]', EMAIL],
      ['input[type="password"]', PASSWORD],
    ]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
    const d = page.getByRole('dialog');
    await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
    await page.fill('input[placeholder="e.g. John Smith"]', CAND);
    await page.fill('input[placeholder="john@example.com"]', MAIL);
    await d.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: new RegExp(JOB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME);
    await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
    await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
    await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
    await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
    await sleep(800);
    const cand = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL.toLowerCase() } });
    ids.candidateIds.push(cand.id);
    const app = await prisma.application.findFirst({ where: { candidateId: cand.id, deletedAt: null } });
    ids.applicationIds.push(app.id);
    for (const sf of await prisma.storedFile.findMany({ where: { applicationId: app.id } })) ids.storedFileIds.push(sf.id);
    note('candidate', `candidate created (${cand.id})`);

    // create TAVUS interview
    const createRes = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: app.id, language: 'en', estimatedDurationMinutes: 30, provider: 'TAVUS' }),
    });
    const interview = (await createRes.json()).data;
    ids.interviewIds.push(interview.id);
    const rawCode = interview.rawCode;
    check('tavus: interview created with TAVUS provider', createRes.status === 201 && interview.provider === 'TAVUS', `status=${createRes.status} provider=${interview.provider}`);
    note('tavus', `interview id ${interview.id}`);

    // candidate verifies code and starts
    const verify = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: rawCode }),
    });
    const verifyBody = await verify.json();
    const accessToken = verifyBody.data?.accessToken ?? verifyBody.accessToken;
    check('tavus: code verified', verify.status === 200 && !!accessToken, `status=${verify.status}`);

    const startRes = await fetch(`${BE_URL}/api/v1/ai-interviews/public/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ acknowledgementsAccepted: true, accommodationRequested: false }),
    });
    const startBody = await startRes.json();
    const start = startBody.data ?? startBody;
    check('tavus: start created a live conversation', startRes.status === 200 && !!start.conversationId && !!start.conversationUrl, `status=${startRes.status} id=${start.conversationId} url=${start.conversationUrl}`);
    check('tavus: meeting token returned for private room', typeof start.meetingToken === 'string' && start.meetingToken.length > 20, `token len=${(start.meetingToken || '').length}`);
    check('tavus: no API key leaked in response', !JSON.stringify(startBody).includes(process.env.TAVUS_API_KEY || 'tavus-key-marker') && !/x-api-key/i.test(JSON.stringify(startBody)), 'key leaked');
    note('tavus', `conversation ${start.conversationId} status ${start.provider}`);

    const rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    check('db: provider conversation id + url persisted', rec?.tavusConversationId === start.conversationId && rec?.tavusConversationUrl === start.conversationUrl, `db=${rec?.tavusConversationId}`);
    check('db: meeting token persisted server-side only', !!rec?.tavusMeetingToken, 'token not stored');

    // open the branded session shell (Tavus embed) - attach response listener FIRST
    const roomLoadedPromise = page
      .waitForResponse((r) => /tavus\.daily\.co|daily\.co/.test(r.url()), { timeout: 40000 })
      .then(() => true)
      .catch(() => false);
    await page.evaluate(() => sessionStorage.clear());
    await page.evaluate((sess) => {
      for (const [k, v] of Object.entries(sess)) sessionStorage.setItem(k, v);
    }, {
      'ai-interview-access-token': accessToken,
      'ai-interview-conversation-url': start.conversationUrl,
      'ai-interview-conversation-id': start.conversationId,
      'ai-interview-meeting-token': start.meetingToken || '',
      'ai-interview-provider': 'TAVUS',
      'ai-interview-candidate-first-name': CAND.split(' ')[0],
      'ai-interview-candidate-name': CAND,
      'ai-interview-job-title': JOB,
    });
    await page.goto(`${FE_URL}/interview/session`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: join(SHOTS, 'tavus-branded-shell.png') });
    const bodyText = await page.locator('body').innerText();
    check('tavus: branded shell header visible', bodyText.includes('AI Interview') && bodyText.includes(CAND.split(' ')[0]), 'shell header missing');
    check('tavus: in-progress badge visible', bodyText.includes('In progress'), 'badge missing');
    // The Tavus room iframe should be present and loading daily.co resources
    const iframeCount = await page.locator('iframe[title="AI Interview"]').count();
    check('tavus: Tavus room embedded in iframe', iframeCount === 1, `iframe count=${iframeCount}`);
    const roomLoaded = await roomLoadedPromise;
    check('tavus: Tavus room responded (daily.co resources)', roomLoaded, 'no daily.co response observed');
    const iframeUrl = await page.locator('iframe[title="AI Interview"]').getAttribute('src');
    check('tavus: private room uses meeting token in URL', !!iframeUrl && iframeUrl.includes('t='), `url=${(iframeUrl || '').slice(0, 80)}`);
    const iframeStatus = await page
      .locator('iframe[title="AI Interview"]')
      .evaluate((el) => (el.contentDocument?.body?.innerText || '').slice(0, 200))
      .catch(() => '');
    note('tavus', `iframe body: ${iframeStatus || '(cross-origin, not readable)'}`);

    // verify conversation status via the Tavus API directly
    const envFile = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const tavusKey = envFile.match(/^TAVUS_API_KEY=(.+)$/m)?.[1] || '';
    const convCheck = await fetch(`https://tavusapi.com/v2/conversations/${start.conversationId}`, {
      headers: { 'x-api-key': tavusKey },
    });
    const convData = await convCheck.json();
    check('tavus: conversation exists at provider with active status', convCheck.status === 200 && ['active', 'ended'].includes(convData.status), `status=${convCheck.status} convStatus=${convData.status}`);

    // end the conversation now to minimize minutes
    if (tavusKey) {
      const endRes = await fetch(`https://tavusapi.com/v2/conversations/${start.conversationId}/end`, {
        method: 'POST',
        headers: { 'x-api-key': tavusKey },
      });
      check('tavus: conversation ended cleanly', endRes.status === 200, `status=${endRes.status}`);
    }
    await sleep(3000);
    const convAfter = await (await fetch(`https://tavusapi.com/v2/conversations/${start.conversationId}`, { headers: { 'x-api-key': tavusKey } })).json();
    check('tavus: conversation status now ended', convAfter.status === 'ended', `convStatus=${convAfter.status}`);

    // simulated shutdown callback (real webhook cannot reach localhost)
    const callbackSecret = envFile.match(/^TAVUS_CALLBACK_SECRET=(.+)$/m)?.[1] || '';
    const shutdown = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'system.shutdown', conversation_id: start.conversationId, properties: { shutdown_reason: 'conversation_ended' } }),
    });
    check('tavus: shutdown callback accepted', shutdown.status === 200, `status=${shutdown.status}`);
    const recFinal = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    check('db: interview COMPLETED after shutdown', recFinal?.status === 'COMPLETED' && !!recFinal?.completedAt, `status=${recFinal?.status}`);
    // Tavus fires transcription_ready for ended conversations; the artifact
    // sync may have already persisted it (READY) or it may still be pending.
    check('db: transcript status READY or PENDING after shutdown', ['READY', 'PENDING'].includes(recFinal?.transcriptStatus || ''), `ts=${recFinal?.transcriptStatus}`);
    note('tavus', `transcriptStatus=${recFinal?.transcriptStatus} transcriptTurns=${Array.isArray(recFinal?.transcript) ? recFinal.transcript.length : 'none'}`);

    writeFileSync(join(SHOTS, 'summary.json'), JSON.stringify({ pass: PASS, fail: FAIL, notes, browserErrors }, null, 2));
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (!KEEP) {
      try { await cleanupExact(prisma, { applicationIds: ids.applicationIds, candidateIds: ids.candidateIds, jobIds: ids.jobIds, storedFileIds: ids.storedFileIds, extractionIds: ids.extractionIds }); } catch (e) { console.error('cleanup failed:', e); }
    }
    await prisma.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  if (FAIL.length) process.exitCode = 1;
}

main();