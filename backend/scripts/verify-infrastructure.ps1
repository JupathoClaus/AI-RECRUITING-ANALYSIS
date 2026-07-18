<#
.SYNOPSIS
  TalentAI Infrastructure Verification Script
.DESCRIPTION
  Verifies Docker infrastructure, database, health endpoints, and E2E tests.
  Must be run from the project root (backend/).
#>

$ErrorActionPreference = 'Stop'
$rootDir = (Get-Item (Split-Path -Parent $MyInvocation.MyCommand.Path)).Parent.FullName
Set-Location -LiteralPath $rootDir

$exitCode = 0
$dockerStarted = $false
$backendProcess = $null

function Write-Pass {
  Write-Host "[PASS] $args" -ForegroundColor Green
}

function Write-Fail {
  Write-Host "[FAIL] $args" -ForegroundColor Red
  $script:exitCode = 1
}

function Write-Blocked {
  Write-Host "[BLOCKED] $args" -ForegroundColor Yellow
}

function Write-Info {
  Write-Host "[INFO] $args" -ForegroundColor Cyan
}

# ----- 1. Confirm project root -----
if (-not (Test-Path "package.json")) {
  Write-Fail "Not running from backend project root (package.json not found)"
  exit 1
}
Write-Pass "Project root confirmed: $rootDir"

# ----- 2. Confirm Docker -----
try {
  $dockerVersion = docker --version 2>&1
  $composeVersion = docker compose version 2>&1
  Write-Pass "Docker available: $dockerVersion"
} catch {
  Write-Blocked "Docker is not available. Install Docker Desktop and try again."
  Write-Info "After installing Docker Desktop, run: npm run verify:infrastructure"
  exit 1
}

# ----- 3. Docker compose config validation -----
try {
  docker compose config 2>&1 | Out-Null
  Write-Pass "docker compose config is valid"
} catch {
  Write-Fail "docker compose config validation failed"
}

# ----- 4. Start test infrastructure -----
try {
  Write-Info "Starting test infrastructure (postgres-test, redis-test)..."
  docker compose --profile test up -d postgres-test redis-test 2>&1
  $dockerStarted = $true
  Write-Pass "Test infrastructure containers starting"
} catch {
  Write-Fail "Failed to start test infrastructure"
  exit 1
}

# ----- 5. Wait for healthy containers -----
Write-Info "Waiting for containers to become healthy..."
$maxWait = 60
$waited = 0
$pgHealthy = $false
$redisHealthy = $false

while ($waited -lt $maxWait) {
  $pgStatus = docker inspect --format='{{.State.Health.Status}}' talentai-postgres-test 2>&1
  $redisStatus = docker inspect --format='{{.State.Health.Status}}' talentai-redis-test 2>&1

  if ($pgStatus -eq 'healthy') { $pgHealthy = $true }
  if ($redisStatus -eq 'healthy') { $redisHealthy = $true }

  if ($pgHealthy -and $redisHealthy) {
    Write-Pass "All containers healthy (${waited}s)"
    break
  }
  Start-Sleep -Seconds 2
  $waited += 2
}

if (-not $pgHealthy) { Write-Fail "PostgreSQL test container not healthy after ${maxWait}s" }
if (-not $redisHealthy) { Write-Fail "Redis test container not healthy after ${maxWait}s" }

# ----- 6. Prisma generate -----
try {
  $env:NODE_ENV = 'test'
  npx prisma generate 2>&1 | Out-Null
  Write-Pass "Prisma Client generated"
} catch {
  Write-Fail "Prisma generate failed"
}

# ----- 7. Prisma migration deploy -----
try {
  npx prisma migrate deploy 2>&1 | Out-Null
  Write-Pass "Prisma migration applied (initial_talentai_schema)"
} catch {
  Write-Fail "Prisma migration deploy failed"
}

# ----- 7b. Prisma seed -----
try {
  npx prisma db seed 2>&1 | Out-Null
  Write-Pass "Prisma seed completed (system roles, permissions, role-permission mappings)"
} catch {
  Write-Fail "Prisma seed failed"
}

# ----- 8. Start backend -----
try {
  $env:NODE_ENV = 'test'
  $env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/talentai_test?schema=public'
  $env:REDIS_HOST = 'localhost'
  $env:REDIS_PORT = '6380'
  $env:LOG_LEVEL = 'silent'

  $backendProcess = Start-Process -FilePath "node" -ArgumentList "dist/main" -PassThru -NoNewWindow
  Start-Sleep -Seconds 5
  Write-Pass "Backend process started (PID: $($backendProcess.Id))"
} catch {
  Write-Fail "Backend failed to start"
}

# ----- 9. Wait for health endpoint -----
Write-Info "Waiting for /api/v1/health/live..."
$healthWait = 30
$healthReady = $false
for ($i = 0; $i -lt $healthWait; $i += 2) {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/health/live' -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $healthReady = $true
      Write-Pass "Health endpoint responding (${i}s)"
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $healthReady) { Write-Fail "Health endpoint not ready after ${healthWait}s" }

# ----- 10. Verify all health endpoints -----
$endpoints = @(
  @{Path='/api/v1/health/live';   Expected=200},
  @{Path='/api/v1/health/ready';  Expected=200},
  @{Path='/api/v1/health';        Expected=200},
  @{Path='/api/v1/health/version'; Expected=200},
  @{Path='/api/v1/auth/me';        Expected=401}
)

foreach ($ep in $endpoints) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000$($ep.Path)" -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq $ep.Expected) {
      Write-Pass "$($ep.Path) → $($resp.StatusCode) (expected $($ep.Expected))"
    } else {
      Write-Fail "$($ep.Path) → $($resp.StatusCode) (expected $($ep.Expected))"
    }
  } catch {
    Write-Fail "$($ep.Path) → error: $_"
  }
}

# ----- 11. Run E2E tests (includes auth endpoints when infrastructure is available) -----
try {
  $env:NODE_ENV = 'test'
  $testResult = npx jest --config ./test/jest-e2e.json --forceExit 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Pass "E2E tests passed"
  } else {
    Write-Fail "E2E tests failed (exit code: $LASTEXITCODE)"
  }
} catch {
  Write-Fail "E2E tests could not run"
}

# ----- 12. Cleanup -----
if ($backendProcess -and -not $backendProcess.HasExited) {
  Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
  Write-Info "Backend process stopped"
}

if ($dockerStarted) {
  docker compose rm -f -s postgres-test redis-test 2>&1 | Out-Null
  Write-Info "Test infrastructure stopped (dev containers untouched)"
}

# ----- 13. Final result -----
Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "  INFRASTRUCTURE VERIFICATION PASSED" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
} else {
  Write-Host "========================================" -ForegroundColor Red
  Write-Host "  INFRASTRUCTURE VERIFICATION FAILED" -ForegroundColor Red
  Write-Host "========================================" -ForegroundColor Red
}

exit $exitCode
