const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const baselineFile = resolve(__dirname, 'lint-baseline.txt');
const eslintCmd = `npx eslint "src/**/*.ts" "test/**/*.ts"`;

function extractViolations(output) {
  const violations = new Set();
  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?)\((\d+):(\d+)\):\s+(warning|error)\s+(.+?)\s+(@typescript-eslint\/\S+|[a-z-]+\/[a-z-]+|\S+)$/);
    if (match) {
      violations.add(`${match[1]}:${match[4]}:${match[5]}`);
    }
  }
  return [...violations].sort();
}

let stdout;
try {
  stdout = execSync(eslintCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
} catch (err) {
  stdout = err.stdout || '';
}

const currentViolations = extractViolations(stdout);

if (!existsSync(baselineFile)) {
  console.log(`No baseline found. Creating baseline at ${baselineFile}`);
  writeFileSync(baselineFile, currentViolations.join('\n') + '\n', 'utf-8');
  console.log(`Baseline created with ${currentViolations.length} violations.`);
  process.exit(0);
}

const baselineContent = readFileSync(baselineFile, 'utf-8').trim();
const baselineViolations = baselineContent ? baselineContent.split('\n') : [];
const baselineSet = new Set(baselineViolations);

const newViolations = currentViolations.filter(v => !baselineSet.has(v));
const fixedViolations = baselineViolations.filter(v => !new Set(currentViolations).has(v));

let exitCode = 0;

if (newViolations.length > 0) {
  console.error(`FAIL: ${newViolations.length} new violation(s) found.`);
  for (const v of newViolations) console.error(`  NEW: ${v}`);
  exitCode = 1;
} else {
  console.log(`PASS: No new violations (${baselineViolations.length} known, ${currentViolations.length} current).`);
}

if (fixedViolations.length > 0) {
  console.log(`${fixedViolations.length} previous violation(s) fixed (consider updating baseline).`);
  for (const v of fixedViolations) console.log(`  FIXED: ${v}`);
}

process.exit(exitCode);
