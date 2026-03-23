<#
.SYNOPSIS
    Launch an autonomous Claude Code task in an isolated git worktree.

.DESCRIPTION
    Creates a temporary git worktree, runs Claude Code with full autonomy
    (no permission prompts), and reports results. The worktree isolates
    changes so the main branch stays clean until you review and merge.

.PARAMETER Task
    Detailed description of what Claude should accomplish.

.PARAMETER Branch
    Name for the worktree branch (default: auto-generated from timestamp).

.PARAMETER NoWorktree
    Run in the current directory instead of creating a worktree.
    Use with caution - changes go directly to your working tree.

.PARAMETER Model
    Model to use (default: uses Claude Code's default).

.PARAMETER MaxTurns
    Maximum number of agentic turns (default: unlimited).

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Add entity clustering to the ships extension to fix UI lockup on dense AIS data"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Build a Tron Mode theme extension" -Branch "tron-mode"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Fix the AppDock toolbar sync" -NoWorktree
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,

    [string]$Branch = "auto/$(Get-Date -Format 'yyyyMMdd-HHmmss')",

    [switch]$NoWorktree,

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

# Build claude args
$claudeArgs = @("-p", $prompt, "--dangerously-skip-permissions")

if ($Model) {
    $claudeArgs += @("--model", $Model)
}

if ($MaxTurns -gt 0) {
    $claudeArgs += @("--max-turns", $MaxTurns)
}

if ($NoWorktree) {
    Write-Host "`n[auto-task] Running in main directory (no worktree)" -ForegroundColor Yellow
    Write-Host "[auto-task] Task: $Task" -ForegroundColor Cyan
    Write-Host "[auto-task] Starting Claude Code...`n" -ForegroundColor Green

    Push-Location $projectRoot
    & claude @claudeArgs
    $exitCode = $LASTEXITCODE
    Pop-Location

    Write-Host "`n[auto-task] Claude exited with code $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
}
else {
    # Create worktree
    $worktreePath = "$worktreeBase\$($Branch -replace '/','-')"

    Write-Host "`n[auto-task] Creating worktree: $worktreePath" -ForegroundColor Cyan
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
}
