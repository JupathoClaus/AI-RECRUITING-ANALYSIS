/**
 * Recording enablement acceptance check (safe, no Tavus minutes, no secrets).
 *
 * Verifies the EXISTING Tavus → AWS S3 recording pipeline is enabled and wired:
 *   1-5. env configuration (enabled/provider/bucket/region/role ARN)
 *   6-7. conversation request construction (auto_start_recording + recording_storage)
 *   8-10. webhook handler support (recording_ready, recording_copy_failed,
 *         transcription_ready)
 * plus: no AWS keys in .env, backend/.env still git-ignored, no secret output.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_FILE = join(ROOT, 'backend', '.env');
const SERVICE = join(ROOT, 'backend', 'src', 'modules', 'ai-interviews', 'services', 'ai-interviews.service.ts');
const LOADER = join(ROOT, 'backend', 'src', 'config', 'loaders', 'tavus.config.ts');
const VALIDATION = join(ROOT, 'backend', 'src', 'config', 'validation.ts');

const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}

const env = readFileSync(ENV_FILE, 'utf8');
const getEnv = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1] ?? '';
const service = readFileSync(SERVICE, 'utf8');
const loader = readFileSync(LOADER, 'utf8');
const validation = readFileSync(VALIDATION, 'utf8');

// 1-5. configuration
check('cfg: TAVUS_RECORDING_ENABLED=true', getEnv('TAVUS_RECORDING_ENABLED') === 'true', getEnv('TAVUS_RECORDING_ENABLED'));
check('cfg: TAVUS_RECORDING_PROVIDER=s3', getEnv('TAVUS_RECORDING_PROVIDER') === 's3', getEnv('TAVUS_RECORDING_PROVIDER'));
check('cfg: TAVUS_RECORDING_BUCKET_NAME=ai-recruiter-tavus-recordings', getEnv('TAVUS_RECORDING_BUCKET_NAME') === 'ai-recruiter-tavus-recordings', getEnv('TAVUS_RECORDING_BUCKET_NAME'));
check('cfg: TAVUS_RECORDING_BUCKET_REGION=eu-north-1', getEnv('TAVUS_RECORDING_BUCKET_REGION') === 'eu-north-1', getEnv('TAVUS_RECORDING_BUCKET_REGION'));
const roleArn = getEnv('TAVUS_RECORDING_ASSUME_ROLE_ARN');
check('cfg: TAVUS_RECORDING_ASSUME_ROLE_ARN configured', roleArn === 'arn:aws:iam::858351789491:role/TavusRecordingAccessRole', roleArn ? 'arn:aws:iam::858351789491:role/***' : '(empty)');
check('cfg: no AWS access keys present in .env', !/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/.test(env), 'AWS keys found');
check('cfg: no key_template invented', getEnv('TAVUS_RECORDING_KEY_TEMPLATE') === '', 'key template present (application default key is used)');

// loader + validation
for (const [name, varName] of [
  ['loader', 'TAVUS_RECORDING_ENABLED'],
  ['loader', 'TAVUS_RECORDING_PROVIDER'],
  ['loader', 'TAVUS_RECORDING_BUCKET_NAME'],
  ['loader', 'TAVUS_RECORDING_BUCKET_REGION'],
  ['loader', 'TAVUS_RECORDING_ASSUME_ROLE_ARN'],
  ['validation', 'TAVUS_RECORDING_ENABLED'],
  ['validation', 'TAVUS_RECORDING_PROVIDER'],
  ['validation', 'TAVUS_RECORDING_BUCKET_NAME'],
  ['validation', 'TAVUS_RECORDING_BUCKET_REGION'],
  ['validation', 'TAVUS_RECORDING_ASSUME_ROLE_ARN'],
]) {
  const src = name === 'loader' ? loader : validation;
  check(`cfg: ${name} reads ${varName}`, src.includes(varName), 'missing');
}

// 6-7. conversation request construction
check('request: auto_start_recording built when enabled', /auto_start_recording = true/.test(service), 'missing');
check('request: recording_storage object constructed', /recording_storage = storage/.test(service), 'missing');
check('request: s3 mapping (bucket_name/bucket_region/assume_role_arn)', /storage\.bucket_name =/.test(service) && /storage\.bucket_region =/.test(service) && /storage\.assume_role_arn =/.test(service), 's3 mapping missing');
check('request: PROCESSING status set when enabled', /recordingStatus: recordingEnabled \? 'PROCESSING' : null/.test(service), 'missing');
check('request: recording omitted safely when disabled', /recordingEnabled\) \{/.test(service), 'conditional missing');

// 8-10. webhook handler support
check('webhook: application.recording_ready handled', /'application\.recording_ready'/.test(service), 'missing');
check('webhook: application.recording_copy_failed handled', /'application\.recording_copy_failed'/.test(service), 'missing');
check('webhook: application.transcription_ready handled', /'application\.transcription_ready'/.test(service), 'missing');
check('webhook: system.shutdown handled (COMPLETED)', /'system\.shutdown'/.test(service), 'missing');
check('webhook: conversation-id → AiInterview mapping', /where: \{ tavusConversationId: conversationId \}/.test(service), 'mapping missing');

// secret hygiene
check('hygiene: backend/.env git-ignored', execSync('git check-ignore backend/.env', { cwd: ROOT, encoding: 'utf8' }).trim() === 'backend/.env', 'not ignored');
check('hygiene: report output contains no TAVUS_API_KEY value', !JSON.stringify({ roleArn }).includes(getEnv('TAVUS_API_KEY')), 'key leaked');

console.log(`\n== RESULTS ==`);
console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
for (const f of FAIL) console.log('  FAILED:', f);
if (FAIL.length) process.exitCode = 1;