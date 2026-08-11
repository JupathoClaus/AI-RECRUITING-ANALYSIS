import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/candidates')) {
      try {
        const json = await resp.json();
        const count = json.data?.length || 0;
        console.log(`  CANDIDATES API: ${resp.status()} ${resp.url().split('?')[0]} -> ${count} candidates`);
      } catch {}
    }
  });

  // Login from dashboard path
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('=== On Dashboard (candidates should be loaded) ===');

  // Navigate directly to pipeline via URL (full reload)
  console.log('\n=== Full reload to pipeline page ===');
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL: ' + page.url());

  const body1 = await page.locator('body').textContent();
  console.log('Has Alice: ' + body1.includes('Alice'));
  console.log('Has "No candidates": ' + body1.includes('No candidates'));

  // Wait longer for candidates to load
  for (let i = 0; i < 15; i++) {
    const body = await page.locator('body').textContent();
    if (body.includes('Alice') || body.includes('Bob') || body.includes('Carol')) {
      console.log('Candidates found after ' + (i+1) + 's');
      break;
    }
    if (body.includes('No candidates')) {
      console.log('Still no candidates after ' + (i+1) + 's');
    }
    await page.waitForTimeout(1000);
  }

  // Now filter by job
  const filterBtn = page.locator('[role="combobox"]');
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await page.waitForTimeout(1500);
    const options = await page.locator('[role="option"]').all();
    console.log('\nFilter options: ' + options.length);
    
    if (options.length > 1) {
      await options[1].click();
      await page.waitForTimeout(5000);
      
      for (let i = 0; i < 15; i++) {
        const body = await page.locator('body').textContent();
        if (body.includes('Alice') || body.includes('Bob') || body.includes('Carol')) {
          console.log('Candidates in pipeline after ' + (i+1) + 's');
          break;
        }
        await page.waitForTimeout(1000);
      }
      
      const h3s = await page.locator('h3').allTextContents();
      console.log('Stage headers: ' + h3s.join(', '));
      
      console.log('\nStage content check:');
      const body = await page.locator('body').textContent();
      console.log('Has Alice: ' + body.includes('Alice'));
      console.log('Has Bob: ' + body.includes('Bob'));
      console.log('Has Carol: ' + body.includes('Carol'));
      
      // Check each stage column
      for (const h3 of h3s) {
        const stageCol = page.locator('h3').filter({ hasText: h3.trim() }).locator('..');
        const stageText = await stageCol.textContent();
        if (stageText) {
          const hasAlice = stageText.includes('Alice');
          const hasBob = stageText.includes('Bob');
          const hasCarol = stageText.includes('Carol');
          if (hasAlice || hasBob || hasCarol) {
            console.log(`  ${h3.trim()}: Alice=${hasAlice} Bob=${hasBob} Carol=${hasCarol}`);
          }
        }
      }
    }
  }

  await browser.close();
})();
