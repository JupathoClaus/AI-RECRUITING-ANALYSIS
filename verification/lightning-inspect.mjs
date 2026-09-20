/**
 * LIGHTNING INSPECT (Phase 3)
 * Drive the user's own authenticated lightning.ai web session (Chrome Profile 2 copy)
 * to inspect: logged-in account, workspace, existing Studios, GPU entitlements.
 * Read-only inspection only. NO creation, NO deployment.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORK = join(process.env.TEMP ?? '/tmp', 'opencode', 'lightning-profile');
const REAL_PROFILE = 'C:\\Users\\claus\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2';
const REAL_USER_DATA = 'C:\\Users\\claus\\AppData\\Local\\Google\\Chrome\\User Data';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Copy profile quickly, excluding heavy caches (auth lives in Network/ + profile root).
const EXCLUDE = new Set(['Cache', 'Code Cache', 'GPUCache', 'CacheStorage', 'CodeCache', 'Service Worker', 'GrShaderCache', 'ShaderCache', 'DawnCache', 'component_crx_cache']);

function copyTree(src, dst) {
  for (const name of readdirSync(src)) {
    if (EXCLUDE.has(name)) continue;
    const s = join(src, name);
    const d = join(dst, name);
    const st = statSync(s);
    if (st.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else if (name === 'Local State' || /^(Cookies|Login Data|Preferences|Secure Preferences|Network|Web Data|History)$/i.test(name) || name === 'Local State' || name === 'Sunflower') {
      copyFileSync(s, d);
    } else if (/^((?!\.ldb|\.log$).)*$/i.test(name) && st.size < 2 * 1024 * 1024) {
      // copy only small non-db files to keep it lean
      copyFileSync(s, d);
    }
  }
}

// Minimal profile: Local State (for key) + Profile 2 with Network/Cookies + Preferences.
function buildProfile() {
  const userData = join(WORK, 'User Data');
  const profile = join(userData, 'Profile 2');
  mkdirSync(profile, { recursive: true });
  // Local State at User Data root (holds encryption key config)
  if (existsSync(join(REAL_USER_DATA, 'Local State'))) copyFileSync(join(REAL_USER_DATA, 'Local State'), join(userData, 'Local State'));
  // Network dir (Cookies live here in modern Chrome)
  const netSrc = join(REAL_PROFILE, 'Network');
  if (existsSync(netSrc)) copyTree(netSrc, join(profile, 'Network'));
  // Profile root essentials
  for (const f of ['Preferences', 'Secure Preferences', 'Login Data', 'Web Data']) {
    const s = join(REAL_PROFILE, f);
    if (existsSync(s)) copyFileSync(s, join(profile, f));
  }
  return userData;
}

async function main() {
  const userData = buildProfile();
  console.log('profile prepared at', userData);
  const ctx = await chromium.launchPersistentContext(join(userData, 'Profile 2'), {
    channel: undefined,
    executablePath: CHROME,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-features=OptimizationHints'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)); });
  try {
    await page.goto('https://lightning.ai', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    const url = page.url();
    console.log('landed url:', url);
    console.log('title:', (await page.title()).slice(0, 120));
    const body = await page.locator('body').innerText().catch(() => '');
    console.log('--- PAGE SNAPSHOT (first 2500 chars) ---');
    console.log(body.replace(/\n{2,}/g, '\n').slice(0, 2500));
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
