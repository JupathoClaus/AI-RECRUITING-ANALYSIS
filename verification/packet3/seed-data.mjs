import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const JOB_ID = 'a65d75e1-2d4c-4f11-81d8-d99875fb5989'; // Product Manager

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const token = await page.evaluate(() => localStorage.getItem('ai-recruiter-access-token'));
  console.log('Token found: ' + (token ? 'yes' : 'no'));

  // List existing candidates
  const existingCandidates = await page.evaluate(async () => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/candidates?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const json = await res.json();
    return (json.data || []).map(c => ({ id: c.id, name: c.firstName + ' ' + c.lastName }));
  });
  console.log('Existing candidates: ' + existingCandidates.length);

  // Create David if not exists
  let allCandidateIds = existingCandidates.map(c => c.id);
  const davidExists = existingCandidates.some(c => c.name.includes('David'));
  if (!davidExists) {
    const result = await page.evaluate(async () => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      const res = await fetch('http://localhost:3000/api/v1/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ firstName: 'David', lastName: 'Wilson', email: 'david@example.com', currentJobTitle: 'Technical PM', totalExperienceYears: 4, source: 'RECRUITER_CREATED' }),
      });
      const json = await res.json();
      return { status: res.status, id: json.data?.id || json.id };
    });
    console.log('Create David: ' + result.status + ' id=' + result.id);
    if (result.status === 201) allCandidateIds.push(result.id);
  }

  // Get pipeline stages
  const stages = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch(`http://localhost:3000/api/v1/jobs/${jobId}/pipeline`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const json = await res.json();
    return (json.data?.stages || []).map(s => ({ id: s.id, name: s.name }));
  }, JOB_ID);
  console.log('Pipeline stages: ' + stages.length);
  for (const s of stages) console.log('  ' + s.name + ' (' + s.id + ')');

  // Create applications for all candidates
  if (stages.length > 0) {
    const firstStageId = stages[0].id;
    console.log('\nCreating applications in stage: ' + stages[0].name);

    for (const cid of allCandidateIds) {
      // Check existing applications
      const existingApps = await page.evaluate(async (candidateId) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch(`http://localhost:3000/api/v1/applications?candidateId=${candidateId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        return (json.data || []).map(a => a.job?.id);
      }, cid);

      if (existingApps.includes(JOB_ID)) {
        console.log('Candidate ' + cid + ' already has application for this job');
        continue;
      }

      const result = await page.evaluate(async ({candidateId, jobId}) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ candidateId, jobId, source: 'RECRUITER_CREATED' }),
        });
        const json = await res.json();
        return { status: res.status, id: json.data?.id || json.id };
      }, {candidateId: cid, jobId: JOB_ID});
      console.log('Create app for ' + cid + ': ' + result.status + ' id=' + result.id);
    }
  }

  console.log('\nDone!');
  await browser.close();
})();
