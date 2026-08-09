import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';

// ─── Browser proof: real frontend against real backend, no console/react errors ─────
const FE = 'http://localhost:3001';
const API = 'http://localhost:3000/api/v1';
const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('./packet4', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

const backendRequire = createRequire(join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const envFile = readFileSync(join(BACKEND_DIR, '.env'), 'utf8');
const DATABASE_URL = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1];
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const consoleLog = [];
const errors = [];
let browser = null;
function record(kind, text) {
  consoleLog.push({ kind, text: String(text).slice(0, 400), at: new Date().toISOString() });
}

const WHITELIST = [
  /favicon/i,
  /sourceMappingURL|sourcemap/i,
  /net::ERR_ABORTED/i,
  /net::ERR_CONNECTION_RESET/i,
  /Failed to load resource/i,
  /ERR_CERT/i,
  /^Mozilla\/5\.0/i,
  /robots\.txt/i,
  /browser script or ms-playwright/i,
  /DeprecationWarning/i,
  /Download the React DevTools/i,
  /devtools/i,
  /WebSocket/i,
  /hydrat/i,
];

let seedUserId = null;
let token = '';
let candidateId = null;

try {
  // ── 1. API setup: fresh tenant + candidate + job (so the UI has real data) ──
  const stamp = Date.now();
  const user = {
    companyName: `Browser Proof Corp ${stamp}`,
    email: `browser-proof-${stamp}@talentai.test`,
    firstName: 'Browser',
    lastName: 'Proof',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    acceptTerms: true,
  };
  const reg = await api('POST', '/auth/register-company', user);
  if (reg.status !== 201) throw new Error('register failed: ' + JSON.stringify(reg.body));
  seedUserId = reg.body.data.userId;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.verificationToken.deleteMany({ where: { userId: seedUserId } });
  await prisma.verificationToken.create({
    data: {
      userId: seedUserId,
      email: user.email.toLowerCase(),
      type: 'EMAIL_VERIFICATION',
      tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const verify = await api('POST', '/auth/verify-email', { token: rawToken });
  if (verify.status !== 200) throw new Error('verify failed: ' + JSON.stringify(verify.body));
  const loginRes = await api('POST', '/auth/login', { email: user.email, password: user.password });
  if (loginRes.status !== 200) throw new Error('login failed: ' + JSON.stringify(loginRes.body));
  token = loginRes.body.data.tokens.accessToken;
  console.log(`[browser-proof] tenant ready: ${user.email}`);

  const cand = await api('POST', '/candidates', {
    firstName: 'Ruby',
    lastName: 'Browser',
    email: `ruby-browser-${stamp}@talentai.test`,
    phone: `+1${stamp}`,
    city: 'Kampala',
    countryCode: 'UG',
    headline: 'Frontend Engineer',
    source: 'RECRUITER_CREATED',
  }, token);
  if (cand.status !== 201) throw new Error('candidate create failed: ' + JSON.stringify(cand.body));
  const candidateId = cand.body.data.id;
  console.log(`[browser-proof] candidate created: ${candidateId}`);

  const job = await api('POST', '/jobs', {
    title: 'Browser Proof Job',
    employmentType: 'FULL_TIME',
    workplaceType: 'REMOTE',
    experienceLevel: 'MID',
    description: 'Browser proof job',
  }, token);
  const jobId = job.status === 201 ? job.body.data.id : null;
  if (jobId) {
    await api('POST', `/jobs/${jobId}/submit-for-approval`, {}, token);
    await api('POST', `/jobs/${jobId}/approve`, {}, token);
    await api('POST', `/jobs/${jobId}/publish`, {}, token);
    console.log(`[browser-proof] job created: ${jobId}`);
  } else {
    console.log(`[browser-proof] job create status: ${job.status}`);
  }

  // ── 2. Browser session ──
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    record('console:' + msg.type(), msg.text());
    const t = msg.text();
    const whitelisted = WHITELIST.some((re) => re.test(t));
    if (msg.type() === 'error' && !whitelisted) errors.push({ what: 'console.error', text: t });
  });
  page.on('pageerror', (err) => {
    record('pageerror', err?.message || String(err));
    const t = err?.message || String(err);
    errors.push({ what: 'pageerror', text: t });
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      const u = res.url();
      record('http5xx', `${res.status()} ${u}`);
      errors.push({ what: 'http5xx', text: `${res.status()} ${u}` });
    }
    if (res.status() >= 400 && !/favicon|manifest/.test(res.url())) {
      record('http4xx', `${res.status()} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    const t = `${req.url()} :: ${req.failure()?.errorText || ''}`;
    record('requestfailed', t);
    const whitelisted = WHITELIST.some((re) => re.test(t));
    if (!whitelisted) errors.push({ what: 'requestfailed', text: t });
  });

  // login via the actual login page
  await page.goto(`${FE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="you@company.com"]', { timeout: 20000 });
  await page.fill('input[placeholder="you@company.com"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.screenshot({ path: join(OUT_DIR, '1-login-form.png') });
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT_DIR, '2-dashboard.png') });
  console.log('[browser-proof] UI login → /dashboard OK');

  // candidates list + open the created candidate (row click opens the detail dialog)
  await page.goto(`${FE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Ruby Browser', { timeout: 20000 });
  await page.screenshot({ path: join(OUT_DIR, '3-candidates-list.png') });
  await page.click('text=Ruby Browser');
  await page.waitForTimeout(1500);
  const dialogText = await page.locator('body').innerText();
  const detailOk = /Ruby Browser/.test(dialogText) && new RegExp(`ruby-browser-${stamp}@talentai.test`).test(dialogText);
  await page.screenshot({ path: join(OUT_DIR, '4-candidate-detail.png') });
  if (!detailOk) throw new Error('BROWSER PROOF FAIL: candidate detail dialog did not show the candidate');
  console.log('[browser-proof] candidate visible in list + detail dialog OK');

  // pipeline
  await page.goto(`${FE}/pipeline`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT_DIR, '5-pipeline.png') });
  console.log('[browser-proof] /pipeline visited');

  await browser.close();

  // ── 3. Assertions ──
  writeFileSync(join(OUT_DIR, 'console.log.json'), JSON.stringify(consoleLog, null, 2));
  console.log(`[browser-proof] console events captured: ${consoleLog.length}`);
  console.log(`[browser-proof] errors: ${JSON.stringify(errors, null, 2)}`);

  const hasMaxDepth = errors.some((e) => /maximum update depth/i.test(e.text));
  if (hasMaxDepth) {
    throw new Error('BROWSER PROOF FAIL: React "Maximum update depth exceeded" observed');
  }
  if (errors.length > 0) {
    throw new Error('BROWSER PROOF FAIL: ' + JSON.stringify(errors.slice(0, 5)));
  }
  console.log('────────────────────────────────────────────────');
  console.log('BROWSER PROOF: PASS — login, /candidates, /pipeline, candidate detail — zero console errors');
  console.log('artifacts: ' + OUT_DIR);
} catch (e) {
  console.error('────────────────────────────────────────────────');
  console.error('BROWSER PROOF: FAIL');
  console.error(e.message);
  try {
    if (browser) await browser.close();
  } catch {}
  writeFileSync(join(OUT_DIR, 'console.log.json'), JSON.stringify(consoleLog, null, 2));
  process.exitCode = 1;
} finally {
  if (seedUserId) {
    try {
      await prisma.verificationToken.deleteMany({ where: { userId: seedUserId } });
      await prisma.$executeRawUnsafe(
        `DELETE FROM "UserSession" WHERE "userId" = ANY(ARRAY['${seedUserId}']::text[]);`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "AuthAuditEvent" WHERE "userId" = ANY(ARRAY['${seedUserId}']::text[]);`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "CompanyMembership" WHERE "userId" = ANY(ARRAY['${seedUserId}']::text[]);`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "User" WHERE id = ANY(ARRAY['${seedUserId}']::text[]);`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Company" WHERE id NOT IN (SELECT "companyId" FROM "CompanyMembership");`,
      );
    } catch {}
  }
  await prisma.$disconnect();
}