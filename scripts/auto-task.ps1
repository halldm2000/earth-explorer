<#
.SYNOPSIS
    Launch an autonomous Claude Code task with Docker sandboxing, quality review, and auto-fix.

.DESCRIPTION
    Four-phase autonomous execution with safety, quality, and observability:
      Phase 1 (PLAN):   Claude analyzes codebase, writes implementation plan
      Phase 2 (BUILD):  Claude follows the plan, implements, typechecks, commits
      Phase 3 (REVIEW): Separate Claude reviews work, produces scorecard
      Phase 4 (FIX):    If review says NEEDS WORK, Claude fixes issues (up to N retries)

    Safety: Docker sandbox (non-root, resource-limited, network-restricted)
    Quality: Baseline typecheck, diff size guard, pass/fail scorecard
    Observability: Per-phase timing, log files, history CSV, desktop notifications

.PARAMETER Task
    Detailed description of what Claude should accomplish.

.PARAMETER Criteria
    Success criteria for review. If omitted, Claude infers from task.

.PARAMETER Branch
    Branch name (default: auto-timestamped).

.PARAMETER NoDocker
    Skip Docker, use worktree only (unsafe).

.PARAMETER NoWorktree
    Run directly in working tree (most unsafe).

.PARAMETER SkipReview
    Skip review and fix phases.

.PARAMETER AutoMerge
    If review verdict is PASS, merge automatically.

.PARAMETER MaxFixes
    Max fix iterations if review says NEEDS WORK (default: 2).

.PARAMETER Model
    Model override.

.PARAMETER MaxTurns
    Max agentic turns for BUILD phase (default: unlimited).

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Add entity clustering" -Criteria "1. Clustering enabled 2. TypeScript compiles"

.EXAMPLE
    .\scripts\auto-task.ps1 -Task "Build Tron Mode" -AutoMerge -Branch "tron-mode"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,

    [string]$Criteria = "",
    [string]$Branch = "auto/$(Get-Date -Format 'yyyyMMdd-HHmmss')",
    [switch]$NoDocker,
    [switch]$NoWorktree,
    [switch]$SkipReview,
    [switch]$AutoMerge,
    [int]$MaxFixes = 2,
    [string]$Model,
    [int]$MaxTurns = 0
)

# ── Configuration ──

$projectRoot = "C:\Users\halld\Dropbox\WORK_NVIDIA\NV_PROJECTS\worldscope"
$worktreeBase = "$projectRoot\.claude\worktrees"
$reportDir = "$projectRoot\scripts\reports"
$historyFile = "$reportDir\history.csv"
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportFile = "$reportDir\$timestamp-review.md"
$logFile = "$reportDir\$timestamp-log.txt"
$branchSafe = $Branch -replace '/','-'

# Phase turn limits (prevent infinite loops)
$planMaxTurns = 30
$reviewMaxTurns = 30
$fixMaxTurns = 40

# Diff guard thresholds
$maxFilesChanged = 20
$maxLinesChanged = 2000

# Docker resource limits
$dockerMemory = "4g"
$dockerCpus = "2"

# ── Setup ──

if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

# Initialize history CSV if needed
if (-not (Test-Path $historyFile)) {
    "timestamp,branch,task,verdict,plan_sec,build_sec,review_sec,fix_sec,files_changed,lines_changed" | Out-File -FilePath $historyFile -Encoding utf8
}

# Log helper
function Log {
    param([string]$Msg, [string]$Color = "White")
    $line = "$(Get-Date -Format 'HH:mm:ss') $Msg"
    Write-Host $line -ForegroundColor $Color
    $line | Out-File -FilePath $logFile -Append -Encoding utf8
}

# Timer helper
function Measure-Phase {
    param([scriptblock]$Block)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $Block
    $sw.Stop()
    return [math]::Round($sw.Elapsed.TotalSeconds, 1)
}

