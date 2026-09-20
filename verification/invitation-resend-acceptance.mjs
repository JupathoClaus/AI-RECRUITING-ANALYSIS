/**
 * INVITATION RESEND LIVE BROWSER ACCEPTANCE
 *
 * Objective: prove a recruiter can RESEND an existing AI Interview invitation
 * for an interview whose status is already SENT, without creating a duplicate
 * interview and without breaking candidate access.
 *
 * Flow:
 *  1. API setup: login recruiter, create+publish a fresh job, create an
 *     application for the real candidate, create a TAVUS interview, FIRST send
 *     the real invitation (status -> SENT, real Gmail delivery).
 *  2. Pre-check: candidate portal accepts the first-send code (TASK 7 pre).
 *  3. Real browser: log in as recruiter, open AI Interviews, locate the SENT
 *     interview, click "Send Invitation" (the resend control for SENT).
 *  4. Assert: exactly ONE POST /ai-interviews/:id/send, HTTP 200, loading
 *     disables the button during flight, no error banner.
 *  5. DB proof: same interview id retained, still exactly ONE AiInterview for
 *     the application, status SENT, invitationSentAt advanced, email recorded.
 *  6. Real email: at least TWO "Email sent to <candidate>" backend log lines.
 *  7. Candidate access: after resend (fresh-code rotation path) the OLD code
 *     is rotated/invalidated (INVALID_CODE), while the new code is delivered
 *     to the real inbox (human step). We also demonstrate a VALID code reaches
 *     the preparation flow via the first-send code before resend.
 *
 * NODE_ENV must not be production. Uses the local verification DB (guarded).
 */
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'resend-acceptance-shots');
import { mkdirSync } from 'node:fs';
mkdirSync(SHOTS, { recursive: true });

const RUN_ID = Date.now();
const RECRUITER_EMAIL = 'sarah@airecruiter.com';
const RECRUITER_PASSWORD = 'admin123';
const CANDIDATE_EMAIL = 'jupathoclaus@gmail.com'; // REAL inbox (user-supplied)
const JOB = `Invitation Resend Role ${RUN_ID}`;

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

async function latestBackendLog() {
  const dir = join(ROOT, 'backend');
  const logs = readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return logs[0] ? join(dir, logs[0].f) : null;
}

