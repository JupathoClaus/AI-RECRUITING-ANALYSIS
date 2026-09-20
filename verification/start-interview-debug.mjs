const BE = process.env.BE_URL ?? 'http://localhost:3000';

// Get fresh token from verify-code (previous one may have been consumed)
// First regenerate code via recruiter API
const lp = await fetch(`${BE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah@airecruiter.com', password: 'admin123' })
});
const lr = await lp.json();
const recToken = lr.data.tokens.accessToken;
const rh = { Authorization: `Bearer ${recToken}`, 'content-type': 'application/json' };

// Check current state
const iv = await fetch(`${BE}/api/v1/ai-interviews/703e729f-e8b9-4cf5-85b1-fb1a15b7187f`, { headers: rh });
const ivd = await iv.json();
console.log('Current status:', ivd.data.status);
console.log('TavusConvId:', ivd.data.tavusConversationId);

// Regenerate code
const regen = await fetch(`${BE}/api/v1/ai-interviews/703e729f-e8b9-4cf5-85b1-fb1a15b7187f/regenerate-code`, {
  method: 'POST', headers: rh, body: '{}'
});
const regenBody = await regen.json();
const code = regenBody.data?.rawCode;
console.log('New code:', code);

// Verify code
const vr = await fetch(`${BE}/api/v1/ai-interviews/public/verify-code`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code })
});
const vrBody = await vr.json();
const token = vrBody.data?.accessToken;
console.log('Access token:', token ? 'obtained (len=' + token.length + ')' : 'MISSING');

if (!token) { console.log('No token - cannot start'); process.exit(1); }

const authH = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

// Get session (transitions to ACCESSED/READY)
const sr = await fetch(`${BE}/api/v1/ai-interviews/public/session`, { headers: authH });
const srBody = await sr.json();
console.log('Session status:', srBody.data?.status);

// Try start
const start = await fetch(`${BE}/api/v1/ai-interviews/public/start`, {
  method: 'POST', headers: authH,
  body: JSON.stringify({ acknowledgementsAccepted: true })
});
const startBody = await start.json();
console.log('Start HTTP:', start.status);
console.log('Start body:', JSON.stringify(startBody, null, 2).substring(0, 600));
