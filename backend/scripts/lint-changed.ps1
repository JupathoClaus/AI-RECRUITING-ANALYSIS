# lint-changed.ps1 - fail-closed gate for changed backend .ts files
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot/../.."

# Get changed backend .ts files relative to repo root
$changed = git -C $repoRoot diff --name-only HEAD -- "backend/src/*.ts" "backend/test/*.ts"

if (-not $changed) {
  Write-Host "No changed backend TypeScript files to lint."
  exit 0
}

Write-Host "Changed backend TS files:"
$changed | ForEach-Object { Write-Host "  $_" }

# Convert to backend-relative paths
$files = @()
foreach ($f in $changed) {
  if ($f -match '^backend/(.+)') { $files += $matches[1] }
}
$fileList = $files -join ' '

Write-Host "Running ESLint on: $fileList"

# Run ESLint with increased memory
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:ESLINT_USE_FLAT_CONFIG = "false"
$result = & npx eslint $fileList 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host "FAIL: Lint violations in changed files (exit $exitCode)" -ForegroundColor Red
  Write-Host $result
  exit $exitCode
}

Write-Host "PASS: All changed files pass lint." -ForegroundColor Green
exit 0
