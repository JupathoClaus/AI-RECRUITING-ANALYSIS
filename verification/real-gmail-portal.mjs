/**
 * REAL GMAIL CODE → PORTAL acceptance (steps 10-14, 16).
 *
 * The user has ALREADY completed the real journey with the real Gmail code:
 * verified by the completed AiInterview record + real Tavus conversation with
 * real spoken turns. This script:
 *   A. proves hash(code) == codeHash and identity mapping,
 *   B. inspects the user's real Tavus conversation context (zero minutes),
 *   C. verifies completed-state re-entry rejection with the REAL code,
 *   D. runs the full UI journey (code→welcome→instructions→consent→device
 *      check→session→completion) on a fresh MOCK interview (no Tavus minutes),
 *   E. tests double-send protection on the Send Invitation control,
 *   F. verifies the recruiter details UI shows the real transcript.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'real-gmail-shots');
mkdirSync(SHOTS, { recursive: true });

const PASS = [];
const FAIL = [];
const browserErrors = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => {
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashNormalized(code) {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '').replace(/[O0I1]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
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
  let browser;
  try {
    const handoff = JSON.parse(readFileSync(join(ROOT, 'verification', 'reports', 'real-gmail-handoff.json'), 'utf8'));
    const { interviewId, rawCode, jobTitle, candidateEmail } = handoff;
    const envFile = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const tavusKey = envFile.match(/^TAVUS_API_KEY=(.+)$/m)?.[1] || '';
    const token = await apiLogin('sarah@airecruiter.com', 'admin123');

    // ── A. hash + identity mapping ──
    const rec = await prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
    });
    check('hash: hash(receivedEmailCode) == AiInterview.codeHash', hashNormalized(rawCode) === rec.codeHash, 'sha256 match');
    check('hash: DB stores masked hint only', /^\*\*\*\*-/.test(rec.codeDisplayHint || ''), rec.codeDisplayHint || '');
    check('map: interview → application → candidate email', rec.application.candidate.email === candidateEmail, rec.application.candidate.email);
    check('map: interview → application → job title', rec.application.job.title === jobTitle, rec.application.job.title);

    // ── B. user's REAL conversation at Tavus (zero extra minutes) ──
    note('real', `user completed the real interview: ${rec.status} transcriptStatus=${rec.transcriptStatus}`);
    check('real: user journey completed the interview (COMPLETED)', rec.status === 'COMPLETED' && !!rec.completedAt && !!rec.startedAt, rec.status);
    const realTurns = Array.isArray(rec.transcript) ? rec.transcript : [];
    const userTurns = realTurns.filter((t) => t.role === 'user');
    const assistantTurns = realTurns.filter((t) => t.role === 'assistant');
    check('real: transcript READY with real spoken turns', rec.transcriptStatus === 'READY' && userTurns.length >= 1 && assistantTurns.length >= 1, `user=${userTurns.length} assistant=${assistantTurns.length}`);
    note('real', `user speech sample: "${userTurns[0]?.content?.slice(0, 60)}"`);
    if (rec.tavusConversationId) {
      const conv = await (await fetch(`https://tavusapi.com/v2/conversations/${rec.tavusConversationId}?verbose=true`, { headers: { 'x-api-key': tavusKey } })).json();
      check('real: conversation ended at provider', conv.status === 'ended', conv.status);
      check('real: conversation name carries candidate + job', (conv.conversation_name || '').includes(jobTitle) && (conv.conversation_name || '').includes(rec.application.candidate.firstName), conv.conversation_name);
      const ctx = conv.conversational_context || '';
      check('real: conversational context has job + candidate + instructions', ctx.includes(jobTitle) && ctx.includes(rec.application.candidate.firstName) && ctx.includes('INTERVIEWER INSTRUCTIONS'), 'context incomplete');
      check('real: callback URL was the public tunnel', (conv.callback_url || '').includes('trycloudflare.com'), conv.callback_url);
      const trEvent = (conv.events || []).find((e) => e.event_type === 'application.transcription_ready');
      check('real: provider holds transcription_ready event', !!trEvent, 'no event');
      const recEvents = (conv.events || []).filter((e) => e.event_type.includes('recording'));
      note('real', `provider recording events: ${recEvents.length} (expected 0 — recording not enabled)`);
    }

    browser = await chromium.launch({
      headless: true,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });

    // ── C. completed-state re-entry rejection with the REAL code ──
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 400/.test(m.text())) browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/ai-interviews/public/')) browserErrors.push(`http ${r.status()}: ${r.url()}`); });

    await page.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    check('portal: AI Recruiter logo present', (await page.locator('img[alt="AI Recruiter"]').count()) > 0, 'logo missing');
    await page.getByLabel('Interview code').fill(rawCode);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForTimeout(2000);
    const completedAlert = await page.locator('#code-error').textContent().catch(() => '');
    check('portal: completed interview rejected with branded message', /already been completed/i.test(completedAlert || ''), completedAlert);
    await page.screenshot({ path: join(SHOTS, '01-completed-reentry.png') });

    // ── D. full UI journey on a fresh MOCK interview (no Tavus minutes) ──
    note('journey', 'fresh MOCK interview for the full UI journey');
    const staleMocks = await prisma.aiInterview.findMany({
      where: { applicationId: rec.applicationId, provider: 'MOCK', status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY'] } },
      select: { id: true },
    });
    for (const s of staleMocks) {
      await fetch(`${BE_URL}/api/v1/ai-interviews/${s.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    }
    const createRes = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: rec.applicationId, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
    });
    const mockInterview = (await createRes.json()).data;
    const mockCode = mockInterview.rawCode;

    await page.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByLabel('Interview code').fill(mockCode);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
    await page.waitForTimeout(2000);
    check('journey: real-style code accepted → welcome', (await page.getByText(`Welcome, ${rec.application.candidate.firstName}`).count()) > 0, 'welcome missing');
    check('journey: welcome shows the authoritative job', (await page.getByText(jobTitle).count()) > 0, 'job missing');
    const welcomeText = await page.locator('body').innerText();
    check('journey: no internal UUIDs in UI', !welcomeText.includes(interviewId) && !welcomeText.includes(rec.applicationId), 'id leaked');
    await page.screenshot({ path: join(SHOTS, '02-welcome-desktop.png') });

    await page.getByRole('button', { name: /Continue to instructions/i }).click();
    await page.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
    await page.waitForTimeout(1500);
    check('journey: instructions display', (await page.getByText('Camera & Microphone').count()) > 0 && (await page.getByText('Recording & Transcript').count()) > 0, 'instructions missing');
    await page.screenshot({ path: join(SHOTS, '03-instructions-desktop.png') });

    const continueBtn = page.getByRole('button', { name: /Check camera & microphone/i });
    check('journey: consent gating', await continueBtn.isDisabled(), 'expected disabled before consent');
    await page.locator('input[type="checkbox"]').nth(0).check();
    await page.locator('input[type="checkbox"]').nth(1).check();
    await continueBtn.click();
    await page.waitForURL(/\/interview\/device-check/, { timeout: 15000 });
    await page.waitForTimeout(4000);
    check('journey: device check ready', (await page.getByText('Ready', { exact: true }).count()) >= 1, 'camera not ready');
    await page.screenshot({ path: join(SHOTS, '04-device-check-desktop.png') });

    const startBtn = page.getByRole('button', { name: /Start AI Interview/i });
    check('journey: Start AI Interview control available', (await startBtn.count()) === 1, 'missing');
    check('journey: no job/application selector on candidate pages', (await page.locator('select, [role="combobox"]').count()) === 0, 'selector found');
    await startBtn.click();
    await page.waitForURL(/\/interview\/session/, { timeout: 30000 });
    await page.waitForTimeout(3000);
    check('journey: session shell shows simulation', (await page.getByText('AI Interview Simulation').count()) > 0, 'shell missing');
    await page.screenshot({ path: join(SHOTS, '05-session-desktop.png') });
    await page.getByRole('button', { name: /Leave/i }).click();
    await page.waitForURL(/\/interview\/complete/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    check('journey: completion page', (await page.getByText('Interview Completed').count()) > 0, 'completion missing');
    await page.screenshot({ path: join(SHOTS, '06-completion-desktop.png') });

    // ── responsive: tablet + mobile (fresh MOCK interview per viewport) ──
    for (const [label, width, height] of [['tablet', 1024, 768], ['mobile', 390, 844]]) {
      // Cancel the previous viewport's untouched MOCK interview so create makes a fresh one
      const activeMock = await prisma.aiInterview.findFirst({
        where: { applicationId: rec.applicationId, provider: 'MOCK', status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY'] } },
        select: { id: true },
      });
      if (activeMock) {
        await fetch(`${BE_URL}/api/v1/ai-interviews/${activeMock.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      }
      const mk = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId: rec.applicationId, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
      });
      const mkInterview = (await mk.json()).data;
      const mkCode = mkInterview.rawCode;
      const rc = await browser.newContext({ viewport: { width, height } });
      const rp = await rc.newPage();
      rp.on('pageerror', (e) => browserErrors.push(`${label} pageerror: ${e.message}`));
      rp.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/ai-interviews/public/')) browserErrors.push(`${label} http ${r.status()}: ${r.url()}`); });
      await rp.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
      await rp.waitForTimeout(2000);
      const o1 = await rp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`responsive: no overflow @${width} code entry`, !o1, 'overflow');
      await rp.screenshot({ path: join(SHOTS, `07-code-entry-${label}.png`) });
      await rp.getByLabel('Interview code').fill(mkCode);
      await rp.getByRole('button', { name: /Continue/i }).click();
      await rp.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
      await rp.waitForTimeout(1500);
      const o2 = await rp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`responsive: no overflow @${width} welcome`, !o2, 'overflow');
      await rp.screenshot({ path: join(SHOTS, `08-welcome-${label}.png`) });
      await rp.getByRole('button', { name: /Continue to instructions/i }).click();
      await rp.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
      await rp.waitForTimeout(1500);
      const o3 = await rp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`responsive: no overflow @${width} instructions`, !o3, 'overflow');
      await rp.screenshot({ path: join(SHOTS, `09-instructions-${label}.png`) });
      await rc.close();
    }

    // ── E. double-send protection (fresh interview, rapid double click) ──
    note('duplicate-send', 'rapid double click on Send Invitation');
    const sendCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sp = await sendCtx.newPage();
    await sp.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(1200);
    await sp.fill('input[type="email"]', 'sarah@airecruiter.com');
    await sp.fill('input[type="password"]', 'admin123');
    await sp.click('button[type="submit"]');
    await sp.waitForURL(/\/dashboard/, { timeout: 30000 });

    const activeForDup = await prisma.aiInterview.findMany({
      where: { applicationId: rec.applicationId, status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY'] } },
      select: { id: true },
    });
    for (const a of activeForDup) {
      await fetch(`${BE_URL}/api/v1/ai-interviews/${a.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    }
    const createDup = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: rec.applicationId, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
    });
    const dupInterview = (await createDup.json()).data;
    await sp.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(3500);
    let sendPosts = 0;
    sp.on('request', (req) => { if (req.method() === 'POST' && req.url().includes('/send')) sendPosts += 1; });
    const sendBtn = sp.getByRole('button', { name: /Send Invitation/i }).first();
    await sendBtn.waitFor({ timeout: 20000 }).catch(async () => {
      await sp.reload({ waitUntil: 'domcontentloaded' });
      await sp.waitForTimeout(3500);
    });
    await sendBtn.click({ clickCount: 2, delay: 50 });
    let dupRec = null;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      dupRec = await prisma.aiInterview.findUnique({ where: { id: dupInterview.id }, select: { status: true, invitationEmail: true } });
      if (dupRec?.status === 'SENT') break;
    }
    check('duplicate-send: exactly one POST /send for rapid double click', sendPosts === 1, `posts=${sendPosts}`);
    check('duplicate-send: status SENT with correct recipient', dupRec?.status === 'SENT' && dupRec?.invitationEmail === candidateEmail, JSON.stringify(dupRec));

    // ── F. recruiter details UI shows the user's REAL transcript (uses sp, still open) ──
    await sp.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(3000);
    const hint = rec.codeDisplayHint || '';
    const targetCard = sp
      .locator('div')
      .filter({ hasText: hint })
      .filter({ has: sp.getByRole('button', { name: /View Details/i }) })
      .last();
    await targetCard.getByRole('button', { name: /View Details/i }).click();
    await sp.waitForTimeout(2500);
    const dialogText = await sp.locator('[role="dialog"]').innerText();
    check('recruiter: dialog shows Completed + real candidate + job', dialogText.includes('Completed') && dialogText.includes(rec.application.candidate.firstName) && dialogText.includes(jobTitle), 'missing');
    check('recruiter: real transcript speaker labels', dialogText.includes('AI Interviewer') && dialogText.includes('Candidate'), 'labels missing');
    check('recruiter: real spoken words visible', dialogText.includes('Yeah, so this is it.'), 'spoken words missing');
    check('recruiter: interviewer question visible', dialogText.includes('Could you walk me through a recent project'), 'question missing');
    await sp.screenshot({ path: join(SHOTS, '10-recruiter-real-transcript.png') });
    await sendCtx.close();

    writeFileSync(join(SHOTS, 'summary.json'), JSON.stringify({ pass: PASS, fail: FAIL, browserErrors }, null, 2));
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  console.log(`\nBROWSER/HTTP ERRORS: ${browserErrors.length}`);
  for (const e of browserErrors) console.log('  -', e);
  if (FAIL.length) process.exitCode = 1;
}

main();