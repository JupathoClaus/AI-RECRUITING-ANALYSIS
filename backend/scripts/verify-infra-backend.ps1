<#
.SYNOPSIS
  Shared backend-start + health-probe logic for infrastructure verification.
  Dot-source from verify-infrastructure.ps1 and infra-port-guard.test.ps1.
.DESCRIPTION
  The false-positive guard: the verification backend must run on a DEDICATED
  port (default 3100) and the health probe must be tied to the spawned child.
  A foreign service answering on the port must never produce a PASS:
    - the port must be free BEFORE spawning;
    - the child must be alive 800 ms after spawn (exit code reported);
    - the child must be alive during the whole health wait (exit code reported);
    - after first readiness, a 2 s grace period re-verifies child liveness.
#>
$ErrorActionPreference = 'Stop'

function Get-PortOwner {
  param([int]$Port)
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return $c.OwningProcess
  } catch {
    return $null
  }
}

function Assert-PortFree {
  param([int]$Port)
  $owner = Get-PortOwner -Port $Port
  $listening = $false
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    $listening = $task.Wait(500) -and $client.Connected
  } catch {} finally {
    $client.Dispose()
  }
  if ($owner -or $listening) {
    $detail = if ($owner) { " by PID $owner" } else { '' }
    throw "Port $Port is already in use$detail. Refusing to start the verification backend (false-positive guard)."
  }
}

function Start-VerifyBackend {
  param(
    [int]$Port = 3100,
    [string]$Cwd,
    [string]$EntryPoint = 'dist/src/main.js'
  )
  Assert-PortFree -Port $Port
  # Start-Process flattens ArgumentList to a command line on Windows. Quote the
  # entry point explicitly so workspace paths containing spaces remain one arg.
  $quotedEntryPoint = '"' + $EntryPoint.Replace('"', '\"') + '"'
  $p = Start-Process -FilePath "node" -ArgumentList $quotedEntryPoint, "$Port" -WorkingDirectory $Cwd -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 800
  if ($p.HasExited) {
    throw "Verification backend exited immediately after start (PID $($p.Id), exit code $($p.ExitCode)). Port $Port was free; inspect backend logs."
  }
  return $p
}

function Test-VerifyHealth {
  param(
    [int]$Port,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSec = 30
  )
  $base = "http://localhost:$Port"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $ready = $false
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if ($Process.HasExited) {
      throw "Verification backend died while waiting for health (PID $($Process.Id), exit code $($Process.ExitCode)) after $([math]::Round($sw.Elapsed.TotalSeconds, 1))s."
    }
    try {
      $r = Invoke-WebRequest -Uri "$base/api/v1/health/live" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { return $false }

  # Grace period: the child must STILL be alive and serving 200 after boot settle.
  Start-Sleep -Seconds 2
  if ($Process.HasExited) {
    throw "Verification backend exited during post-ready grace period (exit code $($Process.ExitCode))."
  }
  try {
    $r = Invoke-WebRequest -Uri "$base/api/v1/health/live" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { return $true }
  } catch {}
  return $false
}
