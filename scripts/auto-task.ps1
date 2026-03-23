<#
.SYNOPSIS
    Launch an autonomous Claude Code task with safety isolation and quality review.

.DESCRIPTION
    Two-phase autonomous execution:
      Phase 1 (BUILD):  Claude implements the task with full autonomy
      Phase 2 (REVIEW): A separate Claude instance reviews the work against
                        success criteria, checks code quality, runs tests,
                        and produces a scorecard

    Runs in Docker by default for safety. Falls back to worktree isolation
    with explicit opt-in.

.PARAMETER Task
    Detailed description of what Claude should accomplish.

.PARAMETER Criteria
    Success criteria for the review phase. If omitted, Claude infers
    reasonable criteria from the task description.

.PARAMETER Branch
    Name for the worktree branch (default: auto-generated from timestamp).

.PARAMETER NoWorktree
    Run in the current directory instead of creating a worktree.

.PARAMETER NoDocker
    Force worktree mode even if Docker is available.

.PARAMETER SkipReview
    Skip the review phase (just build, no quality check).

.PARAMETER Model
    Model to use (default: uses Claude Code's default).

.PARAMETER MaxTurns
    Maximum number of agentic turns (default: unlimited).

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Add entity clustering to fix ship tracker lockup" `
        -Criteria "1. EntityCluster enabled on GeoJSON datasources 2. Ships don't freeze the UI 3. TypeScript compiles 4. No console errors"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Build Tron Mode theme" -Branch "tron-mode"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,

    [string]$Criteria = "",

    [string]$Branch = "auto/$(Get-Date -Format 'yyyyMMdd-HHmmss')",

    [switch]$NoWorktree,

    [switch]$NoDocker,

    [switch]$SkipReview,

    [string]$Model,

    [int]$MaxTurns = 0
)

$projectRoot = "C:\Users\halld\Dropbox\WORK_NVIDIA\NV_PROJECTS\worldscope"
$worktreeBase = "$projectRoot\.claude\worktrees"
$reportDir = "$projectRoot\scripts\reports"

# Ensure report directory exists
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportFile = "$reportDir\$timestamp-review.md"

# ── Phase 1 prompt: PLAN ──

$planPrompt = @"
You are a software architect working on the Worldscope project - a CesiumJS-based 3D globe platform.
Read CLAUDE.md for project conventions. Read CESIUM_CAPABILITIES.md for available CesiumJS APIs.

TASK: $Task

YOUR JOB: Think through this carefully and produce an implementation plan. Do NOT write any code yet.

1. UNDERSTAND THE CODEBASE
   - Read all files relevant to this task
   - Understand existing patterns, types, and conventions
   - Identify which files need to change and which are dependencies

2. DESIGN THE APPROACH
   - What is the simplest correct implementation?
   - What existing code can you reuse?
   - What are the edge cases and failure modes?
   - Are there performance implications?

3. WRITE THE PLAN
   Save a file called PLAN.md in the project root with:

   # Implementation Plan: [task name]

   ## Goal
   [1-2 sentence summary]

   ## Files to Change
   | File | Action | Description |
   |------|--------|-------------|
   | path/to/file | NEW/MODIFY | what changes |

   ## Approach
   [Step-by-step implementation, with key code snippets or API calls]

   ## Edge Cases
   [What could go wrong, how to handle it]

   ## Testing
   [How to verify this works - specific things to check]

   ## Estimated Complexity
   Low / Medium / High

Do NOT write implementation code. Only produce the plan.
"@

# ── Phase 2 prompt: BUILD ──

$buildPrompt = @"
You are working on the Worldscope project - a CesiumJS-based 3D globe platform.
Read CLAUDE.md for project conventions.

TASK: $Task

Read PLAN.md first - it contains the implementation plan you must follow.

INSTRUCTIONS:
- Follow the plan in PLAN.md step by step
- Read relevant source files before making changes
- Follow existing code patterns and conventions
- Run typecheck after changes: node node_modules/typescript/bin/tsc --noEmit
- Commit your changes with a descriptive message when done
- If you encounter errors, debug and fix them - don't stop
- Delete PLAN.md when done (it was a working document)
- Be thorough but focused on the specific task
"@

# ── Phase 2 prompt: REVIEW ──

$criteriaBlock = if ($Criteria) {
    "SUCCESS CRITERIA (provided by user):`n$Criteria"
} else {
    "SUCCESS CRITERIA: Infer reasonable criteria from the task description above."
}

$reviewPrompt = @"
You are a code reviewer for the Worldscope project (CesiumJS 3D globe platform).
Read CLAUDE.md for project conventions.

A developer just completed this task:
TASK: $Task

$criteriaBlock

YOUR JOB: Review the work and produce a scorecard. Do ALL of the following:

1. EXAMINE THE CHANGES
   - Run: git log --oneline -5
   - Run: git diff HEAD~1 --stat
   - Read every changed file

