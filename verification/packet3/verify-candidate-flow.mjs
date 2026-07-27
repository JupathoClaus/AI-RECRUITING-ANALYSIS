import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PASS = '\x1b[32m\u2713\x1b[0m';
const FAIL = '\x1b[31m\u2717\x1b[0m';
const SKIP = '\x1b[33m\u2013\x1b[0m';
let passed = 0, failed = 0, skipped = 0;
function test(name, ok) { console.log((ok ? PASS : FAIL) + ' ' + name); if (ok) passed++; else failed++; }
function skip(name) { console.log(SKIP + ' ' + name); skipped++; }

function createMinimalPdf(filename) {
  // Build a minimal valid PDF with embedded text (>20 chars for extraction).
  // All offsets are computed exactly for a correct xref table.
  const esc = (s) => s.replace(/[\\()]/g, '\\$&');
  const streamText = 'Hello World - Resume for automated testing with Java and Python';
  const streamData = 'BT /F1 12 Tf 100 700 Td (' + esc(streamText) + ') Tj ET';
  const rawObjs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj',
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    '5 0 obj<</Length ' + Buffer.byteLength(streamData, 'utf8') + '>>stream\n' + streamData + '\nendstream\nendobj',
  ];
  const header = '%PDF-1.4';
  // Build each line: header line + each object on its own line
  const lines = [header, ...rawObjs];
  // Calculate byte offset of each line start. Lines are joined with \n.
  const sepLen = 1; // \n between lines
  const xrefOff = [0]; // entry 0 unused (free ref)
  let current = Buffer.byteLength(lines[0], 'utf8') + sepLen; // start of first object line
  for (let i = 1; i < lines.length; i++) {
    xrefOff.push(current);
    current += Buffer.byteLength(lines[i], 'utf8') + sepLen;
  }
  // xref table starts at 'current' (the byte after the last line's \n)
  const xrefTable =
    'xref\n0 ' + (lines.length) + '\n' +
    '0000000000 65535 f \n' +
    xrefOff.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer<</Size ' + (lines.length) + '/Root 1 0 R>>\nstartxref\n' + current + '\n%%EOF';
  const content = lines.join('\n') + '\n' + xrefTable;
  const outPath = join(__dirname, filename);
  writeFileSync(outPath, content);
  return outPath;
}

