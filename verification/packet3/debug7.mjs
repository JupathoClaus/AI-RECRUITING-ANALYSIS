import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const apiResponses = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/')) {
      const url = resp.url().split('?')[0];
      try {
        const json = await resp.json();
        apiResponses.push({ url, status: resp.status(), data: json });
      } catch { /* skip */ }
    }
  });

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Navigate to candidates page to see what's there
  const candidateLink = page.locator('a').filter({ hasText: /Candidates/i });
  if (await candidateLink.count() > 0) {
    await candidateLink.first().click();
    await page.waitForTimeout(5000);
  }

  const body = await page.locator('body').textContent();
  console.log('Candidates page body (first 500 chars):');
  console.log(body.substring(0, 500));

  console.log('\n\nAPI responses from candidates page:');
  for (const r of apiResponses) {
    if (r.url.includes('/candidates')) {
      console.log(`${r.status} ${r.url}:`);
      if (r.data.data && Array.isArray(r.data.data)) {
        console.log(`  ${r.data.data.length} candidates`);
        for (const c of r.data.data) {
          console.log(`  - ${c.firstName} ${c.lastName} (${c.id})`);
        }
      } else {
        console.log(`  ${JSON.stringify(r.data).substring(0, 200)}`);
      }
    }
  }

  await browser.close();
})();
