#!/usr/bin/env pwsh
# Worldscope Launcher - starts dev server + MCP server in one command
# Usage: .\worldscope.ps1

$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = Get-Location }

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "           W O R L D S C O P E           " -ForegroundColor Cyan
Write-Host "     3D Globe Visualization Platform      " -ForegroundColor DarkCyan
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

# Check node_modules
if (-not (Test-Path "$projectRoot/node_modules/.package-lock.json")) {
  Write-Host "  Installing dependencies..." -ForegroundColor Yellow
  Push-Location $projectRoot
  npm install
  Pop-Location
}

# Set Dropbox ignore flags (Windows only)
if ($IsWindows -or $env:OS -eq 'Windows_NT') {
  try {
    Set-Content -Path "$projectRoot/node_modules" -Stream com.dropbox.ignored -Value 1 -ErrorAction SilentlyContinue
    Set-Content -Path "$projectRoot/.git" -Stream com.dropbox.ignored -Value 1 -ErrorAction SilentlyContinue
  } catch {}
}

# Start dev server as a separate process
Write-Host "  Starting dev server..." -ForegroundColor Green
$devProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -WorkingDirectory $projectRoot -PassThru -NoNewWindow -RedirectStandardOutput "$projectRoot/.dev-out.tmp" -RedirectStandardError "$projectRoot/.dev-err.tmp"

Start-Sleep -Seconds 3

# Start MCP server as a separate process
Write-Host "  Starting MCP server..." -ForegroundColor Green
$mcpProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run mcp" -WorkingDirectory $projectRoot -PassThru -NoNewWindow -RedirectStandardOutput "$projectRoot/.mcp-out.tmp" -RedirectStandardError "$projectRoot/.mcp-err.tmp"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "  [OK] Dev server:  http://localhost:5173  (PID $($devProc.Id))" -ForegroundColor Green
Write-Host "  [OK] MCP server:  http://localhost:3002/mcp  (PID $($mcpProc.Id))" -ForegroundColor Green
Write-Host ""
Write-Host "  Keyboard shortcuts:" -ForegroundColor DarkGray
Write-Host "    1/2/3  - 2.5D / 2D / 3D view" -ForegroundColor DarkGray
Write-Host "    P      - presentation mode" -ForegroundColor DarkGray
Write-Host "    R      - reset camera" -ForegroundColor DarkGray
Write-Host "    X      - extension catalog" -ForegroundColor DarkGray
Write-Host "    L      - layer panel" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host ""

# Tail the log files and handle Ctrl+C
try {
  while (-not $devProc.HasExited) {
    # Show recent dev output
    if (Test-Path "$projectRoot/.dev-out.tmp") {
      $content = Get-Content "$projectRoot/.dev-out.tmp" -Tail 5 -ErrorAction SilentlyContinue
      # We just keep the process alive, output goes to the temp files
    }
    Start-Sleep -Seconds 2
  }
} finally {
  Write-Host ""
  Write-Host "  Stopping servers..." -ForegroundColor Yellow

  # Kill process trees forcefully
  try {
    if (-not $devProc.HasExited) {
      Stop-Process -Id $devProc.Id -Force -ErrorAction SilentlyContinue
      # Also kill child processes (node, vite)
      Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $devProc.Id } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}

  try {
    if (-not $mcpProc.HasExited) {
      Stop-Process -Id $mcpProc.Id -Force -ErrorAction SilentlyContinue
      Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $mcpProc.Id } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}

  # Clean up temp files
  Remove-Item "$projectRoot/.dev-out.tmp" -ErrorAction SilentlyContinue
  Remove-Item "$projectRoot/.dev-err.tmp" -ErrorAction SilentlyContinue
  Remove-Item "$projectRoot/.mcp-out.tmp" -ErrorAction SilentlyContinue
  Remove-Item "$projectRoot/.mcp-err.tmp" -ErrorAction SilentlyContinue

  Write-Host "  [OK] Worldscope stopped" -ForegroundColor Green
}
