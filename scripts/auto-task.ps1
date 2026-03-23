<#
.SYNOPSIS
    Launch an autonomous Claude Code task with safety isolation.

.DESCRIPTION
    Runs Claude Code with full autonomy (no permission prompts) in one of
    three isolation modes:

    1. Docker (default, safest) — runs in a container, can't touch host filesystem
    2. Worktree — isolated git branch, shares filesystem but changes are reviewable
    3. NoWorktree — direct, no isolation (use for trusted quick fixes only)

.PARAMETER Task
    Detailed description of what Claude should accomplish.

.PARAMETER Branch
    Name for the worktree branch (default: auto-generated from timestamp).

.PARAMETER NoWorktree
    Run in the current directory instead of creating a worktree.
    Use for trusted quick fixes only.

.PARAMETER Docker
    Run inside a Docker container for full sandbox isolation (default if Docker available).

.PARAMETER NoDocker
    Force worktree mode even if Docker is available.

.PARAMETER Model
    Model to use (default: uses Claude Code's default).

.PARAMETER MaxTurns
    Maximum number of agentic turns (default: unlimited).

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Add entity clustering to fix ship tracker lockup"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Build Tron Mode theme" -NoDocker -Branch "tron-mode"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Fix the AppDock toolbar sync" -NoWorktree
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,

    [string]$Branch = "auto/$(Get-Date -Format 'yyyyMMdd-HHmmss')",

    [switch]$NoWorktree,

    [switch]$Docker,

    [switch]$NoDocker,

    [string]$Model,

    [int]$MaxTurns = 0
)

$projectRoot = "C:\Users\halld\Dropbox\WORK_NVIDIA\NV_PROJECTS\worldscope"
$worktreeBase = "$projectRoot\.claude\worktrees"

# Build the autonomous prompt with project context
$prompt = @"
You are working on the Worldscope project - a CesiumJS-based 3D globe platform.
Read CLAUDE.md for project conventions. Read PROJECT_STATE.md for current status.

TASK: $Task

INSTRUCTIONS:
- Read relevant source files before making changes
- Follow existing code patterns and conventions
- Run typecheck after changes if possible (npx tsc --noEmit)
- Commit your changes with a descriptive message when done
- If you encounter errors, debug and fix them - don't stop
- Be thorough but focused on the specific task
"@

# ── Require Docker unless explicitly opting out ──

$dockerAvailable = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

if (-not $NoWorktree -and -not $NoDocker) {
    if (-not $dockerAvailable) {
        Write-Host "`n[auto-task] ABORTED: Docker is not available." -ForegroundColor Red
        Write-Host "[auto-task] Autonomous tasks require Docker for safe sandboxed execution." -ForegroundColor Red
        Write-Host "[auto-task] Install Docker Desktop: https://docs.docker.com/desktop/" -ForegroundColor Yellow
        Write-Host "`n[auto-task] To bypass (UNSAFE - Claude can run any command on your system):" -ForegroundColor Yellow
        Write-Host "  .\scripts\auto-task.ps1 -NoDocker -Task `"...`"      # worktree isolation only" -ForegroundColor Gray
        Write-Host "  .\scripts\auto-task.ps1 -NoWorktree -Task `"...`"    # no isolation at all" -ForegroundColor Gray
        exit 1
    }
}

$useDocker = $dockerAvailable -and -not $NoDocker -and -not $NoWorktree

# ── Mode 1: Docker (safest) ──