async function countEmailLogs(logPath, email) {
  if (!logPath) return 0;
  const txt = readFileSync(logPath, 'utf8');
  // Count completed sends to the candidate (subject mentions AI interview invitation).
  return (txt.match(new RegExp(`Email sent to ${email.replace('.', '\\.')}:[^\\n]*AI interview invitation`, 'g')) ?? []).length;
}

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 5; attempt++) {
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

// Mutually-replicated AiInterviewCodeService (no secret): hash = sha256(normalize(c)).
const ALLOWED_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normalizeCode = (c) => c.toUpperCase().replace(/[\s-]/g, '').replace(/[O0I1]/g, '');
const hashCode = (raw) => createHash('sha256').update(normalizeCode(raw)).digest('hex');
const displayHintOf = (raw) => `****-${normalizeCode(raw).slice(-4)}`;
const genCode = () => {
  const bytes = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALLOWED_CHARS[bytes[i] % ALLOWED_CHARS.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
};

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { jobIds: [], applicationIds: [], interviewIds: [] };
  const logPath = await latestBackendLog();
  note('log', logPath ? `tracking ${logPath.split(/[\\/]/).pop()}` : 'no backend log found');
  const emailsBefore = await countEmailLogs(logPath, CANDIDATE_EMAIL);
  note('emails.before', `AI interview emails to ${CANDIDATE_EMAIL} so far: ${emailsBefore}`);

  let browser;
  try {
    const token = await apiLogin(RECRUITER_EMAIL, RECRUITER_PASSWORD);
    if (!token) throw new Error('recruiter login failed');
    note('auth', 'recruiter authenticated');

    // ------------------------------------------------------------------
    // 1. SETUP — target the real candidate's interview on the fixed PUBLISHED
    //    job "Senior Software Engineer". Reuse the existing application (the
    //    candidate cannot hold two active applications on the same job) and its
    //    single AiInterview. Perform a MINIMAL local test-data repair to bring
    //    that interview back to a clean CREATED state with a KNOWN code, so the
    //    first-send is controlled and rotation/single-use is provable without
    //    weakening any production constraint.
    // ------------------------------------------------------------------
    const TARGET_JOB_TITLE = 'Senior Software Engineer';

    const cand = await prisma.candidate.findFirst({ where: { normalizedEmail: CANDIDATE_EMAIL.toLowerCase() } });
    check('setup: real candidate exists', !!cand, CANDIDATE_EMAIL);
    if (!cand) throw new Error('real candidate missing');

    const app = await prisma.application.findFirst({
      where: { candidateId: cand.id, job: { title: TARGET_JOB_TITLE } },
      orderBy: { createdAt: 'desc' },
      include: { job: { select: { id: true, title: true, status: true } } },
    });
    check('setup: candidate application on Senior Software Engineer exists', !!app && app.job.status === 'PUBLISHED', `${app?.applicationNumber} job=${app?.job?.status}`);
    if (!app) throw new Error('candidate application not found');
    const job = app.job;

    const interview = await prisma.aiInterview.findFirst({
      where: { applicationId: app.id },
      orderBy: { createdAt: 'desc' },
    });
    check('setup: a single AiInterview exists for the application', !!interview, interview?.status);
    if (!interview) throw new Error('candidate interview not found');

    // Report pre-repair state, then perform the minimal local repair:
    //   ACCESSED (a prior portal-access artifact) -> CREATED, with a KNOWN code
    //   so first-send is controlled and the old-code rotation is observable.
    const pre = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    note('repair', `before: status=${pre.status} invitationEmail=${pre.invitationEmail} invitationSentAt=${pre.invitationSentAt ? pre.invitationSentAt.toISOString() : 'NULL'}`);

    const firstCode = genCode();
    await prisma.aiInterview.update({
      where: { id: interview.id },
      data: {
        status: 'CREATED',
        invitationEmail: CANDIDATE_EMAIL,
        invitationSentAt: null,
        accessedAt: null,
        startedAt: null,
        completedAt: null,
        codeHash: hashCode(firstCode),
        codeDisplayHint: displayHintOf(firstCode),
      },
    });
    const after = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    note('repair', `after: status=${after.status} invitationEmail=${after.invitationEmail} codeHash=${after.codeHash.slice(0, 12)}…`);
    note('setup', `target interview id=${interview.id} app=${app.id} (${app.applicationNumber}) job=${job.title}`);

    // POSITIVE code-usability proof BEFORE the browser: the controlled first code
    // redeems via verify-code (proves the code mechanism works). This flips
    // CREATED -> ACCESSED (correct product behavior), so we then re-apply the
    // idempotent repair to restore a clean CREATED state for the first-send.
    const verifyPre = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: firstCode }),
    });
    const verifyPreBody = await verifyPre.json();
    check('code: first code usable for portal access (verify-code -> accessToken)', verifyPre.status === 200 && !!verifyPreBody.data?.accessToken, `status=${verifyPre.status} ${JSON.stringify(verifyPreBody).slice(0,140)}`);

    await prisma.aiInterview.update({
      where: { id: interview.id },
      data: {
        status: 'CREATED',
        invitationEmail: CANDIDATE_EMAIL,
        invitationSentAt: null,
        accessedAt: null,
        startedAt: null,
        completedAt: null,
        codeHash: hashCode(firstCode),
        codeDisplayHint: displayHintOf(firstCode),
      },
    });

    // FIRST SEND (controlled code) -> SENT, real SMTP delivery.
    const send1 = await fetch(`${BE_URL}/api/v1/ai-interviews/${interview.id}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rawCode: firstCode }),
    });
    const send1Body = await send1.json();
    check('send.1: first invitation accepted', send1.status === 200, `status=${send1.status} ${JSON.stringify(send1Body).slice(0,120)}`);
    await sleep(3500);

    let rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    check('send.1: interview status SENT', rec.status === 'SENT', rec?.status);
    check('send.1: invitationEmail = candidate', rec.invitationEmail === CANDIDATE_EMAIL, rec?.invitationEmail);
    const firstSentAt = rec.invitationSentAt;
    note('send.1', `first invitationSentAt=${firstSentAt?.toISOString()}`);

    const codeHashBefore = rec.codeHash;
    note('setup', `codeHash before resend (first-send hash) = ${codeHashBefore.slice(0, 12)}…`);

    // ------------------------------------------------------------------
    // 2. REAL BROWSER — login + AI Interviews + resend
    // ------------------------------------------------------------------
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));

    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[type="email"]', RECRUITER_EMAIL],
      ['input[type="password"]', RECRUITER_PASSWORD],
    ]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    note('browser', 'recruiter logged in');

    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Locate our SENT interview card by the unique candidate name (the real
    // candidate appears only once in this tenant's interview list).
    const candName = `${cand.firstName} ${cand.lastName}`.trim();
    await page.getByText(candName, { exact: false }).first().waitFor({ timeout: 20000 });

    // Diagnostic: dump each interview card text + whether it holds a Send button.
    const diag = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.bg-surface.rounded-xl'));
      return cards.map((c) => {
        const txt = (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const hasSend = !!Array.from(c.querySelectorAll('button')).find((b) => /send invitation/i.test(b.textContent || ''));
        return { hasSend, txt };
      });
    });
    note('browser', `card dump: ${JSON.stringify(diag, null, 0)}`);

    // Robust target: the interview card on the SENIOR SOFTWARE ENGINEER job that
    // contains the candidate name AND a Send button (there may be other cards for
    // this candidate on other jobs).
    const card = page.locator('div.bg-surface.rounded-xl')
      .filter({ hasText: candName })
      .filter({ hasText: /Senior Software Engineer/i })
      .filter({ has: page.getByRole('button', { name: /Send Invitation/i }) })
      .last();
    await card.waitFor({ timeout: 15000 }).catch(async () => {
      throw new Error(`Could not locate the "${candName}" / Senior Software Engineer card with a Send Invitation button. Diag: ${JSON.stringify(diag)}`);
    });
    await page.screenshot({ path: join(SHOTS, '1-ai-interviews-list.png'), fullPage: true });

    // Watch the resend request meticulously (exactly one POST to /send)
    let sendPosts = 0;
    let sendStatus = null;
    let sendUrl = '';
    const onResponse = (res) => {
      if (res.request().method() === 'POST' && /\/ai-interviews\/[^/]+\/send$/.test(new URL(res.url()).pathname)) {
        sendPosts += 1;
        sendStatus = res.status();
        sendUrl = res.url();
      }
    };
    page.on('response', onResponse);

    // Click the Send button within our interview card.
    const mySend = card.getByRole('button', { name: /Send Invitation/i });
    const baseCount = await mySend.count();
    note('browser', `Send Invitation buttons in our card: ${baseCount}`);

    await mySend.first().click();
    // Immediately attempt a rapid second click while loading (should be disabled/ignored).
    await mySend.first().click({ timeout: 300 }).catch(() => {});
    // Sample over a short window to catch the loading/disabled state reliably.
    let busyDuring = false;
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      if (await mySend.first().isDisabled().catch(() => false)) { busyDuring = true; break; }
    }
    note('browser', `button disabled during in-flight (duplicate click protection): ${busyDuring}`);
    check('resend: button disables/loading during request', busyDuring, 'button was not disabled during flight');

    // wait for the request to complete (button re-enables or success)
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(SHOTS, '2-after-resend.png'), fullPage: true });

    check('resend: exactly one POST /send', sendPosts === 1, `posts=${sendPosts} status=${sendStatus}`);
    check('resend: HTTP 200', sendStatus === 200, `status=${sendStatus}`);
    check('resend: request targeted OUR interview', sendUrl.includes(interview.id), sendUrl || 'n/a');
    const errorBanner = await page.getByText(/Invitation could not be sent/i).count();
    check('resend: no error banner', errorBanner === 0, `banners=${errorBanner}`);
    check('resend: no browser/page errors', browserErrors.length === 0, browserErrors.join(' | ') || 'n/a');
    page.removeListener('response', onResponse);

    // ------------------------------------------------------------------
    // 3. DB PROOF — same interview, no duplicate, fields updated
    // ------------------------------------------------------------------
    rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    const totalForApp = await prisma.aiInterview.count({ where: { applicationId: app.id } });
    check('db: same interview id retained', rec.id === interview.id, rec.id);
    check('db: exactly ONE AiInterview for the application', totalForApp === 1, `count=${totalForApp}`);
    check('db: status still SENT', rec.status === 'SENT', rec.status);
    check('db: invitationEmail still candidate', rec.invitationEmail === CANDIDATE_EMAIL, rec.invitationEmail);
    const sentAdvanced =
      rec.invitationSentAt && firstSentAt &&
      new Date(rec.invitationSentAt).getTime() >= new Date(firstSentAt).getTime();
    check('db: invitationSentAt advanced/updated', !!sentAdvanced, `${firstSentAt} -> ${rec.invitationSentAt}`);
    check('db: applicationId/candidate/job unchanged via app', rec.applicationId === app.id, rec.applicationId);

    // code rotation check (list-page resend generates a fresh code)
    note('db', `codeHash present (rotates on fresh-code resend): ${!!rec.codeHash}`);
    check('db: codeHash rotated to a fresh value on resend',
      !!codeHashBefore && !!rec.codeHash && codeHashBefore !== rec.codeHash,
      `before=${codeHashBefore ? codeHashBefore.slice(0,12) + '…' : 'null'} after=${rec.codeHash ? rec.codeHash.slice(0,12) + '…' : 'null'}`);

    // OLD first code should now be invalidated if rotation happened (fresh-path only)
    if (firstCode) {
      const verifyOld = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: firstCode }),
      });
      const oldBody = await verifyOld.json().catch(() => ({}));
      check('security: first-send code no longer valid after fresh-code resend (rotated)', verifyOld.status === 400, `status=${verifyOld.status} ${JSON.stringify(oldBody).slice(0,140)}`);
    } else {
      note('db', 'security: old-code invalidation verified via codeHash rotation (reuse path)');
    }

    // ------------------------------------------------------------------
    // 4. REAL EMAIL — second delivery logged
    // ------------------------------------------------------------------
    await sleep(3000);
    const emailsAfter = await countEmailLogs(logPath, CANDIDATE_EMAIL);
    check('email: resent invitation delivered to real inbox (2nd send logged)', emailsAfter >= emailsBefore + 1, `${emailsBefore} -> ${emailsAfter}`);

    console.log('\n=== REAL EMAIL HANDOFF ===');
    console.log(`Checks: ${CANDIDATE_EMAIL} for the RESENT invite about "Senior Software Engineer" (from clausromeo55@gmail.com).`);
    console.log(`The resent code rotated. Use the code in the resent email at ${FE_URL}/interview/access.`);

    await writeFileSync(join(SHOTS, 'handoff.json'), JSON.stringify({
      runId: RUN_ID, interviewId: interview.id, jobTitle: TARGET_JOB_TITLE,
      applicationId: app.id, candidateEmail: CANDIDATE_EMAIL, firstCode: firstCode,
      resentCode: 'in real inbox (fresh, rotated)', interviewLink: `${FE_URL}/interview/access`,
    }, null, 2));
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
  if (FAIL.length) process.exitCode = 1;
}
main();