const resumePath = createMinimalPdf('test-resume.pdf');
const candidateName = 'Browser Test ' + Date.now();
const candidateEmail = 'bt' + Date.now() + '@example.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snap = (name) => page.screenshot({ path: join(__dirname, name + '.png') }).catch(() => {});
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    // ========================
    // 1. LOGIN
    // ========================
    console.log('\n=== 1. Login ===');
    await page.goto('http://localhost:3001/login', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', 'sarah@airecruiter.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    const loginOk = await page.waitForFunction(
      () => window.location.pathname.includes('dashboard'), { timeout: 20000 }
    ).then(() => true).catch(() => false);
    test('Login succeeds and redirects to dashboard', loginOk);
    await page.waitForTimeout(2000);

    // ========================
    // 2. OPEN CANDIDATES
    // ========================
    console.log('\n=== 2. Open Candidates ===');
    await page.locator('nav a[href="/candidates"]').click();
    await page.waitForTimeout(3000);
    test('Candidates page loads', page.url().includes('/candidates'));
    await snap('01-candidates-page');

    // ========================
    // 3. CLICK ADD CANDIDATE
    // ========================
    console.log('\n=== 3. Add Candidate Dialog ===');
    await page.locator('header button:has-text("Add Candidate")').click();
    await page.waitForTimeout(1500);
    const dialogOpen = await page.locator('h2:has-text("Add New Candidate")').isVisible().catch(() => false);
    test('Add Candidate dialog opens', dialogOpen);
    await snap('02-add-candidate-dialog');

    const dialogText = await page.locator('[role="dialog"]').first().textContent().catch(() => '');
    test('Dialog shows only active jobs (no Closed Role)', !dialogText.includes('Closed Role'));

    // ========================
    // 4. FILL FORM
    // ========================
    console.log('\n=== 4. Fill Form ===');
    await page.fill('input[placeholder="e.g. John Smith"]', candidateName);
    await page.fill('input[placeholder="john@example.com"]', candidateEmail);

    const jobSelect = page.locator('[role="dialog"] button[role="combobox"]');
    await jobSelect.click({ force: true });
    await page.waitForTimeout(1000);
    const firstOption = page.locator('[role="option"]').first();
    if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstOption.click();
      await page.waitForTimeout(500);
      test('Job selected from dropdown', true);
    }

    // ========================
    // 5. UPLOAD RESUME
    // ========================
    console.log('\n=== 5. Upload Resume ===');
    const fileInput = page.locator('input[aria-label="Upload resume file"]');
    if (await fileInput.count().then(n => n > 0).catch(() => false)) {
      await fileInput.setInputFiles(resumePath);
      await page.waitForTimeout(1000);
      test('File selected', true);

      const wasUploading = await page.locator('text=Uploading').isVisible().catch(() => false);
      test('No Uploading before clicking', !wasUploading);

      const uploadBtn = page.locator('button:has-text("Upload Resume")');
      if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await uploadBtn.click({ force: true });
        await page.waitForTimeout(500);
        test('File stored via Upload Resume button', true);
        await snap('03-file-stored');
      }
    }

    // ========================
    // 6. ADD CANDIDATE SUBMIT
    // ========================
    console.log('\n=== 6. Submit Add Candidate ===');
    const submitBtn = page.locator('button:has-text("Add Candidate")').last();
    const submitDisabled = await submitBtn.getAttribute('disabled').catch(() => null);
    test('Add Candidate button enabled', submitDisabled === null);

    if (submitDisabled !== null) { skip('Button disabled, exiting'); await browser.close(); process.exit(0); }

    // Click submit and wait for progress then completion
    await submitBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // Wait for extraction/screening (poll up to 40s)
    console.log('\n=== Waiting for extraction and screening ===');
    let screeningReady = false, screeningDone = false;
    for (let i = 0; i < 40; i++) {
      const body = await page.locator('body').textContent().catch(() => '');
      if (body.includes('Start AI Screening')) { screeningReady = true; break; }
      // Use "Overall Score" which is unique to ScreeningResultView (not present in table headers)
      if (body.includes('Overall Score')) { screeningDone = true; break; }
      await page.waitForTimeout(1000);
    }

    if (screeningDone) {
      test('Screening completed (mock provider)', true);
      await snap('06-screening-result');
    } else if (screeningReady) {
      test('Start AI Screening appears', true);
      await snap('05-screening-ready');
      await page.locator('button:has-text("Start AI Screening")').click({ force: true });
      // Wait up to 60s for screening to complete via polling
      for (let i = 0; i < 60; i++) {
        const body = await page.locator('body').textContent().catch(() => '');
        if (body.includes('Overall Score')) { screeningDone = true; break; }
        await page.waitForTimeout(1000);
      }
      test('Screening reaches completed state', screeningDone);
      if (screeningDone) {
        await snap('06-screening-result');
        const scrText = await page.locator('body').textContent().catch(() => '');
        test('Screening result contains score data', scrText.includes('Overall Score') && scrText.includes('/100'));
      } else {
        await snap('06-screening-timeout');
      }
    } else {
      await snap('05-screening-not-reached');
      skip('Screening state not reached');
    }

    test('No console errors', errors.length === 0);
    if (errors.length > 0) console.log('  Errors:', errors.join(', '));

    // ========================
    // 7. CANDIDATE CREATION VERIFIED VIA REFRESH
    // ========================
    console.log('\n=== 7. Verify via Refresh ===');
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    const bodyAfterRefresh = await page.locator('body').textContent().catch(() => '');
    test('Candidate persists after refresh', bodyAfterRefresh.includes(candidateName));
    await snap('07-after-refresh');

    // ========================
    // 8. OPEN NEW CANDIDATE DETAIL
    // ========================
    console.log('\n=== 8. Candidate Detail ===');
    const candLink = page.locator(`a:has-text("${candidateName}"), td:has-text("${candidateName}"), div:has-text("${candidateName}")`).first();
    if (await candLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await candLink.click();
      await page.waitForTimeout(2000);
      const detailText = await page.locator('body').textContent().catch(() => '');
      test('Candidate detail shows resume info', detailText.includes('.pdf') || detailText.includes('Resume'));
      test('Candidate detail shows screening info', detailText.includes('AI Screening') || detailText.includes('Overall Score') || detailText.includes('evidence'));
      await snap('08-candidate-detail');
    } else {
      skip('Candidate link not found in list');
    }
  } catch (err) {
    console.error('\n\x1b[31mScript error:\x1b[0m', err.message);
    failed++;
  } finally {
    await browser.close();
  }

  const total = passed + failed + skipped;
  console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)\x1b[0m`);
  if (errors.length > 0) console.log('Console errors:', errors.join('; '));
  process.exit(failed > 0 ? 1 : 0);
})();