2. CODE QUALITY CHECK
   - Does the code follow existing patterns in the codebase?
   - Are there any obvious bugs, race conditions, or edge cases?
   - Is error handling adequate?
   - Are there magic numbers or missing constants?
   - Is the code well-commented where non-obvious?

3. TYPE SAFETY
   - Run: node node_modules/typescript/bin/tsc --noEmit
   - Report any new type errors introduced by the changes

4. COMPLETENESS
   - Does the implementation fully address the task?
   - Are there missing edge cases or TODOs left behind?
   - Were all success criteria met?

5. PERFORMANCE
   - Are there any obvious performance issues?
   - For rendering code: does it respect the 16ms frame budget?
   - Are there unnecessary allocations in hot paths?

6. PRODUCE SCORECARD
   Write a markdown report with this structure:

   # Auto-Task Review: [short task name]
   Date: [timestamp]
   Branch: [branch name]

   ## Task
   [original task description]

   ## Changes
   [list of files changed with brief description]

   ## Scorecard

   | Category | Score | Notes |
   |----------|-------|-------|
   | Completeness | PASS/PARTIAL/FAIL | [details] |
   | Code Quality | PASS/PARTIAL/FAIL | [details] |
   | Type Safety | PASS/FAIL | [tsc output summary] |
   | Performance | PASS/CONCERN/FAIL | [details] |
   | Patterns | PASS/PARTIAL/FAIL | [follows codebase conventions?] |

   ## Issues Found
   [numbered list, or "None"]

   ## Verdict
   **PASS** / **PASS WITH NOTES** / **NEEDS WORK**
   [1-2 sentence summary]

Write this scorecard to: $reportFile
"@

# ── Require Docker unless explicitly opting out ──

$dockerAvailable = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

if (-not $NoWorktree -and -not $NoDocker) {
    if (-not $dockerAvailable) {
        Write-Host "`n[auto-task] ABORTED: Docker is not available." -ForegroundColor Red
        Write-Host "[auto-task] Autonomous tasks require Docker for safe sandboxed execution." -ForegroundColor Red
        Write-Host "[auto-task] Install Docker Desktop: https://docs.docker.com/desktop/" -ForegroundColor Yellow
        Write-Host "`n[auto-task] To bypass (UNSAFE):" -ForegroundColor Yellow
        Write-Host "  -NoDocker    worktree isolation only" -ForegroundColor Gray
        Write-Host "  -NoWorktree  no isolation at all" -ForegroundColor Gray
        exit 1
    }
}

$useDocker = $dockerAvailable -and -not $NoDocker -and -not $NoWorktree

# ── Helper: run Claude in the given directory ──

function Invoke-Claude {
    param([string]$Prompt, [string]$WorkDir, [string]$Phase)

    $claudeArgs = @("-p", $Prompt, "--dangerously-skip-permissions")
    if ($Model) { $claudeArgs += @("--model", $Model) }
    if ($MaxTurns -gt 0 -and $Phase -eq "BUILD") { $claudeArgs += @("--max-turns", $MaxTurns) }

    Push-Location $WorkDir
    & claude @claudeArgs
    $script:lastExit = $LASTEXITCODE
    Pop-Location
}

function Invoke-ClaudeDocker {
    param([string]$Prompt, [string]$WorktreePath, [string]$Phase)

    $dockerArgs = @(
        "run", "--rm", "-i",
        "-v", "${WorktreePath}:/workspace",
        "-v", "${projectRoot}\node_modules:/workspace/node_modules:ro",
        "-e", "ANTHROPIC_API_KEY=$env:ANTHROPIC_API_KEY"
    )
    if ($Model) { $dockerArgs += @("-e", "CLAUDE_MODEL=$Model") }

    # Mount reports dir for review phase
    if ($Phase -eq "REVIEW") {
        $dockerArgs += @("-v", "${reportDir}:/workspace/scripts/reports")
    }

    $dockerArgs += @("worldscope-task", $Prompt)

    & docker @dockerArgs
    $script:lastExit = $LASTEXITCODE
}

# ── Setup worktree ──

$worktreePath = "$worktreeBase\$($Branch -replace '/','-')"

if (-not $NoWorktree) {
    Push-Location $projectRoot
    git worktree add $worktreePath -b $Branch 2>&1 | Write-Host
    Pop-Location

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[auto-task] Failed to create worktree" -ForegroundColor Red
        exit 1
    }

    # Symlink node_modules
    if (-not $useDocker -and (Test-Path "$projectRoot\node_modules")) {
        New-Item -ItemType Junction -Path "$worktreePath\node_modules" -Target "$projectRoot\node_modules" -Force | Out-Null
    }
}

$workDir = if ($NoWorktree) { $projectRoot } else { $worktreePath }
$modeLabel = if ($useDocker) { "DOCKER (sandboxed)" } elseif ($NoWorktree) { "DIRECT (no isolation)" } else { "WORKTREE (branch isolation)" }

# ── Ensure Docker image exists ──

