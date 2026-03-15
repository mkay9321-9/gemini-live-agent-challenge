# Git Guide — Live Restaurant Menu Agent

Reference for everything from initial setup to ongoing commits. Repo: `https://github.com/mkay9321-9/gemini-live-agent-challenge.git`

---

## Part 1: One-Time Setup (Already Done)

### 1.1 Initialize Git

```bash
cd /Users/Shah/projects/gemini-challenge-2026
git init
```

### 1.2 Add Remote

```bash
git remote add origin https://github.com/mkay9321-9/gemini-live-agent-challenge.git
```

### 1.3 Verify .gitignore

`app/.env` must never be committed (contains API key). It's in [`.gitignore`](../.gitignore). Run `git status`—`app/.env` should not appear.

### 1.4 GitHub Authentication

**HTTPS (recommended):**

- Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
- Use the token as your password when Git prompts
- Store credentials: `git config --global credential.helper osxkeychain`

**SSH alternative:**

```bash
# Test connection
ssh -T git@github.com

# Switch remote to SSH
git remote set-url origin git@github.com:mkay9321-9/gemini-live-agent-challenge.git
```

### 1.5 HTTP Buffer (Fixes "RPC failed; HTTP 400")

If you hit "unexpected disconnect" or "HTTP 400" during push:

```bash
git config --global http.postBuffer 524288000
```

---

## Part 2: Ongoing Workflow (Future Commits)

### 2.1 Daily Workflow

```bash
cd /Users/Shah/projects/gemini-challenge-2026

# 1. Check what changed
git status

# 2. Stage changes (all files)
git add .

# Or stage specific files:
# git add app/main.py README.md

# 3. Commit with a clear message
git commit -m "Add feature X"   # or "Fix bug Y", "Update README", etc.

# 4. Push to GitHub
git push origin main
```

### 2.2 Quick Reference

| Action        | Command                          |
|---------------|-----------------------------------|
| Check status  | `git status`                      |
| Stage all     | `git add .`                       |
| Stage one     | `git add path/to/file`            |
| Commit        | `git commit -m "Your message"`     |
| Push          | `git push origin main`            |
| Pull (sync)   | `git pull origin main`            |

### 2.3 Before You Commit

- Run `git status` and confirm `app/.env` is not listed
- Write clear commit messages: "Add voice barge-in support" not "updates"

---

## Part 3: Troubleshooting

### Push rejected: "remote contains work you do not have"

The remote has commits (e.g., README from repo creation) that your local repo doesn't have.

**Option A — Merge (keeps both):**

```bash
git pull origin main --allow-unrelated-histories
# Resolve conflicts if any, then:
git push origin main
```

**Option B — Overwrite remote (use with care):**

```bash
git push origin main --force
```

### RPC failed; HTTP 400 / unexpected disconnect

Increase the HTTP buffer:

```bash
git config --global http.postBuffer 524288000
git push origin main
```

### 403 Forbidden / Permission denied

- Confirm you're logged into GitHub as `mkay9321-9`
- For HTTPS: use a valid PAT with `repo` scope
- For SSH: ensure your key is added at https://github.com/settings/keys

### .env accidentally staged

```bash
git reset HEAD app/.env
# Ensure app/.env is in .gitignore
```

### Undo last commit (keep changes)

```bash
git reset --soft HEAD~1
```

### See remote URL

```bash
git remote -v
```

---

## Part 4: Repo Info

| Item    | Value                                                                 |
|---------|-----------------------------------------------------------------------|
| Remote  | `https://github.com/mkay9321-9/gemini-live-agent-challenge.git`       |
| Branch  | `main`                                                                |
| Owner   | `mkay9321-9`                                                          |
