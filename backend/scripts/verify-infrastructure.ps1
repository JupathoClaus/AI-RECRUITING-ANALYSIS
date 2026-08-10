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
$VERIFY_PORT = 3100

. (Join-Path $PSScriptRoot 'verify-infra-backend.ps1')

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
  cmd /c "docker compose config >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "docker compose config exited with code $LASTEXITCODE" }
  Write-Pass "docker compose config is valid"
} catch {
  Write-Fail "docker compose config validation failed: $_"
}

# ----- 4. Start test infrastructure -----
try {
  Write-Info "Starting test infrastructure (postgres-test, redis-test)..."
  # Route through cmd /c so Docker's stderr progress lines cannot become
  # terminating error records under $ErrorActionPreference='Stop' (PS 5.1).
  cmd /c "docker compose --profile test up -d postgres-test redis-test >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "docker compose up exited with code $LASTEXITCODE" }
  $dockerStarted = $true
  Write-Pass "Test infrastructure containers starting"
} catch {
  Write-Fail "Failed to start test infrastructure: $_"
  exit 1
}

# ----- 5. Wait for healthy containers -----
Write-Info "Waiting for containers to become healthy..."
$maxWait = 60
$waited = 0
$pgHealthy = $false
$redisHealthy = $false

while ($waited -lt $maxWait) {
  $pgStatus = ''
  $redisStatus = ''
  try {
    $pgStatus = docker inspect --format='{{.State.Health.Status}}' talentai-postgres-test
    $redisStatus = docker inspect --format='{{.State.Health.Status}}' talentai-redis-test
  } catch {
    # Container not yet present - treat as not healthy
  }

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
  cmd /c "npx prisma generate >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "prisma generate exited with code $LASTEXITCODE" }
  Write-Pass "Prisma Client generated"
} catch {
  Write-Fail "Prisma generate failed: $_"
}

# ----- 7. Prisma migration deploy (must target the TEST database) -----
try {
  $env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/talentai_test?schema=public'
  cmd /c "npx prisma migrate deploy >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy exited with code $LASTEXITCODE" }
  Write-Pass "Prisma migration applied (initial_talentai_schema)"
} catch {
  Write-Fail "Prisma migration deploy failed: $_"
}

# ----- 7b. Prisma seed (system entities only, against the TEST database) -----
try {
  $env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/talentai_test?schema=public'
  cmd /c "npx ts-node prisma/seed.ts >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "prisma seed exited with code $LASTEXITCODE" }
  Write-Pass "Prisma seed completed (system roles, permissions, role-permission mappings)"
} catch {
  Write-Fail "Prisma seed failed: $_"
}

# ----- 8. Start backend (dedicated verification port, child-alive guarded) -----
try {
  $env:NODE_ENV = 'test'
  $env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/talentai_test?schema=public'
  $env:REDIS_HOST = 'localhost'
  $env:REDIS_PORT = '6380'
  $env:LOG_LEVEL = 'error'
  $env:APP_PORT = "$VERIFY_PORT"

  $backendProcess = Start-VerifyBackend -Port $VERIFY_PORT -Cwd $rootDir
  Write-Pass "Backend process started (PID: $($backendProcess.Id)) on port $VERIFY_PORT"
} catch {
  Write-Fail "Backend failed to start: $_"
  exit 1
}

# ----- 9. Wait for health endpoint (probe only the dedicated port) -----
Write-Info "Waiting for /api/v1/health/live on port $VERIFY_PORT..."
$healthReady = $false
try {
  $healthReady = Test-VerifyHealth -Port $VERIFY_PORT -Process $backendProcess -TimeoutSec 30
  if ($healthReady) { Write-Pass "Health endpoint responding (PID $($backendProcess.Id) on port $VERIFY_PORT)" }
} catch {
  Write-Fail "Health check failed: $_"
}
if (-not $healthReady) { Write-Fail "Health endpoint not ready after 30s (PID $($backendProcess.Id))" }

# ----- 10. Verify all health endpoints (dedicated port only) -----
$endpoints = @(
  @{Path='/api/v1/health/live';   Expected=200},
  @{Path='/api/v1/health/ready';  Expected=200},
  @{Path='/api/v1/health';        Expected=200},
  @{Path='/api/v1/health/version'; Expected=200},
  @{Path='/api/v1/auth/me';        Expected=401}
)

foreach ($ep in $endpoints) {
  $actual = -1
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$VERIFY_PORT$($ep.Path)" -UseBasicParsing -TimeoutSec 5
    $actual = [int]$resp.StatusCode
  } catch {
    # PS 5.1 throws on non-2xx responses; the expected status is still readable
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $actual = [int]$_.Exception.Response.StatusCode
    }
  }
  if ($actual -eq $ep.Expected) {
    Write-Pass "$($ep.Path) → $($actual) (expected $($ep.Expected))"
  } else {
    Write-Fail "$($ep.Path) → $($actual) (expected $($ep.Expected))"
  }
}

# ----- 11. Run E2E tests (includes auth endpoints when infrastructure is available) -----
try {
  $env:NODE_ENV = 'test'
  $env:NODE_OPTIONS = '--max-old-space-size=4096'
  cmd /c "npx jest --config ./test/jest-e2e.json --runInBand --detectOpenHandles 2>&1"
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
  cmd /c "docker compose rm -f -s postgres-test redis-test >nul 2>&1"
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