if ($useDocker) {
    $imageExists = docker images -q worldscope-task 2>$null
    if (-not $imageExists) {
        Write-Host "[auto-task] Building Docker image..." -ForegroundColor Cyan
        docker build -f "$projectRoot\scripts\Dockerfile.auto-task" -t worldscope-task $projectRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[auto-task] ABORTED: Docker build failed." -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "`n[auto-task] Mode: $modeLabel" -ForegroundColor Green
Write-Host "[auto-task] Task: $Task" -ForegroundColor White
if ($Criteria) { Write-Host "[auto-task] Criteria: $Criteria" -ForegroundColor Gray }

# ── Phase 1: PLAN ──

Write-Host "`n+==========================================+" -ForegroundColor Yellow
Write-Host "|  PHASE 1: PLAN                           |" -ForegroundColor Yellow
Write-Host "+==========================================+" -ForegroundColor Yellow
Write-Host "[auto-task] Analyzing codebase and designing approach...`n" -ForegroundColor White

if ($useDocker) {
    Invoke-ClaudeDocker -Prompt $planPrompt -WorktreePath $workDir -Phase "PLAN"
} else {
    Invoke-Claude -Prompt $planPrompt -WorkDir $workDir -Phase "PLAN"
}

$planExit = $script:lastExit
Write-Host "`n[auto-task] Plan phase exited with code $planExit" -ForegroundColor $(if ($planExit -eq 0) { "Green" } else { "Red" })

# Show plan if it exists
$planFile = Join-Path $workDir "PLAN.md"
if (Test-Path $planFile) {
    Write-Host "`n-- PLAN --" -ForegroundColor Yellow
    Get-Content $planFile | Write-Host
    Write-Host "-- END PLAN --`n" -ForegroundColor Yellow
}

# ── Phase 2: BUILD ──

Write-Host "`n+==========================================+" -ForegroundColor Cyan
Write-Host "|  PHASE 2: BUILD                          |" -ForegroundColor Cyan
Write-Host "+==========================================+" -ForegroundColor Cyan
Write-Host "[auto-task] Implementing plan...`n" -ForegroundColor White

if ($useDocker) {
    Invoke-ClaudeDocker -Prompt $buildPrompt -WorktreePath $workDir -Phase "BUILD"
} else {
    Invoke-Claude -Prompt $buildPrompt -WorkDir $workDir -Phase "BUILD"
}

$buildExit = $script:lastExit
Write-Host "`n[auto-task] Build phase exited with code $buildExit" -ForegroundColor $(if ($buildExit -eq 0) { "Green" } else { "Red" })

# Show what changed
if (-not $NoWorktree) {
    Push-Location $worktreePath
    $changes = git status --short
    $diffStat = git diff HEAD~1 --stat 2>$null
    Pop-Location

    if ($changes) {
        Write-Host "`n[auto-task] Uncommitted changes:" -ForegroundColor Yellow
        Write-Host $changes
    }
    if ($diffStat) {
        Write-Host "`n[auto-task] Committed changes:" -ForegroundColor Cyan
        Write-Host $diffStat
    }
}

# ── Phase 2: REVIEW ──

if (-not $SkipReview) {
    Write-Host "`n+==========================================+" -ForegroundColor Magenta
    Write-Host "|  PHASE 3: REVIEW                         |" -ForegroundColor Magenta
    Write-Host "+==========================================+" -ForegroundColor Magenta
    Write-Host "[auto-task] Reviewing work quality...`n" -ForegroundColor White

    if ($useDocker) {
        Invoke-ClaudeDocker -Prompt $reviewPrompt -WorktreePath $workDir -Phase "REVIEW"
    } else {
        Invoke-Claude -Prompt $reviewPrompt -WorkDir $workDir -Phase "REVIEW"
    }

    $reviewExit = $script:lastExit
    Write-Host "`n[auto-task] Review phase exited with code $reviewExit" -ForegroundColor $(if ($reviewExit -eq 0) { "Green" } else { "Red" })

    # Display the scorecard
    if (Test-Path $reportFile) {
        Write-Host "`n===========================================" -ForegroundColor Magenta
        Write-Host "  SCORECARD" -ForegroundColor Magenta
        Write-Host "===========================================" -ForegroundColor Magenta
        Get-Content $reportFile | Write-Host
        Write-Host "===========================================`n" -ForegroundColor Magenta
        Write-Host "[auto-task] Full report: $reportFile" -ForegroundColor Gray
    } else {
        Write-Host "[auto-task] Warning: review report not found at $reportFile" -ForegroundColor Yellow
    }
}

# ── Summary ──

Write-Host "`n[auto-task] === COMPLETE ===" -ForegroundColor Green

if (-not $NoWorktree) {
    Write-Host ('[auto-task] To review code: cd ' + $worktreePath) -ForegroundColor Cyan
    Write-Host ('[auto-task] To merge:       cd ' + $projectRoot + '; git merge ' + $Branch) -ForegroundColor Cyan
    Write-Host ('[auto-task] To discard:     git worktree remove ' + $worktreePath + '; git branch -D ' + $Branch) -ForegroundColor Gray
}
