# ==============================================================================
# HR Management System - Automated 10-Part Git Push Script
# Spacing: 10 minutes (600 seconds) between each push
# ==============================================================================

param (
    [string]$RemoteUrl = "",
    [int]$DelayMinutes = 10
)

$ErrorActionPreference = "Stop"

# Ensure Git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "[1/10+] Initializing Git repository..." -ForegroundColor Cyan
    git init
    git branch -M main
}

# Check or add Remote URL
if ($RemoteUrl -ne "") {
    $existingRemote = git remote
    if ($existingRemote -contains "origin") {
        git remote set-url origin $RemoteUrl
    } else {
        git remote add origin $RemoteUrl
    }
    Write-Host "Configured remote origin: $RemoteUrl" -ForegroundColor Green
}

$currentRemote = git remote -v
if (-not $currentRemote) {
    Write-Host "ERROR: No git remote found. Please run with your GitHub URL:" -ForegroundColor Red
    Write-Host ".\push_in_parts.ps1 -RemoteUrl 'https://github.com/<your-user>/<repo-name>.git'" -ForegroundColor Yellow
    exit 1
}

# Definition of the 10 parts
$parts = @(
    @{
        Number = 1
        Message = "docs & config: initial project documentation, architecture, and environment configs"
        Paths = @(".gitignore", ".env.example", "README.md", "docs")
    },
    @{
        Number = 2
        Message = "backend: core framework configuration, database initialization and wsgi entry"
        Paths = @("backend/requirements.txt", "backend/wsgi.py", "backend/app/core", "backend/app/db", "backend/app/__init__.py")
    },
    @{
        Number = 3
        Message = "backend: database schema models for users, employees, payroll, and attendance"
        Paths = @("backend/app/models")
    },
    @{
        Number = 4
        Message = "backend: business logic services, task workers, and management scripts"
        Paths = @("backend/app/services", "backend/app/tasks", "backend/scripts")
    },
    @{
        Number = 5
        Message = "backend: REST API endpoints for auth, employees, departments, and payroll"
        Paths = @("backend/app/api")
    },
    @{
        Number = 6
        Message = "tests: unit and integration test suites for backend services"
        Paths = @("backend/tests")
    },
    @{
        Number = 7
        Message = "frontend: build configurations, TypeScript setup, and dependencies"
        Paths = @(
            "frontend/package.json",
            "frontend/package-lock.json",
            "frontend/tsconfig.json",
            "frontend/vite.config.ts",
            "frontend/postcss.config.js",
            "frontend/tailwind.config.js",
            "frontend/index.html"
        )
    },
    @{
        Number = 8
        Message = "frontend: global styles, layout structures, store, and custom hooks"
        Paths = @(
            "frontend/src/index.css",
            "frontend/src/main.tsx",
            "frontend/src/App.tsx",
            "frontend/src/store",
            "frontend/src/layouts",
            "frontend/src/lib",
            "frontend/src/hooks"
        )
    },
    @{
        Number = 9
        Message = "frontend: API integration services and HTTP client modules"
        Paths = @("frontend/src/services")
    },
    @{
        Number = 10
        Message = "frontend: UI views, dashboard pages, and full system integration"
        Paths = @("frontend/src/pages", ".")
    }
)

$delaySeconds = $DelayMinutes * 60
$total = $parts.Length

for ($i = 0; $i -lt $total; $i++) {
    $item = $parts[$i]
    $step = $item.Number
    $msg = $item.Message
    $paths = $item.Paths

    Write-Host "`n========================================================" -ForegroundColor Magenta
    Write-Host " [Part $step of $total] Staging & Committing: $msg" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Magenta

    foreach ($p in $paths) {
        if (Test-Path $p) {
            git add $p
        }
    }

    # Check if there is anything to commit
    $status = git status --porcelain
    if ($status) {
        git commit -m "$msg"
    }

    Write-Host "Pushing Part $step to GitHub..." -ForegroundColor Green
    if ($step -eq 1) {
        git push -u origin main --force
    } else {
        git push origin main
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Git push failed for Part $step!" -ForegroundColor Red
        exit 1
    }

    Write-Host " Successfully pushed Part $step/$total to GitHub!" -ForegroundColor Green

    # If not the last part, wait the specified interval
    if ($step -lt $total) {
        Write-Host "`nSleeping for $DelayMinutes minutes ($delaySeconds seconds) before next push..." -ForegroundColor Gray
        $start = Get-Date
        for ($s = $delaySeconds; $s -gt 0; $s -= 10) {
            $minsLeft = [math]::Floor($s / 60)
            $secsLeft = $s % 60
            Write-Progress -Activity "Pacing GitHub Pushes (Part $step of $total completed)" -Status "Next push in ${minsLeft}m ${secsLeft}s" -PercentComplete ((($delaySeconds - $s) / $delaySeconds) * 100)
            Start-Sleep -Seconds 10
        }
        Write-Progress -Activity "Pacing GitHub Pushes" -Completed
    }
}

Write-Host "`n All $total parts have been successfully committed and pushed to GitHub!" -ForegroundColor Green
