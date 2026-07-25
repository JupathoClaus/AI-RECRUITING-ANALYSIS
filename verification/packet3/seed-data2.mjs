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
    const res = await fetch('http://localhost:3000/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        candidateId: '4ab44ede-c675-408d-9185-f0de6e5c4a3c',
        jobId: 'a65d75e1-2d4c-4f11-81d8-d99875fb5989',
        source: 'RECRUITER_CREATED'
      }),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
