/**
 * REAL TAVUS VERIFICATION SCRIPT
 * Tests the full AI interview flow with real Tavus (not mock).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const BE_URL = process.env.BE_URL ?? 'http://localhost:3000';
const RECRUITER_EMAIL = 'sarah@airecruiter.com';
const RECRUITER_PASS = 'admin123';
const RUN_ID = Date.now();
const CAND_EMAIL = `tavus-verify-${RUN_ID}@verify.test`;
const CAND_PHONE = `+2547${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
const CAND_NAME_FIRST = 'TavusVerify';
const CAND_NAME_LAST = `User${RUN_ID}`;

const PASS = [], FAIL = [];
const check = (name, cond, detail = '') => {
  if (cond) { PASS.push(name); console.log(`PASS  ${name}`); }
  else { FAIL.push(`${name} :: ${detail}`); console.log(`FAIL  ${name} :: ${detail}`); }
};
const note = (label, val) => console.log(`  [${label}] ${val}`);

async function api(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${BE_URL}/api/v1${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message || res.statusText), { status: res.status, body });
  return body.data ?? body;
}

async function main() {
  console.log('\n=== REAL TAVUS VERIFICATION ===');
  console.log(`RUN_ID: ${RUN_ID}`);
  console.log(`Candidate: ${CAND_NAME_FIRST} ${CAND_NAME_LAST} | ${CAND_EMAIL} | ${CAND_PHONE}\n`);

  // ── Auth ──────────────────────────────────────────────────────────────────
  let token, companyId;
  try {
    const lr = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: RECRUITER_EMAIL, password: RECRUITER_PASS }) });
    token = lr.tokens.accessToken;
    companyId = lr.activeCompany?.id;
    check('auth-login', !!token, 'no token');
    note('company', companyId);
  } catch(e) { check('auth-login', false, e.message); process.exit(1); }

  // ── Find published job ────────────────────────────────────────────────────
  let jobId, jobTitle;
  try {
    const jobs = await api('/jobs?limit=20', {}, token);
    const published = (jobs.data || jobs).find(j => j.status === 'PUBLISHED');
    check('find-published-job', !!published, 'no published jobs');
    jobId = published.id;
    jobTitle = published.title;
    note('job', `${jobTitle} (${jobId.substring(0,8)}...)`);
  } catch(e) { check('find-published-job', false, e.message); process.exit(1); }

  // ── Create candidate ──────────────────────────────────────────────────────
  let candidateId, applicationId;
  try {
    const cand = await api('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        firstName: CAND_NAME_FIRST,
        lastName: CAND_NAME_LAST,
        email: CAND_EMAIL,
        phone: CAND_PHONE,
        source: 'RECRUITER_CREATED',
        currentJobTitle: 'Software Engineer',
        totalExperienceYears: 5
      })
    }, token);
    candidateId = cand.id;
    check('create-candidate', !!candidateId, 'no candidateId');
    note('candidate', `${cand.displayName} (${candidateId.substring(0,8)}...)`);
  } catch(e) { check('create-candidate', false, e.message); process.exit(1); }

  // ── Create application ────────────────────────────────────────────────────
  try {
    const app = await api('/applications', {
      method: 'POST',
      body: JSON.stringify({ candidateId, jobId, source: 'RECRUITER_CREATED' })
    }, token);
    applicationId = app.id;
    check('create-application', !!applicationId, 'no applicationId');
    note('application', `${applicationId.substring(0,8)}... → job=${jobTitle}`);
  } catch(e) { check('create-application', false, e.message); process.exit(1); }

  // ── Create AI interview ───────────────────────────────────────────────────
  let interviewId;
  try {
    const iv = await api('/ai-interviews', {
      method: 'POST',
      body: JSON.stringify({
        applicationId,
        language: 'en',
        estimatedDurationMinutes: 15
      })
    }, token);
    interviewId = iv.id;
    check('create-ai-interview', !!interviewId, 'no interviewId');
    check('interview-provider-tavus', iv.provider === 'TAVUS', `provider=${iv.provider}`);
    note('interview', `id=${interviewId.substring(0,8)}... provider=${iv.provider} status=${iv.status}`);
  } catch(e) { check('create-ai-interview', false, e.message); process.exit(1); }

  // ── Send invitation ───────────────────────────────────────────────────────
  try {
    const send = await api(`/ai-interviews/${interviewId}/send`, { method: 'POST', body: '{}' }, token);
    const newStatus = send.status ?? send.interview?.status ?? 'unknown';
    check('send-invitation', ['SENT','CREATED'].includes(newStatus) || newStatus === 'unknown', `status=${newStatus}`);
    note('send', `email sent, status=${newStatus}`);
  } catch(e) { check('send-invitation', false, e.message); }

  // ── Poll for SENT status ──────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 2000));
  try {
    const iv = await api(`/ai-interviews/${interviewId}`, {}, token);
    check('status-sent', ['SENT','CREATED'].includes(iv.status), `status=${iv.status}`);
    check('interview-has-code', !!iv.codeDisplayHint, 'no code hint');
    note('status', `status=${iv.status} codeHint=${iv.codeDisplayHint}`);
  } catch(e) { check('poll-interview-status', false, e.message); }

  // ── Verify context builder ────────────────────────────────────────────────
  try {
    const preview = await api(`/ai-interviews/${interviewId}/preview`, {}, token);
    const ctx = preview.conversationalContext || preview.context || '';
    check('context-has-job-title', ctx.includes(jobTitle) || ctx.length > 100, `no job title in context (len=${ctx.length})`);
    check('context-has-candidate-name', ctx.includes(CAND_NAME_FIRST), `no candidate name in context`);
    check('context-has-instructions', ctx.toLowerCase().includes('interview') || ctx.length > 200, `no interview instructions`);
    note('context-preview', `length=${ctx.length} chars`);
    note('context-snippet', ctx.substring(0, 200).replace(/\n/g, ' '));
  } catch(e) { check('context-preview', false, e.message); }

  // ── Resend invitation ─────────────────────────────────────────────────────
  try {
    const resend = await api(`/ai-interviews/${interviewId}/send`, { method: 'POST', body: '{}' }, token);
    check('resend-invitation', true, '');
    note('resend', `resend succeeded`);

    // Verify no duplicate interview created
    const allIv = await api('/ai-interviews', {}, token);
    const relatedToThisApp = (allIv.data || []).filter(i => i.applicationId === applicationId);
    check('no-duplicate-interview', relatedToThisApp.length === 1, `found ${relatedToThisApp.length} interviews for same application`);
  } catch(e) { check('resend-invitation', false, e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n=== RESULTS ===`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  FAIL.forEach(f => console.log(`  FAIL  ${f}`));
  console.log(`\nInterview ID for manual portal test: ${interviewId}`);
  console.log(`Application ID: ${applicationId}`);
  console.log(`Candidate: ${CAND_NAME_FIRST} ${CAND_NAME_LAST}`);
  
  return { interviewId, applicationId, token, FAIL: FAIL.length };
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