# Desktop notification (Windows toast)
function Send-Notification {
    param([string]$Title, [string]$Body)
    try {
        [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.BalloonTipTitle = $Title
        $notify.BalloonTipText = $Body
        $notify.Visible = $true
        $notify.ShowBalloonTip(10000)
        Start-Sleep -Milliseconds 500
        $notify.Dispose()
    } catch {
        # Notifications are best-effort
    }
}

# ── Prompts ──

$planPrompt = @'
You are a software architect working on the Worldscope project - a CesiumJS-based 3D globe platform.
Read CLAUDE.md for project conventions. Read CESIUM_CAPABILITIES.md for available CesiumJS APIs.

TASK: {TASK}

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
'@ -replace '\{TASK\}', $Task

$buildPrompt = @'
You are working on the Worldscope project - a CesiumJS-based 3D globe platform.
Read CLAUDE.md for project conventions.

TASK: {TASK}

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
'@ -replace '\{TASK\}', $Task

$criteriaBlock = if ($Criteria) {
    "SUCCESS CRITERIA (provided by user):`n$Criteria"
} else {
    "SUCCESS CRITERIA: Infer reasonable criteria from the task description above."
}

$reviewPrompt = @'
You are a code reviewer for the Worldscope project (CesiumJS 3D globe platform).
Read CLAUDE.md for project conventions.

A developer just completed this task:
TASK: {TASK}

{CRITERIA}

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
   Write a markdown report to {REPORT_FILE} with this structure:

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
'@ -replace '\{TASK\}', $Task -replace '\{CRITERIA\}', $criteriaBlock -replace '\{REPORT_FILE\}', $reportFile

$fixPromptTemplate = @'
You are working on the Worldscope project. A code review found issues with your previous work.

ORIGINAL TASK: {TASK}

REVIEW SCORECARD:
{SCORECARD}

Fix ALL issues listed in the review. Then:
1. Run typecheck: node node_modules/typescript/bin/tsc --noEmit
2. Commit your fixes with a message starting with "fix: "
3. Do not introduce new features - only fix the reported issues
'@ -replace '\{TASK\}', $Task

# ── Docker check ──

$dockerAvailable = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

if (-not $NoWorktree -and -not $NoDocker) {
    if (-not $dockerAvailable) {
        Log "ABORTED: Docker is not available." "Red"
        Log "Autonomous tasks require Docker for safe sandboxed execution." "Red"
        Log "Install Docker Desktop: https://docs.docker.com/desktop/" "Yellow"
        Log "To bypass (UNSAFE): use -NoDocker or -NoWorktree" "Yellow"
        exit 1
    }
    # Verify daemon is running
    $daemonOk = docker info 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log "ABORTED: Docker daemon is not running. Start Docker Desktop first." "Red"
        exit 1
    }
}

$useDocker = $dockerAvailable -and -not $NoDocker -and -not $NoWorktree

# ── Helpers ──

function Invoke-Claude {
    param([string]$Prompt, [string]$WorkDir, [int]$Turns = 0)

    $claudeArgs = @("-p", $Prompt, "--dangerously-skip-permissions")
    if ($Model) { $claudeArgs += @("--model", $Model) }
    if ($Turns -gt 0) { $claudeArgs += @("--max-turns", $Turns) }

    Push-Location $WorkDir
    # Run claude and capture output to file + console
    # Use a temp file to avoid Tee-Object clobbering $LASTEXITCODE
    $tempOut = [System.IO.Path]::GetTempFileName()
    & claude @claudeArgs 2>&1 > $tempOut
    $script:lastExit = $LASTEXITCODE
    Get-Content $tempOut | Tee-Object -FilePath $logFile -Append
    Remove-Item $tempOut -ErrorAction SilentlyContinue
    Pop-Location
}

