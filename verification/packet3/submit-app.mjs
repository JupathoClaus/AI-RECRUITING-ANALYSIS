import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const appId = 'af4fdd9e-7e69-40da-9627-bb3aa93225ce';
    // Try submit
    const r1 = await fetch('http://localhost:3000/api/v1/applications/' + appId + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    const text = await r1.text();
    return { status: r1.status, body: text.substring(0, 300) };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
