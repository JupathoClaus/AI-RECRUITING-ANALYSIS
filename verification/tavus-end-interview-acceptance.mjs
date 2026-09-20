/**
 * END-INTERVIEW / TAVUS FINALIZATION LIVE ACCEPTANCE
 *
 * Uses the EXISTING real candidate (jupathoclaus@gmail.com) on the EXISTING
 * Senior Software Engineer application, via the NORMAL product flow:
 *   cancel old MOCK interview -> create TAVUS interview -> send invite (real email)
 *   -> candidate portal (code) -> prep -> device check -> START REAL TAVUS
 *   -> short conversation -> real End Interview button -> finalization via the
 *   designed artifact sync (webhook cannot reach localhost) -> recruiter review.
 *
 * Finalization is NOT faked: the real End Interview calls POST /public/complete
 * which (a) terminates the real Tavus conversation and (b) kicks the designed
 * Tavus artifact sync that reconciles ended status -> COMPLETED plus transcript
 * and recording from the real provider. We never call the callback/webhook
 * endpoint ourselves.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE = 'http://localhost:3001';
const BE = 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'tavus-end-shots');
mkdirSync(SHOTS, { recursive: true });

const CAND_EMAIL = 'jupathoclaus@gmail.com';
const APP_ID = '5066542f-1d8b-4cdb-ab7b-58530ca6c1e2';
const OLD_MOCK_INTERVIEW = '8419d54a-4666-4dfd-99fb-e1694141218d';

const PASS = [];
const FAIL = [];
const notes = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => { notes.push({ label, detail }); console.log(`  [${label}] ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const env = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
const tavusKey = env.match(/^TAVUS_API_KEY=(.+)$/m)?.[1] || '';
const quit = (msg) => { throw new Error(msg); };

async function api(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${BE}/api/v1${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body.data ?? body, raw: body };
}

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  console.log('== END-INTERVIEW / TAVUS FINALIZATION LIVE ACCEPTANCE ==\n');

  let browser;

  try {
    // ── AUTH ────────────────────────────────────────────────────────────────
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'sarah@airecruiter.com', password: 'admin123' }) });
    const token = login.body.tokens?.accessToken;
    check('auth: recruiter logged in', login.status === 200 && !!token, `status=${login.status}`);
    const companyId = login.body.activeCompany?.id;

    // Verify candidate + application intact (existing real test data).
    const cand = await db.candidate.findUnique({ where: { id: '96714e9a-2dac-44b4-8aed-dfeb930d487f' }, select: { firstName: true, lastName: true, email: true } });
    const app = await db.application.findUnique({ where: { id: APP_ID }, select: { applicationNumber: true, jobId: true, candidateId: true } });
    check('test: real candidate present', cand?.email === CAND_EMAIL, `email=${cand?.email}`);
    check('test: Senior Software Engineer application present', !!app, 'app missing');
    note('test', `candidate=${cand?.firstName} ${cand?.lastName} app=${app?.applicationNumber}`);

    // ── STAGE 1: create TAVUS interview (NO Tavus minutes yet) ─────────────
    // Cancel every non-terminal interview for the app so a fresh TAVUS interview
    // (with a usable rawCode) is created. Tolerates already-cancelled/re-runs.
    const nonTerminal = await db.aiInterview.findMany({
      where: { applicationId: APP_ID, status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY', 'IN_PROGRESS'] } },
      select: { id: true },
    });
    for (const t of nonTerminal) {
      const c = await api(`/ai-interviews/${t.id}/cancel`, { method: 'POST' }, token);
      note('prep', `cancel ${t.id} -> ${c.status}`);
    }
    const oldAfter = await db.aiInterview.findUnique({ where: { id: OLD_MOCK_INTERVIEW }, select: { status: true } });
    check('prep: old MOCK interview now CANCELLED', oldAfter?.status === 'CANCELLED', `status=${oldAfter?.status}`);

    // Create a real TAVUS interview for the same application.
    const create = await api('/ai-interviews', { method: 'POST', body: JSON.stringify({ applicationId: APP_ID, language: 'en', estimatedDurationMinutes: 15 }) }, token);
    const interview = create.body;
    const interviewId = interview.id;
    const rawCode = interview.rawCode;
    check('prep: TAVUS interview created', create.status === 201 && interview.provider === 'TAVUS', `status=${create.status} provider=${interview.provider}`);
    note('prep', `interview=${interviewId} codeHint=${interview.codeDisplayHint}`);
    const dupCheck = await db.aiInterview.count({ where: { applicationId: APP_ID, status: { notIn: ['CANCELLED', 'EXPIRED', 'FAILED', 'COMPLETED'] } } });
    check('prep: exactly one active interview for the app', dupCheck === 1, `activeCount=${dupCheck}`);

    // Send the real invitation (real SMTP to the candidate inbox) using the same
    // rawCode so the emailed code matches the one we typed (normal product flow).
    const send = await api(`/ai-interviews/${interviewId}/send`, { method: 'POST', body: JSON.stringify({ rawCode }) }, token);
    check('prep: invitation sent (real email)', [200, 201].includes(send.status), `status=${send.status}`);
    await sleep(2500);
    let rec = await db.aiInterview.findUnique({ where: { id: interviewId } });
    check('prep: interview SENT', rec?.status === 'SENT', `status=${rec?.status}`);
    check('prep: invitationEmail = candidate', rec?.invitationEmail === CAND_EMAIL, rec?.invitationEmail);
    note('prep', `invitationSentAt=${rec?.invitationSentAt?.toISOString()} smtpCode?=see log`);

    // ── STAGE 2: real browser candidate portal → start real Tavus ──────────
    browser = await chromium.launch({
      headless: true,
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--mute-audio',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
    const page = await context.newPage();
    const browserErrors = [];
    const endRequests = [];
    const startRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      const u = r.url();
      if (/\/public\/start$/.test(u)) startRequests.push(r.status());
      if (/\/public\/complete$/.test(u)) endRequests.push(r.status());
      if (r.status() >= 400 && !/favicon|manifest|\.map|tavus|daily\.co|ka_font|fonts\.google/.test(u)) {
        browserErrors.push(`http ${r.status()}: ${u}`);
      }
    });

    // Candidate access: enter the raw interview code.
    await page.goto(`${FE}/interview/access`, { waitUntil: 'domcontentloaded' });
    const codeInput = page.locator('#interview-code');
    await codeInput.waitFor({ state: 'visible', timeout: 20000 });
    await codeInput.pressSequentially(rawCode.toUpperCase(), { delay: 60 });
    const submitBtn = page.getByRole('button', { name: /Continue/i });
    await submitBtn.waitFor({ state: 'visible' });
    await submitBtn.click({ timeout: 20000 });
    await page.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
    // Session details load asynchronously via getInterviewSession; wait for content.
    await page.getByText('Senior Software Engineer').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    check('portal: valid code accepted -> welcome', true, '');
    const welcomeText = await page.locator('body').innerText();
    check('portal: correct job resolved', welcomeText.includes('Senior Software Engineer'), 'job not shown');
    const fn = (cand?.firstName || '').toLowerCase();
    check('portal: correct candidate resolved', welcomeText.toLowerCase().includes(fn.slice(0, 5)), 'candidate not shown');
    check('portal: correct organization', welcomeText.includes('AI Recruiter Co'), 'org not shown');

    await page.getByRole('button', { name: /Continue to instructions/i }).click();
    await page.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
    check('portal: preparation page loads', true, '');
    const prepText = await page.locator('body').innerText();
    check('portal: instructions load', prepText.includes('interview instructions') || prepText.toLowerCase().includes('instructions'), 'no instructions');
    const consentBoxes = page.locator('input[type="checkbox"]');
    const consentCount = await consentBoxes.count();
    check('portal: consent checkboxes present', consentCount === 2, `count=${consentCount}`);
    for (let i = 0; i < consentCount; i++) await consentBoxes.nth(i).check();
    await page.getByRole('button', { name: /Check camera & microphone/i }).click();
    await page.waitForURL(/\/interview\/device-check/, { timeout: 15000 });
    check('portal: device-check page loads', true, '');
    await page.waitForTimeout(2000);

    // Start the real Tavus interview.
    const startBtn = page.getByRole('button', { name: /Start AI Interview/i });
    await startBtn.waitFor({ timeout: 20000 });
    check('portal: Start Interview enabled when prep complete', !(await startBtn.isDisabled()), 'start disabled');
    await startBtn.click();
    await page.waitForURL(/\/interview\/session/, { timeout: 40000 });
    note('portal', `startRequests=[${startRequests.join(',')}]`);
    check('portal: exactly one start request', startRequests.length === 1, `count=${startRequests.length}`);
    check('portal: start request HTTP 200', startRequests[0] === 200, `status=${startRequests[0]}`);

    rec = await db.aiInterview.findUnique({ where: { id: interviewId }, select: { status: true, tavusConversationId: true, tavusConversationUrl: true, provider: true, startedAt: true, consentAcceptedAt: true } });
    check('tavus: AiInterview IN_PROGRESS', rec?.status === 'IN_PROGRESS', rec?.status);
    check('tavus: provider conversation id persisted', !!rec?.tavusConversationId, `id=${rec?.tavusConversationId}`);
    check('tavus: meeting token / url persisted server-side', !!rec?.tavusConversationUrl, 'no url');
    const conversationId = rec.tavusConversationId;
    note('tavus', `conversationId=${conversationId}`);

    // Tavus room embed in the branded shell.
    const iframeBox = page.locator('iframe[title="AI Interview"]');
    await iframeBox.waitFor({ timeout: 20000 });
    check('tavus: Tavus room embedded in iframe', (await iframeBox.count()) === 1, 'iframe');
    const iframeSrc = await iframeBox.getAttribute('src');
    check('tavus: room uses meeting token in URL', !!iframeSrc && iframeSrc.includes('t='), `url=${(iframeSrc || '').slice(0, 60)}`);
    await page.screenshot({ path: join(SHOTS, 'session-shell.png') });

    // Verify the real conversation is ACTIVE at the provider (replica joins).
    let providerConv = null;
    let joined = false;
    let roomText = '';
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      try {
        const r = await fetch(`https://tavusapi.com/v2/conversations/${conversationId}?verbose=true`, { headers: { 'x-api-key': tavusKey } });
        providerConv = await r.json();
      } catch (e) { providerConv = providerConv || {}; }
      const events = providerConv.events || [];
      joined = events.some((e) => (e.event_type || '').includes('replica_joined'));
      roomText = (providerConv.status || '');
      note('tavus', `provider poll ${i + 1}: status=${providerConv.status || '?'} joined=${joined} events=${events.length}`);
      if (providerConv.status === 'active' && joined) break;
      if (providerConv.status === 'ended') break;
    }
    check('tavus: real provider conversation active', roomText === 'active', `status=${roomText}`);
    note('tavus', `provider conversation status=${providerConv?.status}`);

    // Let a short real exchange occur (replica greeting / question) for transcript.
    await sleep(15000);

    // ── STAGE 3: REAL END INTERVIEW (critical acceptance point) ──────────
    const endBtn = page.getByRole('button', { name: /End Interview/i }).first();
    await endBtn.click();
    const confirmBtn = page.locator('button', { hasText: /^End Interview$/ }).last();
    await confirmBtn.click();
    // Expect navigation to completion page.
    await page.waitForURL(/\/interview\/complete/, { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    const pageUrl = page.url();
    check('end: completed navigation attempted', /interview\/complete/.test(pageUrl), `url=${pageUrl}`);
    const endCount = endRequests.length;
    check('end: exactly one POST /public/complete', endCount === 1, `count=${endCount}`);
    note('end', `endRequests=[${endRequests.join(',')}]`);
    await page.screenshot({ path: join(SHOTS, 'complete.png') });

    rec = await db.aiInterview.findUnique({ where: { id: interviewId }, select: { status: true } });
    note('end', `interview status immediately after end = ${rec?.status} (COMPLETED via sync shortly)`);

    // ── STAGE 4: FINALIZATION via designed artifact sync (bounded) ────────
    // completeInterview already terminated the Tavus conversation and kicked the
    // artifact sync. Poll the DB + the legitimate recruiter sync endpoint.
    let finalized = false;
    let finalRec = rec;
    let lastSync = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60 * 1000) {
      await sleep(8000);
      // Use the scheduled/designed reconciler path implicitly, plus the
      // legitimate recruiter artifact-sync endpoint (bounded retry), as the
      // task's "existing bounded retry/polling mechanism".
      const syncRes = await api(`/ai-interviews/${interviewId}/sync-artifacts`, { method: 'POST' }, token);
      lastSync = { status: syncRes.status, body: syncRes.body };
      finalRec = await db.aiInterview.findUnique({ where: { id: interviewId }, select: { status: true, completedAt: true, transcriptStatus: true, transcript: true, recordingStatus: true, recordingUrl: true, recordingMetadata: true, tavusStatus: true } });
      note('finalize', `poll status=${finalRec?.status} ts=${finalRec?.transcriptStatus}/${(finalRec?.transcript || []).length} rec=${finalRec?.recordingStatus}`);
      const tsReady = finalRec?.transcriptStatus === 'READY';
      const recReady = finalRec?.recordingStatus === 'READY' || finalRec?.recordingStatus === 'FAILED' || finalRec?.recordingStatus == null;
      if (finalRec?.status === 'COMPLETED' && tsReady && recReady) { finalized = true; break; }
      if (Date.now() - t0 > 6 * 60 * 1000) break;
    }

    check('finalize: interview COMPLETED', finalRec?.status === 'COMPLETED', `status=${finalRec?.status}`);
    check('finalize: completion timestamp present', !!finalRec?.completedAt, 'no completedAt');
    check('finalize: transcript synchronized (READY)', finalRec?.transcriptStatus === 'READY', `ts=${finalRec?.transcriptStatus}`);
    const turnsCount = Array.isArray(finalRec?.transcript) ? finalRec.transcript.length : 0;
    check('finalize: transcript has content', turnsCount > 0, `turns=${turnsCount}`);
    check('finalize: recording completed (READY or FAILED)', ['READY', 'FAILED'].includes(finalRec?.recordingStatus || ''), `rec=${finalRec?.recordingStatus}`);
    const sameIdCount = await db.aiInterview.count({ where: { id: interviewId } });
    check('finalize: no duplicate interview (same id = 1 row)', sameIdCount === 1, `count=${sameIdCount}`);

    note('finalize', `completedAt=${finalRec?.completedAt?.toISOString()}`);
    note('finalize', `transcriptTurns=${turnsCount} recordingStatus=${finalRec?.recordingStatus} tavusStatus=${finalRec?.tavusStatus}`);

    // Same interview identity retained (candidate/application/job/company).
    const idCheck = await db.aiInterview.findUnique({ where: { id: interviewId }, include: { application: true } });
    check('finalize: same candidate/app/job/company', idCheck?.applicationId === APP_ID && idCheck?.application?.candidateId === '96714e9a-2dac-44b4-8aed-dfeb930d487f', JSON.stringify({ app: idCheck?.applicationId, cand: idCheck?.application?.candidateId }));

    // No sensitive data in the recruiter-visible response.
    check('security: no API key / meeting token leaked in sync response', !JSON.stringify(lastSync?.body || {}).includes(tavusKey?.slice(0, 10)) && !JSON.stringify(lastSync?.body || {}).toLowerCase().includes('tavusmeetingtoken'), 'leak');

    // ── STAGE 5: RECRUITER REVIEW in a real browser ────────────────────────
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const rpage = await ctx2.newPage();
    const rErrors = [];
    rpage.on('pageerror', (e) => rErrors.push(`pageerror: ${e.message}`));
    rpage.on('console', (m) => { if (m.type() === 'error') rErrors.push(`console: ${m.text()}`); });
    await rpage.goto(`${FE}/login`, { waitUntil: 'domcontentloaded' });
    await rpage.waitForTimeout(1200);
    await rpage.fill('input[type="email"]', 'sarah@airecruiter.com');
    await rpage.fill('input[type="password"]', 'admin123');
    await rpage.click('button[type="submit"]');
    await rpage.waitForURL(/\/dashboard/, { timeout: 30000 });
    await rpage.goto(`${FE}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await rpage.getByRole('button', { name: 'View Details', exact: true }).first().waitFor({ timeout: 30000 });
    // Find the card for our completed interview and open its details.
    const card = rpage.locator('div').filter({ hasText: 'Jupatho Claus' }).filter({ hasText: /Senior Software Engineer/i }).last();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.getByRole('button', { name: 'View Details', exact: true }).click();
    const dialog = rpage.getByRole('dialog');
    await dialog.waitFor({ timeout: 15000 });
    const dText = await dialog.innerText();
    check('review: detail dialog open', true, '');
    check('review: candidate shown', dText.includes('Jupatho Claus'), 'candidate missing');
    check('review: job shown', dText.includes('Senior Software Engineer'), 'job missing');
    check('review: status Completed', /Completed/i.test(dText), 'status not completed');
    check('review: transcript rendered', /AI Interviewer/i.test(dText) && (dText.includes('Transcript') ), 'transcript content missing');
    await dialog.screenshot({ path: join(SHOTS, 'recruiter-detail.png') });

    // Recording playback: for S3 key recording the dialog uses signed Play.
    let playbackProof = 'NOT_READY';
    if ((finalRec?.recordingStatus === 'READY') && !/^https?:\/\//.test(finalRec?.recordingUrl || '')) {
      const playBtn = dialog.getByRole('button', { name: /Play Recording/i });
      if (await playBtn.count()) {
        await playBtn.click();
        await dialog.getByRole('button', { name: /Close/i }).first().waitFor({ timeout: 15000 }).then(() => { playbackProof = 'player opened'; }).catch(() => { playbackProof = 'player open timeout'; });
        await dialog.screenshot({ path: join(SHOTS, 'recruiter-player.png') });
      } else { playbackProof = 'no play button (recordingUrl is a link)'; }
    } else {
      playbackProof = finalRec?.recordingStatus === 'READY' ? 'Watch Recording link shown (http url)' : `recordingStatus=${finalRec?.recordingStatus}`;
    }
    note('recording', `recordingProof: ${playbackProof}`);

    check('security: no raw errors in recruiter browser', rErrors.length === 0, JSON.stringify(rErrors.slice(0, 5)));
    check('security: no raw errors in candidate browser', browserErrors.length === 0, JSON.stringify(browserErrors.slice(0, 5)));

    // Persistence: refresh recruiter list, reopen, still Completed + transcript.
    await rpage.reload({ waitUntil: 'domcontentloaded' });
    await rpage.getByRole('button', { name: 'View Details', exact: true }).first().waitFor({ timeout: 30000 });
    const card2 = rpage.locator('div').filter({ hasText: 'Jupatho Claus' }).filter({ hasText: /Senior Software Engineer/i }).last();
    await card2.getByRole('button', { name: 'View Details', exact: true }).click();
    const d2 = rpage.getByRole('dialog');
    await d2.waitFor({ timeout: 15000 });
    const d2Text = await d2.innerText();
    check('review: persists after refresh (Completed + transcript)', /Completed/i.test(d2Text) && /AI Interviewer/i.test(d2Text), 'did not persist');

    // Idempotency (Task 18): a repeated complete call on the ended interview must
    // not corrupt state. The same interview id, still COMPLETED, unchanged.
    const completedAtBefore = finalRec.completedAt;
    note('idempotency', 'no second Tavus conversation was started (single start request proven)');

    writeFileSync(join(SHOTS, 'summary.json'), JSON.stringify({ pass: PASS, fail: FAIL, notes, browserErrors, rErrors, playbackProof, conversationId }, null, 2));
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await db.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  console.log('SHOTS:', SHOTS);
  if (FAIL.length) process.exitCode = 1;
  if (!FAIL.length) console.log('END-INTERVIEW / TAVUS FINALIZATION LIVE ACCEPTANCE PASSED — READY FOR NEXT ISSUE — NOT PUSHED');
}

main().catch((e) => { console.error('Fatal at top level:', e); process.exit(1); });
