import subprocess
import time
import sys
import os

PARTS = [
    {
        "num": 1,
        "msg": "docs & config: initial project documentation, architecture, and environment configs",
        "paths": [".gitignore", ".env.example", "README.md", "docs"]
    },
    {
        "num": 2,
        "msg": "backend: core framework configuration, database initialization and wsgi entry",
        "paths": ["backend/requirements.txt", "backend/wsgi.py", "backend/app/core", "backend/app/db", "backend/app/__init__.py"]
    },
    {
        "num": 3,
        "msg": "backend: database schema models for users, employees, payroll, and attendance",
        "paths": ["backend/app/models"]
    },
    {
        "num": 4,
        "msg": "backend: business logic services, task workers, and management scripts",
        "paths": ["backend/app/services", "backend/app/tasks", "backend/scripts"]
    },
    {
        "num": 5,
        "msg": "backend: REST API endpoints for auth, employees, departments, and payroll",
        "paths": ["backend/app/api"]
    },
    {
        "num": 6,
        "msg": "tests: unit and integration test suites for backend services",
        "paths": ["backend/tests"]
    },
    {
        "num": 7,
        "msg": "frontend: build configurations, TypeScript setup, and dependencies",
        "paths": [
            "frontend/package.json",
            "frontend/package-lock.json",
            "frontend/tsconfig.json",
            "frontend/vite.config.ts",
            "frontend/postcss.config.js",
            "frontend/tailwind.config.js",
            "frontend/index.html"
        ]
    },
    {
        "num": 8,
        "msg": "frontend: global styles, layout structures, store, and custom hooks",
        "paths": [
            "frontend/src/index.css",
            "frontend/src/main.tsx",
            "frontend/src/App.tsx",
            "frontend/src/store",
            "frontend/src/layouts",
            "frontend/src/lib",
            "frontend/src/hooks"
        ]
    },
    {
        "num": 9,
        "msg": "frontend: API integration services and HTTP client modules",
        "paths": ["frontend/src/services"]
    },
    {
        "num": 10,
        "msg": "frontend: UI views, dashboard pages, and full system integration",
        "paths": ["frontend/src/pages", "."]
    }
]

def run(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return res.returncode, res.stdout, res.stderr

def main():
    delay_minutes = 10
    delay_seconds = delay_minutes * 60
    total = len(PARTS)

    print("=" * 60)
    print("HR Management System - Automated 10-Part Git Push")
    print(f"Delay between pushes: {delay_minutes} minutes")
    print("=" * 60)

    # Check git repo
    if not os.path.exists(".git"):
        print("[*] Initializing git repository...")
        run("git init")
        run("git branch -M main")

    code, out, _ = run("git remote -v")
    if not out.strip():
        repo_url = input("Enter your GitHub Repository URL (e.g. https://github.com/user/repo.git): ").strip()
        if not repo_url:
            print("Error: Repository URL is required.")
            sys.exit(1)
        run(f"git remote add origin {repo_url}")

    for idx, item in enumerate(PARTS):
        num = item["num"]
        msg = item["msg"]
        paths = item["paths"]

        print(f"\n[{num}/{total}] Staging: {msg}")
        for p in paths:
            if os.path.exists(p) or p == ".":
                run(f"git add {p}")

        # Check if there are staged changes
        code, status, _ = run("git status --porcelain")
        if status.strip():
            run(f'git commit -m "{msg}"')
            print(f"Pushing Part {num} to origin main...")
            p_code, p_out, p_err = run("git push -u origin main")
            if p_code != 0:
                print(f"Push output: {p_out} {p_err}")
                # Try simple push if upstream is already set
                run("git push")
            print(f"✓ Successfully pushed Part {num}/{total}!")
        else:
            print(f"Part {num}: No new changes to commit, continuing...")

        if num < total:
            print(f"\nWaiting {delay_minutes} minutes before pushing the next part...")
            for remaining in range(delay_seconds, 0, -10):
                mins = remaining // 60
                secs = remaining % 60
                print(f"\rTime remaining until next push: {mins:02d}m {secs:02d}s", end="", flush=True)
                time.sleep(10)
            print("\n")

    print("\nAll 10 parts have been committed and pushed successfully!")

if __name__ == "__main__":
    main()