function Invoke-ClaudeDocker {
    param([string]$Prompt, [string]$WorktreePath, [string]$Phase, [int]$Turns = 0)

    $claudeHome = Join-Path $env:USERPROFILE ".claude"
    $claudeJson = Join-Path $env:USERPROFILE ".claude.json"

    # Copy host .claude dir to a temp location so container has a writable copy
    # (mounting read-only prevents Claude Code from creating session-env, etc.)
    $claudeTemp = Join-Path ([System.IO.Path]::GetTempPath()) "worldscope-claude-$timestamp"
    if (-not (Test-Path $claudeTemp)) {
        Copy-Item -Path $claudeHome -Destination $claudeTemp -Recurse -Force
    }
    # Also copy .claude.json
    $claudeJsonTemp = Join-Path $claudeTemp ".claude.json"
    Copy-Item -Path $claudeJson -Destination $claudeJsonTemp -Force

    $dockerArgs = @(
        "run", "--rm",
        # Resource limits
        "--memory", $dockerMemory,
        "--cpus", $dockerCpus,
        # Mount workspace
        "-v", "${WorktreePath}:/workspace",
        "-v", "${projectRoot}\node_modules:/workspace/node_modules:ro",
        # Auth — writable copy so Claude Code can create session-env, shell-snapshots, etc.
        "-v", "${claudeTemp}:/home/claude/.claude",
        "-v", "${claudeJsonTemp}:/home/claude/.claude.json",
        "-e", "ANTHROPIC_API_KEY=$env:ANTHROPIC_API_KEY"
    )

    if ($Model) { $dockerArgs += @("-e", "CLAUDE_MODEL=$Model") }

    # Mount reports dir for review/fix phases
    if ($Phase -eq "REVIEW" -or $Phase -eq "FIX") {
        $dockerArgs += @("-v", "${reportDir}:/workspace/scripts/reports")
    }

    # Build claude args (appended after image name via entrypoint)
    $claudeExtraArgs = @($Prompt)
    if ($Turns -gt 0) { $claudeExtraArgs = @("--max-turns", $Turns, $Prompt) }

    # Entrypoint is: claude -p --dangerously-skip-permissions
    # We pass extra args: [--max-turns N] "prompt"
    $dockerArgs += @("worldscope-task") + $claudeExtraArgs

    # Capture exit code before piping
    $tempOut = [System.IO.Path]::GetTempFileName()
    & docker @dockerArgs 2>&1 > $tempOut
    $script:lastExit = $LASTEXITCODE
    Get-Content $tempOut | Tee-Object -FilePath $logFile -Append
    Remove-Item $tempOut -ErrorAction SilentlyContinue
}

function Run-Phase {
    param([string]$Prompt, [string]$Phase, [int]$Turns = 0)

    if ($useDocker) {
        Invoke-ClaudeDocker -Prompt $Prompt -WorktreePath $workDir -Phase $Phase -Turns $Turns
    } else {
        Invoke-Claude -Prompt $Prompt -WorkDir $workDir -Turns $Turns
    }
    # Exit code is in $script:lastExit (set by Invoke-Claude/Docker)
}

function Get-DiffStats {
    param([string]$Dir)
    Push-Location $Dir
    $stat = git diff HEAD~1 --stat 2>$null
    $filesChanged = 0
    $linesChanged = 0
    if ($stat) {
        $summaryLine = $stat | Select-Object -Last 1
        if ($summaryLine -match '(\d+) file') { $filesChanged = [int]$Matches[1] }
        if ($summaryLine -match '(\d+) insertion') { $linesChanged += [int]$Matches[1] }
        if ($summaryLine -match '(\d+) deletion') { $linesChanged += [int]$Matches[1] }
    }
    Pop-Location
    return @{ Files = $filesChanged; Lines = $linesChanged }
}

# ── Setup worktree ──

$worktreePath = "$worktreeBase\$branchSafe"

if (-not $NoWorktree) {
    Push-Location $projectRoot
    git worktree add $worktreePath -b $Branch 2>&1 | ForEach-Object { Log $_ "Gray" }
    Pop-Location

    if ($LASTEXITCODE -ne 0) {
        Log "Failed to create worktree" "Red"
        exit 1
    }

    # Symlink node_modules for non-Docker mode
    # Use a junction so the worktree can find dependencies without npm install
    if (-not $useDocker -and (Test-Path "$projectRoot\node_modules")) {
        New-Item -ItemType Junction -Path "$worktreePath\node_modules" -Target "$projectRoot\node_modules" -Force | Out-Null
        # Re-set Dropbox ignore flag (junction creation can reset it)
        powershell -Command "Set-Content -Path '$projectRoot\node_modules' -Stream com.dropbox.ignored -Value 1" 2>$null
    }
}

