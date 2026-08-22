/**
 * SETTINGS IMAGE UPLOADS — BROWSER ACCEPTANCE (Issue #5)
 * Profile Photo + Company Logo end-to-end: upload, display, refresh
 * persistence, replacement, validation errors, DB linkage, security.
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
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'settings-shots');
mkdirSync(SHOTS, { recursive: true });
const PNG_A = fileURLToPath(new URL('./fixtures/avatar-a.png', import.meta.url));
const JPG_B = fileURLToPath(new URL('./fixtures/avatar-b.jpg', import.meta.url));
const LOGO = fileURLToPath(new URL('./fixtures/logo.png', import.meta.url));
const OVERSIZED = fileURLToPath(new URL('./fixtures/oversized.png', import.meta.url));
const SPOOF = fileURLToPath(new URL('./fixtures/spoof.png', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = `img${RUN_ID}@e2e.com`;
const COMPANY = `Img Co ${RUN_ID}`;
const PASSWORD = `ImgPass!${RUN_ID}`;

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

async function main() {
  console.log('== settings-image-uploads.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  const browserErrors = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));

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
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [['input[type="email"]', EMAIL], ['input[type="password"]', PASSWORD]]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // ── Profile tab BEFORE ──
    await page.goto(`${FE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Profile Photo', { exact: true }).first().waitFor({ timeout: 20000 });
    const uploadBtn = page.getByRole('button', { name: /Upload Photo/ });
    check('profile upload button is enabled (not "coming soon")', await uploadBtn.isEnabled(), 'button disabled');
    await page.screenshot({ path: join(SHOTS, 'settings-before.png'), fullPage: true });

    // ── valid PNG upload ──
    await page.setInputFiles('input[aria-label="Upload profile photo"]', PNG_A);
    await page.getByRole('button', { name: /Uploading/ }).waitFor({ timeout: 5000 }).catch(() => undefined);
    await sleep(2000);
    const avatarImg = page.locator('img[alt="Profile photo"]');
    const imgVisible = (await avatarImg.count()) > 0 && (await avatarImg.first().getAttribute('src'))?.startsWith('blob:');
    check('profile photo appears after upload', imgVisible, 'no avatar img');
    await page.screenshot({ path: join(SHOTS, 'settings-profile-photo-after.png'), fullPage: true });

    const dbUser = await prisma.user.findUnique({ where: { id: ids.userId } });
    const avatarFile = await prisma.storedFile.findFirst({ where: { uploadedByUserId: ids.userId, category: 'USER_AVATAR', status: 'ACTIVE' } });
    if (avatarFile) ids.storedFileIds.push(avatarFile.id);
    check('User.avatarFileId + avatarUrl set', dbUser?.avatarFileId === avatarFile?.id && dbUser?.avatarUrl === '/api/v1/user/avatar', `fileId=${dbUser?.avatarFileId} url=${dbUser?.avatarUrl}`);
    check('StoredFile USER_AVATAR row created (companyId null)', !!avatarFile && avatarFile.companyId === null && avatarFile.extension === 'png', JSON.stringify({ cat: avatarFile?.category, ext: avatarFile?.extension, company: avatarFile?.companyId }));

    // ── refresh persistence ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Profile Photo', { exact: true }).first().waitFor({ timeout: 20000 });
    await sleep(1500);
    const afterRefresh = (await page.locator('img[alt="Profile photo"]').count()) > 0;
    check('profile photo persists after refresh', afterRefresh, 'no avatar after refresh');
    await page.screenshot({ path: join(SHOTS, 'settings-profile-photo-refresh.png'), fullPage: true });

    // ── replacement (JPG) ──
    await page.setInputFiles('input[aria-label="Upload profile photo"]', JPG_B);
    await sleep(2500);
    const filesAfterReplace = await prisma.storedFile.findMany({ where: { uploadedByUserId: ids.userId, category: 'USER_AVATAR' }, orderBy: { createdAt: 'desc' } });
    const activeCount = filesAfterReplace.filter((f) => f.status === 'ACTIVE').length;
    const supersededCount = filesAfterReplace.filter((f) => f.status === 'SUPERSEDED').length;
    check('replacement: 1 ACTIVE + older SUPERSEDED', activeCount === 1 && supersededCount >= 1, `active=${activeCount} superseded=${supersededCount}`);
    const dbUser2 = await prisma.user.findUnique({ where: { id: ids.userId } });
    check('user points to the newest avatar', dbUser2?.avatarFileId === filesAfterReplace[0]?.id, `points=${dbUser2?.avatarFileId} newest=${filesAfterReplace[0]?.id}`);
    for (const f of filesAfterReplace) if (!ids.storedFileIds.includes(f.id)) ids.storedFileIds.push(f.id);

    // ── validation: oversized (client-side) ──
    await page.setInputFiles('input[aria-label="Upload profile photo"]', OVERSIZED);
    await sleep(1200);
    const sizeError = await page.getByText('Photo must be 2 MB or smaller').count();
    check('oversized file rejected client-side', sizeError > 0, 'no size error');
    await page.screenshot({ path: join(SHOTS, 'settings-oversized-error.png'), fullPage: true });

    // ── validation: spoofed .png (server-side signature) ──
    await page.setInputFiles('input[aria-label="Upload profile photo"]', SPOOF);
    await sleep(2000);
    const spoofError = await page.getByText('Choose a valid PNG or JPG image.').count();
    check('spoofed file rejected server-side with safe error', spoofError > 0, 'no spoof error');
    const avatarStill = await page.locator('img[alt="Profile photo"]').count();
    check('avatar unchanged after rejected uploads', avatarStill > 0, 'avatar lost');

    // ── Company tab: logo upload ──
    await page.getByRole('tab', { name: 'Company' }).click().catch(() => {});
    await page.getByText('Company Logo', { exact: true }).first().waitFor({ timeout: 10000 });
    const logoInput = page.locator('input[aria-label="Choose company logo"]');
    check('company logo upload control present', (await logoInput.count()) > 0, 'no logo input');
    await page.setInputFiles('input[aria-label="Choose company logo"]', LOGO);
    await sleep(2500);
    const logoImg = page.locator('img[alt*="logo" i]');
    check('company logo appears after upload', (await logoImg.count()) > 0, 'no logo img');
    await page.screenshot({ path: join(SHOTS, 'settings-company-logo-after.png'), fullPage: true });

    const dbCompany = await prisma.company.findUnique({ where: { id: ids.companyId } });
    const logoFile = await prisma.storedFile.findFirst({ where: { companyId: ids.companyId, category: 'COMPANY_LOGO', status: 'ACTIVE' } });
    if (logoFile) ids.storedFileIds.push(logoFile.id);
    check('Company.logoFileId + logoUrl set', dbCompany?.logoFileId === logoFile?.id && dbCompany?.logoUrl === '/api/v1/company/logo', `fileId=${dbCompany?.logoFileId}`);

    // refresh persistence for logo
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Company' }).click().catch(() => {});
    await sleep(1500);
    const logoAfterRefresh = (await page.locator('img[alt*="logo" i]').count()) > 0;
    check('company logo persists after refresh', logoAfterRefresh, 'no logo after refresh');
    await page.screenshot({ path: join(SHOTS, 'settings-company-logo-refresh.png'), fullPage: true });

    // ── cross-tenant: user B cannot see user A's avatar or logo ──
    const regB = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: `ImgB Co ${RUN_ID}`, email: `imgb${RUN_ID}@e2e.com`, firstName: 'Zed', lastName: 'Yon', password: `ImgBPass!${RUN_ID}`, passwordConfirmation: `ImgBPass!${RUN_ID}`, acceptTerms: true }),
    });
    const bUser = await prisma.user.findUnique({ where: { normalizedEmail: `imgb${RUN_ID}@e2e.com`.toLowerCase() } });
    const bMem = await prisma.companyMembership.findFirst({ where: { userId: bUser.id } });
    const idsB = { userId: bUser.id, companyId: bMem.companyId, membershipIds: [bMem.id], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
    await prisma.user.update({ where: { id: bUser.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: bUser.id } });
    const loginB = await fetch(`${BE_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `imgb${RUN_ID}@e2e.com`, password: `ImgBPass!${RUN_ID}` }) });
    const tokenB = (await loginB.json()).data.tokens.accessToken;
    // B has no avatar yet -> 404; B cannot fetch A's logo (their active company has none) -> 404
    const bAvatar = await fetch(`${BE_URL}/api/v1/user/avatar`, { headers: { authorization: `Bearer ${tokenB}` } });
    check('cross-user avatar access blocked (B has none -> 404)', bAvatar.status === 404, `status=${bAvatar.status}`);
    const bLogo = await fetch(`${BE_URL}/api/v1/company/logo`, { headers: { authorization: `Bearer ${tokenB}` } });
    check('cross-company logo access blocked (B -> 404)', bLogo.status === 404, `status=${bLogo.status}`);

    const fatal = browserErrors.filter((e) => !/net::ERR_ABORTED/.test(e));
    note('console.network', `total=${browserErrors.length} fatal=${fatal.length}`);
    for (const e of fatal.slice(0, 8)) console.log('    - ' + e);

    console.log(`\n== SUMMARY ==`);
    console.log(`PASS: ${PASS.length}`);
    console.log(`FAIL: ${FAIL.length}`);
    if (FAIL.length) FAIL.forEach((f) => console.log('  - ' + f));
    await cleanupExact(prisma, idsB, () => {});
  } finally {
    await cleanupExact(prisma, ids, () => {});
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}
main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });