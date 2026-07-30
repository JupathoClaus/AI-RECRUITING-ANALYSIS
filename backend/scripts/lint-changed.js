const { execSync } = require('child_process');
const { resolve } = require('path');

const repoRoot = resolve(__dirname, '../..');
const diffCmd = `git -C "${repoRoot}" diff --name-only HEAD -- "backend/src/*.ts" "backend/test/*.ts"`;
const env = { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' };

let changed;
try {
  changed = execSync(diffCmd, { encoding: 'utf-8' }).trim();
} catch {
  changed = '';
}

if (!changed) {
  console.log('No changed backend TypeScript files to lint.');
  process.exit(0);
}

const files = changed
  .split('\n')
  .map(f => f.replace(/^backend\//, ''))
  .filter(f => f.endsWith('.ts'))
  .join(' ');

if (!files) {
  console.log('No changed backend TypeScript files to lint.');
  process.exit(0);
}

console.log('Changed backend TS files:', files);

const eslintCmd = `npx eslint ${files}`;

try {
  execSync(eslintCmd, { encoding: 'utf-8', stdio: 'inherit', maxBuffer: 10 * 1024 * 1024, env });
  console.log('PASS: All changed files pass lint.');
  process.exit(0);
} catch (err) {
  console.error('FAIL: Lint violations in changed files.');
  process.exit(1);
}
