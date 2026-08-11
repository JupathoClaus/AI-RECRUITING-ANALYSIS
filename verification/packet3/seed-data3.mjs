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

  // Step 1: Check current job status
  const jobInfo = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return { status: json.data?.status, title: json.data?.title };
  }, JOB_ID);
  console.log('Job status: ' + JSON.stringify(jobInfo));

  // Step 2: Publish the job
  const publishResult = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }, JOB_ID);
  console.log('Publish: ' + JSON.stringify(publishResult));

  // Step 3: Create candidates (Alice, Bob, Carol, David)
  const candidatesData = [
    { firstName: 'Alice', lastName: 'Johnson', email: 'alice@example.com', currentJobTitle: 'Product Manager', totalExperienceYears: 5 },
    { firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com', currentJobTitle: 'Senior Product Owner', totalExperienceYears: 7 },
    { firstName: 'Carol', lastName: 'Davis', email: 'carol@example.com', currentJobTitle: 'Associate PM', totalExperienceYears: 2 },
    { firstName: 'David', lastName: 'Wilson', email: 'david@example.com', currentJobTitle: 'Technical PM', totalExperienceYears: 4 },
  ];

  const candidateIds = [];
  for (const c of candidatesData) {
    const result = await page.evaluate(async (candidateData) => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      const res = await fetch('http://localhost:3000/api/v1/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ ...candidateData, source: 'RECRUITER_CREATED' }),
      });
      const json = await res.json();
      return { status: res.status, id: json.data?.id || json.id };
    }, c);
    console.log('Create ' + c.firstName + ': ' + result.status + ' id=' + (result.id || 'na'));
    if (result.status === 201 && result.id) {
      candidateIds.push(result.id);
    }
  }

  // Step 4: Get pipeline stages
  const stages = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/pipeline', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data?.stages || []).map(s => ({ id: s.id, name: s.name, order: s.sortOrder }));
  }, JOB_ID);
  console.log('Stages: ' + stages.length);
  for (const s of stages) console.log('  ' + s.name + ' (' + s.id + ') order=' + s.order);

  // Step 5: Create applications in the first stage
  if (stages.length > 0) {
    const firstStageId = stages[0].id;
    console.log('\nCreating applications in stage: ' + stages[0].name);

    for (const cid of candidateIds) {
      const result = await page.evaluate(async (params) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ candidateId: params.cid, jobId: params.jobId, source: 'RECRUITER_CREATED' }),
        });
        const json = await res.json();
        return { status: res.status, id: json.data?.id, msg: json.message };
      }, { cid, jobId: JOB_ID });
      console.log('App for ' + cid + ': ' + result.status + ' id=' + (result.id || 'na') + ' msg=' + (result.msg || ''));
    }
  }

  console.log('\nDone!');
  await browser.close();
})();
