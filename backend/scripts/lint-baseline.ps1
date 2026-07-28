# lint-baseline.ps1 - compare current lint output against committed baseline
$ErrorActionPreference = "Stop"

$baselineFile = "scripts/lint-baseline.txt"

# Run full lint, capture stderr merged
$env:ESLINT_USE_FLAT_CONFIG = "false"
$current = & npx eslint "{src,apps,libs,test}/**/*.ts" 2>&1
$exitCode = $LASTEXITCODE

# Extract stable violation fingerprints: relative path : line : ruleId
$currentViolations = @()
foreach ($line in $current) {
  if ($line -match '^([^\s]+\.[a-z]+)\((\d+):\d+\):\s+(warning|error)\s+(.*?)\s+([\w\/-]+)') {
    $currentViolations += "$($Matches[1]):$($Matches[2]):$($Matches[5])"
  }
}
$currentViolations = $currentViolations | Sort-Object -Unique

if (-not (Test-Path $baselineFile)) {
  Write-Host "No baseline file found. Creating baseline..."
  $currentViolations | Out-File -FilePath $baselineFile -Encoding utf8
  Write-Host "Baseline created at $baselineFile with $($currentViolations.Count) violation fingerprints."
  Write-Host "Full lint exit code: $exitCode"
  exit 0
}

$baselineViolations = Get-Content $baselineFile | Where-Object { $_ -ne '' }

$newViolations = $currentViolations | Where-Object { $_ -notin $baselineViolations }
$fixedViolations = $baselineViolations | Where-Object { $_ -notin $currentViolations }

if ($newViolations.Count -gt 0) {
  Write-Host "FAIL: Baseline grew — $($newViolations.Count) new violation(s) found." -ForegroundColor Red
  $newViolations | ForEach-Object { Write-Host "  NEW: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "PASS: Baseline did not grow ($($baselineViolations.Count) known, $($currentViolations.Count) current)." -ForegroundColor Green
if ($fixedViolations.Count -gt 0) {
  Write-Host "$($fixedViolations.Count) previous violation(s) fixed (consider updating baseline)." -ForegroundColor Yellow
  $fixedViolations | ForEach-Object { Write-Host "  FIXED: $_" -ForegroundColor Yellow }
}
Write-Host "Full lint exit code: $exitCode"
exit 0
