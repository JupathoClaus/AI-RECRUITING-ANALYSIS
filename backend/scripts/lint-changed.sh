#!/bin/bash
# fail-closed lint gate for changed backend TypeScript files
# Usage: ./scripts/lint-changed.sh [base_ref]
# base_ref defaults to origin/main

set -euo pipefail

BASE="${1:-origin/main}"

# Determine changed backend .ts files against base
CHANGED=$(git diff --name-only "$BASE" -- '*.ts' | grep -E '^backend/' || true)

if [ -z "$CHANGED" ]; then
  echo "No changed backend TypeScript files to lint."
  exit 0
fi

echo "Changed backend TS files:"
echo "$CHANGED"

# Convert newlines to spaces
FILES=$(echo "$CHANGED" | tr '\n' ' ')

# Run ESLint with --no-ignore to catch ignored files
npx cross-env ESLINT_USE_FLAT_CONFIG=false eslint --no-ignore --no-eslintrc -c .eslintrc.js $FILES 2>&1 || {
  rc=$?
  echo "FAIL: Lint violations in changed files (exit $rc)"
  exit $rc
}

echo "PASS: All changed files pass lint."
