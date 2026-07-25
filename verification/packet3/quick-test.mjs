import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      console.log(`  ${resp.status()} ${resp.url().split('?')[0]}`);
    }
  });

  console.log('1. Loading login page...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  console.log('   Page title: ' + (await page.title()));
  console.log('   Body (first 200 chars): ' + (await page.locator('body').textContent()).substring(0, 200));

  console.log('\n2. Filling login...');
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  const loggedIn = await page.waitForURL('**/dashboard', { timeout: 15000 }).then(() => true).catch(() => false);
  console.log('   Logged in: ' + loggedIn);

  if (loggedIn) {
    await page.waitForTimeout(3000);
    console.log('   Dashboard URL: ' + page.url());

    console.log('\n3. Clicking Jobs link...');
    const jobsLink = page.locator('a[href="/jobs"]');
    console.log('   Jobs link count: ' + (await jobsLink.count()));
    
    if (await jobsLink.count() > 0) {
      await jobsLink.click();
      await page.waitForTimeout(3000);
      console.log('   URL after click: ' + page.url());
      const bodyText = await page.locator('body').textContent();
      console.log('   Has Product Manager: ' + bodyText.includes('Product Manager'));
      console.log('   Body (first 200 chars): ' + bodyText.substring(0, 200));
    }
  }

  await browser.close();
})();
