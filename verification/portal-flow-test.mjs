/**
 * Test candidate portal flow via API — correct routes
 * POST /api/v1/ai-interviews/public/verify-code
 * GET  /api/v1/ai-interviews/public/session
 * POST /api/v1/ai-interviews/public/start
 * POST /api/v1/ai-interviews/public/complete
 */
const BE = process.env.BE_URL ?? 'http://localhost:3000';
const CODE = 'DJ5Q-GGR5';

const PASS = [], FAIL = [];
const check = (name, cond, detail = '') => {
  if (cond) { PASS.push(name); console.log(`PASS  ${name}`); }
  else { FAIL.push(`${name} :: ${detail}`); console.log(`FAIL  ${name} :: ${detail}`); }
};
const note = (label, val) => console.log(`  [${label}] ${val}`);
async function json(res) { try { return await res.json(); } catch { return {}; } }

console.log('=== CANDIDATE PORTAL FLOW TEST ===');
console.log(`Code: ${CODE}`);

// 1. Wrong code → rejected
const wr = await fetch(`${BE}/api/v1/ai-interviews/public/verify-code`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'XXXX-0000' })
});
const wrBody = await json(wr);
check('wrong-code-rejected', !wr.ok, `expected 4xx but got HTTP ${wr.status}`);
note('wrong-code', `HTTP ${wr.status} errorCode=${wrBody.errorCode || wrBody.code || 'n/a'}`);

// 2. Correct code → accepted
const vr = await fetch(`${BE}/api/v1/ai-interviews/public/verify-code`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: CODE })
});
const vrBody = await json(vr);
check('correct-code-accepted', vr.ok, `HTTP ${vr.status}: ${vrBody.message || JSON.stringify(vrBody).substring(0,100)}`);
const accessToken = vrBody.data?.accessToken;
check('access-token-issued', !!accessToken, 'no accessToken in response');
note('token', `len=${accessToken?.length ?? 0}`);
if (!accessToken) { console.log('\nBLOCKED: cannot continue without access token'); process.exit(1); }

const authH = { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };

// 3. Get session
const sr = await fetch(`${BE}/api/v1/ai-interviews/public/session`, { headers: authH });
const srBody = await json(sr);
check('session-loads', sr.ok, `HTTP ${sr.status}: ${srBody.message}`);
if (srBody.data) {
  const d = srBody.data;
  note('session', `status=${d.status} candidate=${d.candidateDisplayName} job=${d.jobTitle} org=${d.organizationName}`);
  check('session-candidate-name', !!(d.candidateFirstName || d.candidateDisplayName), 'missing candidate name fields');
  check('session-job-title', !!d.jobTitle, 'missing jobTitle');
  check('session-company', !!d.organizationName, 'missing organizationName');
  check('session-status-ok', ['SENT','ACCESSED','READY','CREATED'].includes(d.status), `unexpected status=${d.status}`);
}

// 4. Start → calls real Tavus
console.log('\nCalling Tavus to create conversation...');
const startRes = await fetch(`${BE}/api/v1/ai-interviews/public/start`, {
  method: 'POST', headers: authH,
  body: JSON.stringify({ acknowledgementsAccepted: true })
});
const startBody = await json(startRes);
check('start-interview-ok', startRes.ok, `HTTP ${startRes.status}: ${startBody.message || startBody.errorCode}`);

if (startRes.ok && startBody.data) {
  const d = startBody.data;
  note('start-status', d.status);
  note('conversation-url', d.conversationUrl ? d.conversationUrl.substring(0, 80) + '...' : 'null');
  note('conversation-id', d.conversationId || d.tavusConversationId || 'null');
  check('tavus-conversation-url', !!d.conversationUrl, 'no conversationUrl');
  check('tavus-conversation-id', !!(d.conversationId || d.tavusConversationId), 'no conversationId');
  check('status-in-progress', ['IN_PROGRESS', 'READY', 'ACCESSED', 'STARTED'].includes(d.status), `status=${d.status}`);

  if (d.conversationUrl) {
    console.log('\n  *** REAL TAVUS URL ***');
    console.log(`  ${d.conversationUrl}`);
    console.log('  Open this URL in a browser to conduct the interview.');
  }
}

console.log(`\n=== PORTAL FLOW: ${PASS.length} PASS / ${FAIL.length} FAIL ===`);
FAIL.forEach(f => console.log(`  FAIL  ${f}`));
