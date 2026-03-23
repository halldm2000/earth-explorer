#!/usr/bin/env pwsh
# Worldscope Launcher -starts dev server + MCP server in one command
# Usage: .\worldscope.ps1 [start|stop|status]

param(
  [Parameter(Position=0)]
  [ValidateSet('start', 'stop', 'status', '')]
  [string]$Action = 'start'
)

$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = Get-Location }

function Write-Banner {
  Write-Host ""
  Write-Host "  ========================================" -ForegroundColor Cyan
  Write-Host "           W O R L D S C O P E           " -ForegroundColor Cyan
  Write-Host "     3D Globe Visualization Platform      " -ForegroundColor DarkCyan
  Write-Host "  ========================================" -ForegroundColor Cyan
  Write-Host ""
}

function Start-Worldscope {
  Write-Banner

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

  Write-Host "  Starting dev server..." -ForegroundColor Green
  $devJob = Start-Job -ScriptBlock {
    Set-Location $using:projectRoot
    npm run dev 2>&1
  }

  # Wait for dev server to be ready
  Start-Sleep -Seconds 3

  Write-Host "  Starting MCP server..." -ForegroundColor Green
  $mcpJob = Start-Job -ScriptBlock {
    Set-Location $using:projectRoot
    npm run mcp 2>&1
  }

  Start-Sleep -Seconds 2

  Write-Host ""
  Write-Host "  [OK] Dev server:  http://localhost:5173" -ForegroundColor Green
  Write-Host "  [OK] MCP server:  http://localhost:3002/mcp" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Keyboard shortcuts:" -ForegroundColor DarkGray
  Write-Host "    1/2/3  -2.5D / 2D / 3D view" -ForegroundColor DarkGray
  Write-Host "    P      -presentation mode" -ForegroundColor DarkGray
  Write-Host "    R      -reset camera" -ForegroundColor DarkGray
  Write-Host "    X      -extension catalog" -ForegroundColor DarkGray
  Write-Host "    L      -layer panel" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
  Write-Host ""

  # Stream dev server output
  try {
    while ($true) {
      $devOutput = Receive-Job -Job $devJob -ErrorAction SilentlyContinue
      if ($devOutput) { $devOutput | ForEach-Object { Write-Host "  [dev] $_" -ForegroundColor DarkGray } }

      $mcpOutput = Receive-Job -Job $mcpJob -ErrorAction SilentlyContinue
      if ($mcpOutput) { $mcpOutput | ForEach-Object { Write-Host "  [mcp] $_" -ForegroundColor DarkCyan } }

      Start-Sleep -Milliseconds 500
    }
  } finally {
    Write-Host ""
    Write-Host "  Stopping..." -ForegroundColor Yellow
    Stop-Job -Job $devJob -ErrorAction SilentlyContinue
    Stop-Job -Job $mcpJob -ErrorAction SilentlyContinue
    Remove-Job -Job $devJob -ErrorAction SilentlyContinue
    Remove-Job -Job $mcpJob -ErrorAction SilentlyContinue
    Write-Host "  [OK] Worldscope stopped" -ForegroundColor Green
  }
}

# Run
Start-Worldscope
