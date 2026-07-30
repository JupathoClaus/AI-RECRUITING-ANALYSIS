/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { execSync } = require('child_process');
const { resolve } = require('path');

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const repoRoot = resolve(__dirname, '..');

const STEPS = [
  ['npm run build', 'Build'],
  ['npm run lint:baseline', 'Lint baseline check (no new violations)'],
  ['npm run typecheck', 'TypeScript type check'],
];

let passed = 0;
let failed = 0;

for (const [cmd, label] of STEPS) {
  console.log(`\n[release-gate] ${label}...`);
  console.log(`  > ${cmd}`);
  try {
    const out = execSync(cmd, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
    const lines = out.toString().trim();
    if (lines) console.log(lines);
    console.log(`[PASS] ${label}`);
    passed++;
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    if (msg) console.error(msg);
    console.log(`[FAIL] ${label}`);
    failed++;
  }
}

console.log(`\n=== Release Gate Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('Release gate FAILED — resolve errors above before releasing.');
  process.exit(EXIT_FAIL);
} else {
  console.log('Release gate PASSED — all checks green.');
  process.exit(EXIT_PASS);
}
