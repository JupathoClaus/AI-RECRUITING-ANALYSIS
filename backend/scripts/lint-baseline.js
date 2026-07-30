const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const baselineFile = resolve(__dirname, 'lint-baseline.txt');
const eslint = resolve(__dirname, '..', 'node_modules', '.bin', 'eslint');
const env = { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' };
const globs = ['src/**/*.ts', 'test/**/*.ts'];

function extractViolations(output) {
  const violations = new Set();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // ESLint compact format: PATH: line LINE, col COL, Warning|Error - MESSAGE (RULE)
    const match = trimmed.match(/^(.+?):\s+line\s+(\d+),\s+col\s+(\d+),\s+(Warning|Error)\s+-\s+(.+?)\s+\((@typescript-eslint\/\S+|[a-z-]+\/[a-z-]+|\S+)\)$/);
    if (match) {
      violations.add(`${match[1]}:${match[4].toLowerCase()}:${match[5]}`);
    }
  }
  return [...violations].sort();
}

let stdout;
try {
  stdout = execSync(`"${eslint}" --format compact ${globs.map(g => `"${g}"`).join(' ')}`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, env, shell: true });
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