if ($useDocker) {
    $imageName = "worldscope-task"

    # Build image if needed
    $imageExists = docker images -q $imageName 2>$null
    if (-not $imageExists) {
        Write-Host "[auto-task] Building Docker image..." -ForegroundColor Cyan
        docker build -f "$projectRoot\scripts\Dockerfile.auto-task" -t $imageName $projectRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[auto-task] ABORTED: Docker image build failed." -ForegroundColor Red
            Write-Host "[auto-task] Fix the Docker issue or use -NoDocker to bypass (unsafe)." -ForegroundColor Yellow
            exit 1
        }
    }

    if ($useDocker) {
        # Create worktree for Docker to work in (so changes are isolated)
        $worktreePath = "$worktreeBase\$($Branch -replace '/','-')"

        Push-Location $projectRoot
        git worktree add $worktreePath -b $Branch 2>&1 | Write-Host
        Pop-Location

        if ($LASTEXITCODE -ne 0) {
            Write-Host "[auto-task] Failed to create worktree" -ForegroundColor Red
            exit 1
        }

        Write-Host "`n[auto-task] DOCKER MODE (sandboxed)" -ForegroundColor Green
        Write-Host "[auto-task] Worktree: $worktreePath" -ForegroundColor Cyan
        Write-Host "[auto-task] Branch: $Branch" -ForegroundColor Cyan
        Write-Host "[auto-task] Task: $Task" -ForegroundColor Cyan
        Write-Host "[auto-task] Claude runs inside container - cannot access host filesystem`n" -ForegroundColor Green

        # Docker args
        $dockerArgs = @(
            "run", "--rm", "-it",
            # Mount worktree as workspace (read-write)
            "-v", "${worktreePath}:/workspace",
            # Mount node_modules read-only to avoid reinstall
            "-v", "${projectRoot}\node_modules:/workspace/node_modules:ro",
            # Pass API key
            "-e", "ANTHROPIC_API_KEY=$env:ANTHROPIC_API_KEY"
        )

        if ($Model) {
            $dockerArgs += @("-e", "CLAUDE_MODEL=$Model")
        }

        # Add the image and prompt
        $dockerArgs += @($imageName, $prompt)

        & docker @dockerArgs
        $exitCode = $LASTEXITCODE

        Write-Host "`n[auto-task] Claude exited with code $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

        # Show results
        Push-Location $worktreePath
        $changes = git status --short
        Pop-Location

        if ($changes) {
            Write-Host "`n[auto-task] Changes in worktree:" -ForegroundColor Yellow
            Write-Host $changes
            Write-Host "`n[auto-task] To review: cd $worktreePath" -ForegroundColor Cyan
            Write-Host "[auto-task] To merge:  cd $projectRoot && git merge $Branch" -ForegroundColor Cyan
            Write-Host "[auto-task] To discard: git worktree remove $worktreePath && git branch -D $Branch" -ForegroundColor Gray
        }
        else {
            Write-Host "`n[auto-task] No changes made. Cleaning up..." -ForegroundColor Gray
            Push-Location $projectRoot
            git worktree remove $worktreePath 2>&1 | Out-Null
            git branch -D $Branch 2>&1 | Out-Null
            Pop-Location
        }

        exit $exitCode
    }
}

# ── Mode 2: NoWorktree (direct, no isolation) ──

if ($NoWorktree) {
    Write-Host "`n[auto-task] DIRECT MODE (no isolation)" -ForegroundColor Yellow
    Write-Host "[auto-task] WARNING: Changes go directly to working tree" -ForegroundColor Yellow
    Write-Host "[auto-task] Task: $Task" -ForegroundColor Cyan
    Write-Host "[auto-task] Starting Claude Code...`n" -ForegroundColor Green

    $claudeArgs = @("-p", $prompt, "--dangerously-skip-permissions")
    if ($Model) { $claudeArgs += @("--model", $Model) }
    if ($MaxTurns -gt 0) { $claudeArgs += @("--max-turns", $MaxTurns) }

    Push-Location $projectRoot
    & claude @claudeArgs
    $exitCode = $LASTEXITCODE
    Pop-Location

    Write-Host "`n[auto-task] Claude exited with code $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
    exit $exitCode
}

# ── Mode 3: Worktree (isolated branch, shared filesystem) ──

$worktreePath = "$worktreeBase\$($Branch -replace '/','-')"

Write-Host "`n[auto-task] WORKTREE MODE (branch isolation)" -ForegroundColor Cyan
Write-Host "[auto-task] Worktree: $worktreePath" -ForegroundColor Cyan
Write-Host "[auto-task] Branch: $Branch" -ForegroundColor Cyan
Write-Host "[auto-task] Task: $Task" -ForegroundColor Cyan

Push-Location $projectRoot
git worktree add $worktreePath -b $Branch 2>&1 | Write-Host
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "[auto-task] Failed to create worktree" -ForegroundColor Red
    exit 1
}

# Symlink node_modules to avoid reinstall
if (Test-Path "$projectRoot\node_modules") {
    New-Item -ItemType Junction -Path "$worktreePath\node_modules" -Target "$projectRoot\node_modules" -Force | Out-Null
    Write-Host "[auto-task] Linked node_modules" -ForegroundColor Gray
}

$claudeArgs = @("-p", $prompt, "--dangerously-skip-permissions")
if ($Model) { $claudeArgs += @("--model", $Model) }
if ($MaxTurns -gt 0) { $claudeArgs += @("--max-turns", $MaxTurns) }

Write-Host "[auto-task] Starting Claude Code...`n" -ForegroundColor Green

Push-Location $worktreePath
& claude @claudeArgs
$exitCode = $LASTEXITCODE
Pop-Location

Write-Host "`n[auto-task] Claude exited with code $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

# Show what changed
Push-Location $worktreePath
$changes = git status --short
Pop-Location

if ($changes) {
    Write-Host "`n[auto-task] Changes in worktree:" -ForegroundColor Yellow
    Write-Host $changes
    Write-Host "`n[auto-task] To review: cd $worktreePath" -ForegroundColor Cyan
    Write-Host "[auto-task] To merge:  cd $projectRoot && git merge $Branch" -ForegroundColor Cyan
    Write-Host "[auto-task] To discard: git worktree remove $worktreePath && git branch -D $Branch" -ForegroundColor Gray
}
else {
    Write-Host "`n[auto-task] No changes made. Cleaning up worktree..." -ForegroundColor Gray
    Push-Location $projectRoot
    git worktree remove $worktreePath 2>&1 | Out-Null
    git branch -D $Branch 2>&1 | Out-Null
    Pop-Location
}