$workDir = if ($NoWorktree) { $projectRoot } else { $worktreePath }
$modeLabel = if ($useDocker) { "DOCKER (sandboxed, ${dockerMemory} RAM, ${dockerCpus} CPUs)" } elseif ($NoWorktree) { "DIRECT (no isolation)" } else { "WORKTREE (branch isolation)" }

# Ensure Docker image exists
if ($useDocker) {
    $imageExists = docker images -q worldscope-task 2>$null
    if (-not $imageExists) {
        Log "Building Docker image..." "Cyan"
        docker build -f "$projectRoot\scripts\Dockerfile.auto-task" -t worldscope-task $projectRoot 2>&1 | ForEach-Object { Log $_ "Gray" }
        if ($LASTEXITCODE -ne 0) {
            Log "ABORTED: Docker build failed." "Red"
            exit 1
        }
    }
}

# Tracking variables
$planSec = 0; $buildSec = 0; $reviewSec = 0; $fixSec = 0
$verdict = "SKIPPED"
$diffFiles = 0; $diffLines = 0

Log "" "White"
Log "================================================================" "Cyan"
Log "  AUTO-TASK: $Task" "White"
Log "  Mode: $modeLabel" "Green"
Log "  Branch: $Branch" "Cyan"
if ($Criteria) { Log "  Criteria: $Criteria" "Gray" }
Log "  Log: $logFile" "Gray"
Log "================================================================" "Cyan"

# ══════════════════════════════════════════
#  PHASE 1: PLAN
# ══════════════════════════════════════════

Log "" "White"
Log "+==========================================+" "Yellow"
Log "|  PHASE 1: PLAN                           |" "Yellow"
Log "+==========================================+" "Yellow"
Log "Analyzing codebase and designing approach..." "White"

$planSec = Measure-Phase {
    Run-Phase -Prompt $planPrompt -Phase "PLAN" -Turns $planMaxTurns
}
$planExit = $script:lastExit

Log "Plan phase: ${planSec}s, exit code $planExit" $(if ($planExit -eq 0) { "Green" } else { "Red" })

# Check for PLAN.md in the worktree
$planFile = Join-Path $workDir "PLAN.md"

# Show plan
if (Test-Path $planFile) {
    Log "" "Yellow"
    Log "-- PLAN --" "Yellow"
    Get-Content $planFile | ForEach-Object { Log $_ "Gray" }
    Log "-- END PLAN --" "Yellow"
}

