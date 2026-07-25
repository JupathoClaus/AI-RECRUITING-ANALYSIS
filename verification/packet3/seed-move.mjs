import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const JOB_ID = 'a65d75e1-2d4c-4f11-81d8-d99875fb5989';

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Get stages
  const stages = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/pipeline', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data?.stages || []).sort((a, b) => a.sortOrder - b.sortOrder).map(s => ({ id: s.id, name: s.name }));
  }, JOB_ID);
  console.log('Stages:');
  for (const s of stages) console.log('  ' + s.name + ' (' + s.id + ')');

  // Get all apps
  const appsList = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).filter(a => a.job?.id === jobId).map(a => ({
      id: a.id, stageId: a.stageId, version: a.version,
      name: (a.candidate?.firstName || '') + ' ' + (a.candidate?.lastName || ''),
      candidateId: a.candidate?.id,
    }));
  }, JOB_ID);
  console.log('\nApplications:');
  for (const a of appsList) console.log('  ' + a.name + ' (' + a.id + ') stageIdx=' + stages.findIndex(s => s.id === a.stageId) + ' version=' + a.version);

  // Move Alice to Screening (stage 1), Bob to Interview (stage 2)
  const moves = [
    { name: 'Alice', targetStageIdx: 1 }, // Screening
    { name: 'Bob', targetStageIdx: 2 },   // Interview
  ];

  for (const move of moves) {
    const app = appsList.find(a => a.name.startsWith(move.name));
    if (!app) { console.log('\n' + move.name + ' not found in apps'); continue; }
    
    const targetStageId = stages[move.targetStageIdx].id;
    console.log('\nMoving ' + app.name + ' from ' + stages[stages.findIndex(s => s.id === app.stageId)].name + ' to ' + stages[move.targetStageIdx].name);
    console.log('  appId=' + app.id + ' stageId=' + app.stageId + ' version=' + app.version + ' toStageId=' + targetStageId);

    const result = await page.evaluate(async (params) => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      console.log(JSON.stringify(params));
      const res = await fetch('http://localhost:3000/api/v1/applications/' + params.appId + '/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ toStageId: params.targetStageId, expectedVersion: params.version }),
      });
      const text = await res.text();
      return { status: res.status, body: text };
    }, { appId: app.id, targetStageId, version: app.version });
    console.log('  Result: ' + result.status + ' ' + result.body.substring(0, 200));
  }

  await browser.close();
})();
