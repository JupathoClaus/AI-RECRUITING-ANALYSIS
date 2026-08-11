<#
.SYNOPSIS
  Regression test: an existing service on the verification port cannot cause
  a false PASS in verify-infrastructure.ps1's backend health phase.
.DESCRIPTION
  Deterministic reproduction of the reported false-positive risk:
    Scenario A - foreign service occupies the port; the backend child exits
                 immediately (simulated EADDRINUSE). A naive port-only probe
                 would PASS; the guarded logic must FAIL and report the exit
                 code.
    Scenario B - free port + healthy child: guarded logic PASSes.
    Scenario C - child serves 200 then crashes during the post-ready grace
                 window: guarded logic must FAIL (no false pass).
  Exit code 0 = guard works as intended.
#>
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'verify-infra-backend.ps1')

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

$PORT = Get-FreeTcpPort
$passed = 0
$failed = 0

function Write-CasePass {
  param([string]$Name)
  Write-Host "[PASS] $Name" -ForegroundColor Green
  $script:passed++
}
function Write-CaseFail {
  param([string]$Name, [string]$Detail)
  Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red
  $script:failed++
}

function Stop-Tree {
  param([System.Diagnostics.Process]$Process)
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

function Free-Port {
  $owner = Get-PortOwner -Port $PORT
  if ($owner) { throw "Test port $PORT is unexpectedly occupied by PID $owner; refusing to kill an unrelated process." }
}

# Naive port-only probe (the OLD risky behavior): polls the port without any
# child-alive check. Used to demonstrate the false-pass the guard prevents.
function Invoke-NaivePortProbe {
  param([int]$Port)
  for ($i = 0; $i -lt 15; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/v1/health/live" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 300
  }
  return $false
}

Write-Host "=== Infra port-guard regression test (port $PORT) ==="

# ── Scenario A: foreign service on the port + backend child that exits ──
Write-Host "`n[1/3] Scenario A: foreign service occupies port; backend child exits immediately"
Free-Port
$foreign = Start-Process -FilePath "node" -ArgumentList "`"$(Join-Path $here 'fake-foreign-server.js')`"", "$PORT" -PassThru -NoNewWindow
Start-Sleep -Milliseconds 1200

$naiveA = Invoke-NaivePortProbe -Port $PORT
Write-Host "  naive port-only probe against foreign service: $(if ($naiveA) { '200 - would falsely PASS' } else { 'no response' })"
if (-not $naiveA) { Write-CaseFail 'A' 'foreign service did not answer; test environment broken'; Stop-Tree $foreign; exit 1 }

$exitProbe = $null
$guardThrew = $null
try {
  # Assert-PortFree should fire here (foreign service owns the port). If it
  # did not, the child would spawn, hit EADDRINUSE, exit - and the spawn
  # alive-check must catch that instead. Either guard must reject.
  $exitProbe = Start-VerifyBackend -Port $PORT -Cwd $here -EntryPoint (Join-Path $here 'fake-backend-exit.js')
  $guardThrew = 'no throw - BAD: would have probed the foreign service'
} catch {
  $guardThrew = $_.Exception.Message
}
Stop-Tree $exitProbe
if ($guardThrew -like "Port $PORT is already in use*") {
  Write-CasePass 'A' "guard rejected the occupied port (naive probe would have passed): $guardThrew"
} else {
  Write-CaseFail 'A' "guard did not reject: $guardThrew"
}

# ── Scenario B: free port + healthy child → guarded PASS ──
Write-Host "`n[2/3] Scenario B: free port + healthy child"
Stop-Tree $foreign
Free-Port
$healthy = $null
$healthOk = $false
try {
  $healthy = Start-VerifyBackend -Port $PORT -Cwd $here -EntryPoint (Join-Path $here 'fake-backend-ok.js')
  $healthOk = Test-VerifyHealth -Port $PORT -Process $healthy -TimeoutSec 10
} catch {
  Write-CaseFail 'B' $_.Exception.Message
}
Stop-Tree $healthy
if ($healthOk) {
  Write-CasePass 'B' 'healthy child reported ready and stayed alive'
} else {
  Write-CaseFail 'B' 'healthy child did not pass the guarded health check'
}

# ── Scenario C: child serves 200 then crashes during the grace window ──
Write-Host "`n[3/3] Scenario C: child crashes during post-ready grace window"
Free-Port
$crashy = $null
$cThrew = $null
try {
  $crashy = Start-VerifyBackend -Port $PORT -Cwd $here -EntryPoint (Join-Path $here 'fake-backend-crash.js')
  $cOk = Test-VerifyHealth -Port $PORT -Process $crashy -TimeoutSec 10
  $cThrew = "no throw - returned $cOk - BAD: false pass despite child death"
} catch {
  $cThrew = $_.Exception.Message
}
Stop-Tree $crashy
if ($cThrew -like 'Verification backend exited during post-ready grace period*') {
  Write-CasePass 'C' "guard detected the child death: $cThrew"
} else {
  Write-CaseFail 'C' $cThrew
}

Free-Port
Write-Host ""
Write-Host "=== Summary: $passed passed, $failed failed ==="
if ($failed -gt 0) { exit 1 } else { exit 0 }
