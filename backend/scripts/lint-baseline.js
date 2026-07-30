/* eslint-disable @typescript-eslint/no-var-requires, no-console, @typescript-eslint/no-unused-vars */
const { readFileSync, writeFileSync, existsSync, readdirSync } = require('fs');
const { resolve } = require('path');

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_ERROR = 2;

const baselineFile = resolve(__dirname, 'lint-baseline.txt');
const repoRoot = resolve(__dirname, '..');

function listTsFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist'
      ) {
        files.push(...listTsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

function getSourceFiles() {
  return [...listTsFiles(resolve(repoRoot, 'src')), ...listTsFiles(resolve(repoRoot, 'test'))];
}

function extractViolations(output) {
  const violations = new Set();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const msgIdx = trimmed.indexOf(' - ');
    if (msgIdx === -1) continue;
    const before = trimmed.slice(0, msgIdx);
    const after = trimmed.slice(msgIdx + 3);
    const ruleMatch = after.match(/^(.+?)\s+\(([^)]+)\)$/);
    if (!ruleMatch) continue;
    const fullMsg = ruleMatch[1];
    const rule = ruleMatch[2];
    const locMatch = before.match(/^(.+):\s+line\s+(\d+),\s+col\s+(\d+),\s+(Warning|Error)$/);
    if (!locMatch) continue;
    const path = locMatch[1];
    const severity = locMatch[4];
    violations.add(`${path}:${fullMsg.toLowerCase()}:${rule}`);
  }
  return [...violations].sort();
}

async function runESLint(files) {
  if (files.length === 0) return { exitCode: 0, stdout: '', stderr: '' };
  try {
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ useEslintrc: true, cache: false, fix: false, cwd: repoRoot });
    const results = await eslint.lintFiles(files);
    const formatter = await eslint.loadFormatter('compact');
    const resultText = formatter.format(results);
    const errorCount = results.reduce((s, r) => s + r.errorCount + r.warningCount, 0);
    return { exitCode: errorCount > 0 ? 1 : 0, stdout: resultText, stderr: '' };
  } catch (err) {
    return { exitCode: -1, stdout: '', stderr: err.message };
  }
}

function validateBaselineLines(lines) {
  const errors = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.split(':').length < 3) errors.push(`Malformed baseline line: ${line}`);
  }
  return errors;
}

function createBaseline(violations) {
  const content = violations.join('\n') + (violations.length > 0 ? '\n' : '');
  writeFileSync(baselineFile, content, 'utf-8');
  console.log(`Baseline created at ${baselineFile} with ${violations.length} violation(s).`);
}

async function selfTest() {
  let failures = 0;
  const test = (name, fn) => {
    try {
      fn();
      console.log(`  PASS: ${name}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL: ${name}: ${err.message}`);
    }
  };

  console.log('--- Self-tests ---');

  test('extractViolations parses compact format', () => {
    const out = [
      'D:\\test.ts: line 10, col 5, Warning - Unexpected any (no-any)',
      'D:\\test.ts: line 20, col 3, Error - Missing return type (@typescript-eslint/explicit-function-return-type)',
    ].join('\n');
    const v = extractViolations(out);
    if (v.length !== 2) throw new Error(`Expected 2 violations, got ${v.length}`);
    if (!v.some((x) => x.includes('no-any'))) throw new Error(`Expected no-any`);
    if (!v.some((x) => x.includes('explicit-function-return-type')))
      throw new Error(`Expected explicit-function-return-type`);
  });

  test('extractViolations skips headers and empty lines', () => {
    const out = '# header\n\nD:\\test.ts: line 1, col 1, Error - x (rule)\n';
    const v = extractViolations(out);
    if (v.length !== 1) throw new Error(`Expected 1 violation, got ${v.length}`);
  });

  test('validateBaselineLines passes for valid lines', () => {
    const errs = validateBaselineLines(['src/a.ts:error:@typescript-eslint/no-explicit-any']);
    if (errs.length !== 0) throw new Error(`Expected 0 errors, got ${errs.length}`);
  });

  test('validateBaselineLines rejects malformed lines', () => {
    const errs = validateBaselineLines(['garbage line']);
    if (errs.length !== 1) throw new Error(`Expected 1 error, got ${errs.length}`);
  });

  test('listTsFiles returns .ts files', () => {
    const files = getSourceFiles();
    if (files.length === 0) throw new Error('No .ts files found');
    if (!files.every((f) => f.endsWith('.ts'))) throw new Error('Non-.ts file in list');
  });

  test('runESLint returns exitCode >= 0 for real files', async () => {
    const files = getSourceFiles().slice(0, 3);
    if (files.length === 0) return;
    const result = await runESLint(files);
    if (result.exitCode === -1) throw new Error(`ESLint crashed: ${result.stderr}`);
  });

  test('runESLint returns exit 0 for empty file list', async () => {
    const result = await runESLint([]);
    if (result.exitCode !== 0) throw new Error('Expected exit 0');
  });

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) FAILED`);
    process.exit(EXIT_ERROR);
  }
  console.log(`\nAll self-tests passed.`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--self-test')) {
    await selfTest();
    return;
  }

  const updateBaseline = argv.includes('--update');
  const files = getSourceFiles();

  const result = await runESLint(files);
  if (result.exitCode === -1) {
    console.error(`ERROR: ESLint failed to run: ${result.stderr}`);
    process.exit(EXIT_ERROR);
  }

  const currentViolations = extractViolations(result.stdout);

  if (!existsSync(baselineFile) || updateBaseline) {
    createBaseline(currentViolations);
    process.exit(EXIT_PASS);
  }

  let baselineContent;
  try {
    baselineContent = readFileSync(baselineFile, 'utf-8');
  } catch (err) {
    console.error(`ERROR: Cannot read baseline file: ${err.message}`);
    process.exit(EXIT_ERROR);
  }

  const baselineLines = baselineContent.trim().split('\n').filter(Boolean);
  const validationErrors = validateBaselineLines(baselineLines);
  if (validationErrors.length > 0) {
    for (const e of validationErrors) console.error(`ERROR: ${e}`);
    process.exit(EXIT_ERROR);
  }

  const baselineSet = new Set(baselineLines);
  const currentSet = new Set(currentViolations);
  const newViolations = currentViolations.filter((v) => !baselineSet.has(v));
  const fixedViolations = baselineLines.filter((v) => !currentSet.has(v));

  if (newViolations.length > 0) {
    console.error(`FAIL: ${newViolations.length} new violation(s).`);
    for (const v of newViolations) console.error(`  NEW: ${v}`);
    console.error('Fix or run with --update.');
    process.exit(EXIT_FAIL);
  }

  console.log(
    `PASS: No new violations (${baselineLines.length} known, ${currentViolations.length} current).`,
  );
  if (fixedViolations.length > 0) {
    console.log(`${fixedViolations.length} previous violation(s) fixed (--update to refresh).`);
    for (const v of fixedViolations) console.log(`  FIXED: ${v}`);
  }

  process.exit(EXIT_PASS);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FATAL: ${err.message}`);
    process.exit(EXIT_ERROR);
  });
}

module.exports = { extractViolations, validateBaselineLines, runESLint, getSourceFiles };