# Gate: if plan failed, abort (also check if PLAN.md exists as success signal)
if ($planExit -ne 0 -and -not (Test-Path $planFile)) {
    Log "ABORTED: Plan phase failed (no PLAN.md produced). Not proceeding to build." "Red"
    Send-Notification "Auto-Task Failed" "Plan phase failed for: $Task"

    # Record in history
    "$timestamp,$branchSafe,`"$Task`",PLAN_FAILED,$planSec,0,0,0,0,0" | Out-File -FilePath $historyFile -Append -Encoding utf8
    exit 1
}

# ══════════════════════════════════════════
#  PHASE 2: BUILD
# ══════════════════════════════════════════

Log "" "White"
Log "+==========================================+" "Cyan"
Log "|  PHASE 2: BUILD                          |" "Cyan"
Log "+==========================================+" "Cyan"
Log "Implementing plan..." "White"

$buildSec = Measure-Phase {
    Run-Phase -Prompt $buildPrompt -Phase "BUILD" -Turns $MaxTurns
}
$buildExit = $script:lastExit

Log "Build phase: ${buildSec}s, exit code $buildExit" $(if ($buildExit -eq 0) { "Green" } else { "Red" })

# Diff size guard
if (-not $NoWorktree) {
    $stats = Get-DiffStats -Dir $worktreePath
    $diffFiles = $stats.Files
    $diffLines = $stats.Lines
    Log "Changes: $diffFiles files, $diffLines lines" "Cyan"

    if ($diffFiles -gt $maxFilesChanged) {
        Log "WARNING: $diffFiles files changed (threshold: $maxFilesChanged). Review carefully." "Yellow"
    }
    if ($diffLines -gt $maxLinesChanged) {
        Log "WARNING: $diffLines lines changed (threshold: $maxLinesChanged). Review carefully." "Yellow"
    }
}

# Show committed changes
if (-not $NoWorktree) {
    Push-Location $worktreePath
    $changes = git status --short
    $diffStat = git diff HEAD~1 --stat 2>$null
    Pop-Location

    if ($changes) { Log "Uncommitted: $changes" "Yellow" }
    if ($diffStat) {
        Log "" "Cyan"
        $diffStat | ForEach-Object { Log $_ "Cyan" }
    }
}

# ══════════════════════════════════════════
#  PHASE 3: REVIEW
# ══════════════════════════════════════════

if (-not $SkipReview) {
    Log "" "White"
    Log "+==========================================+" "Magenta"
    Log "|  PHASE 3: REVIEW                         |" "Magenta"
    Log "+==========================================+" "Magenta"
    Log "Reviewing work quality..." "White"

    $reviewSec = Measure-Phase {
        Run-Phase -Prompt $reviewPrompt -Phase "REVIEW" -Turns $reviewMaxTurns
    }
    $reviewExit = $script:lastExit

    Log "Review phase: ${reviewSec}s, exit code $reviewExit" $(if ($reviewExit -eq 0) { "Green" } else { "Red" })

    # Display scorecard
    if (Test-Path $reportFile) {
        Log "" "Magenta"
        Log "===========================================" "Magenta"
        Log "  SCORECARD" "Magenta"
        Log "===========================================" "Magenta"
        Get-Content $reportFile | ForEach-Object { Log $_ "White" }
        Log "===========================================" "Magenta"
        Log "Full report: $reportFile" "Gray"

        # Parse verdict
        $reportContent = Get-Content $reportFile -Raw
        if ($reportContent -match '\*\*NEEDS WORK\*\*') {
            $verdict = "NEEDS_WORK"
        } elseif ($reportContent -match '\*\*PASS WITH NOTES\*\*') {
            $verdict = "PASS_WITH_NOTES"
        } elseif ($reportContent -match '\*\*PASS\*\*') {
            $verdict = "PASS"
        } else {
            $verdict = "UNKNOWN"
        }
    } else {
        Log "Warning: review report not generated" "Yellow"
        $verdict = "NO_REPORT"
    }

    # ══════════════════════════════════════════
    #  PHASE 4: FIX (if needed)
    # ══════════════════════════════════════════

    $fixIteration = 0
    while ($verdict -eq "NEEDS_WORK" -and $fixIteration -lt $MaxFixes) {
        $fixIteration++
        Log "" "White"
        Log "+==========================================+" "Red"
        Log "|  PHASE 4: FIX (attempt $fixIteration/$MaxFixes)              |" "Red"
        Log "+==========================================+" "Red"
        Log "Addressing review issues..." "White"

        # Build fix prompt with scorecard content
        $scorecard = if (Test-Path $reportFile) { Get-Content $reportFile -Raw } else { "No scorecard available" }
        $fixPrompt = $fixPromptTemplate -replace '\{SCORECARD\}', $scorecard

        $fixPhaseSec = Measure-Phase {
            Run-Phase -Prompt $fixPrompt -Phase "FIX" -Turns $fixMaxTurns
        }
        $fixExit = $script:lastExit
        $fixSec += $fixPhaseSec

        Log "Fix phase: ${fixPhaseSec}s, exit code $fixExit" $(if ($fixExit -eq 0) { "Green" } else { "Red" })

        # Re-review after fix
        Log "Re-reviewing after fix..." "Magenta"
        $reportFile = "$reportDir\$timestamp-review-fix${fixIteration}.md"
        $reReviewPrompt = $reviewPrompt -replace [regex]::Escape("$reportDir\$timestamp-review.md"), $reportFile

        $reReviewSec = Measure-Phase {
            Run-Phase -Prompt $reReviewPrompt -Phase "REVIEW" -Turns $reviewMaxTurns
        }
        $reReviewExit = $script:lastExit
        $reviewSec += $reReviewSec

        if (Test-Path $reportFile) {
            Log "" "Magenta"
            Log "--- RE-REVIEW SCORECARD (attempt $fixIteration) ---" "Magenta"
            Get-Content $reportFile | ForEach-Object { Log $_ "White" }
            Log "---" "Magenta"

            $reportContent = Get-Content $reportFile -Raw
            if ($reportContent -match '\*\*NEEDS WORK\*\*') {
                $verdict = "NEEDS_WORK"
            } elseif ($reportContent -match '\*\*PASS WITH NOTES\*\*') {
                $verdict = "PASS_WITH_NOTES"
            } elseif ($reportContent -match '\*\*PASS\*\*') {
                $verdict = "PASS"
            }
        }
    }

    if ($verdict -eq "NEEDS_WORK") {
        Log "Task still NEEDS WORK after $MaxFixes fix attempts. Manual review required." "Yellow"
    }
}

# ══════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════

$totalSec = $planSec + $buildSec + $reviewSec + $fixSec

Log "" "Green"
Log "================================================================" "Green"
Log "  COMPLETE" "Green"
Log "  Verdict: $verdict" $(if ($verdict -eq "PASS") { "Green" } elseif ($verdict -eq "PASS_WITH_NOTES") { "Yellow" } else { "Red" })
Log "  Time: plan=${planSec}s build=${buildSec}s review=${reviewSec}s fix=${fixSec}s total=${totalSec}s" "Cyan"
Log "  Changes: $diffFiles files, $diffLines lines" "Cyan"
Log "  Log: $logFile" "Gray"
Log "================================================================" "Green"

if (-not $NoWorktree) {
    Log ('To review: cd ' + $worktreePath) "Cyan"
    Log ('To merge:  cd ' + $projectRoot + '; git merge ' + $Branch) "Cyan"
    Log ('To discard: git worktree remove ' + $worktreePath + '; git branch -D ' + $Branch) "Gray"
}

# Auto-merge if PASS and flag set
if ($AutoMerge -and ($verdict -eq "PASS" -or $verdict -eq "PASS_WITH_NOTES") -and -not $NoWorktree) {
    Log "" "Green"
    Log "Auto-merging (verdict: $verdict)..." "Green"
    Push-Location $projectRoot
    git merge $Branch 2>&1 | ForEach-Object { Log $_ "Green" }
    $mergeExit = $LASTEXITCODE
    Pop-Location

    if ($mergeExit -eq 0) {
        Log "Merged successfully. Cleaning up worktree..." "Green"
        Push-Location $projectRoot
        git worktree remove $worktreePath --force 2>$null
        git branch -D $Branch 2>$null
        Pop-Location
        Log "Done." "Green"
    } else {
        Log "Merge failed. Manual resolution required." "Red"
    }
}

# Clean up temp claude config copy (Docker mode)
if ($useDocker -and $claudeTemp -and (Test-Path $claudeTemp)) {
    Remove-Item -Path $claudeTemp -Recurse -Force -ErrorAction SilentlyContinue
}

# Record in history
"$timestamp,$branchSafe,`"$Task`",$verdict,$planSec,$buildSec,$reviewSec,$fixSec,$diffFiles,$diffLines" | Out-File -FilePath $historyFile -Append -Encoding utf8

# Desktop notification
$notifyBody = "Verdict: $verdict | ${totalSec}s | $diffFiles files"
Send-Notification "Auto-Task Complete" $notifyBody
