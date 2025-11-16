# Git Workflow for Quay Development

This document describes the git workflow for working on Quay bug fixes with a persistent `dev` branch that contains `.claude` knowledge base.

## Repository Setup

```
upstream → git@github.com:quay/quay.git          (MAIN PROJECT - PRs merge here)
origin   → git@github.com:harishsurf/quay.git    (YOUR FORK)
```

**Key Principle:**
- `dev` branch = `master` + `.claude` knowledge base (never pushed to upstream)
- Each bug fix = separate branch created from `master` (clean PR, no `.claude` files)

---

## Initial Setup (One-Time Only)

### Step 1: Create and Setup dev Branch

```bash
# Ensure master is up to date
git checkout master
git fetch --all
git rebase upstream/master
git push origin master

# Create dev branch from master
git checkout -b dev

# Add .claude directory structure
mkdir -p .claude/prompt .claude/fixes .claude/commands .claude/attachments

# Move existing .claude files (if any)
# (your files are already in place)

# Commit .claude to dev
git add .claude/
git commit -m "docs: initialize Claude Code knowledge base"

# Push dev to your fork (backup)
git push origin dev
```

### Step 2: Configure Branch Protection (Optional)

Prevent accidentally pushing `dev` to `upstream`:

```bash
# Add to .git/config under [branch "dev"] section
git config branch.dev.remote origin
git config branch.dev.merge refs/heads/dev
git config branch.dev.pushRemote origin
```

**Or manually edit `.git/config`:**
```ini
[branch "dev"]
    remote = origin          # Fetch from your fork
    merge = refs/heads/dev
    pushRemote = origin      # Always push to your fork, never upstream
```

This prevents `git push` from accidentally pushing `dev` to `upstream`.

### Step 3: Install Safety Hook (Optional)

Prevent creating PR branches from `dev` instead of `master`:

**Create `.git/hooks/pre-checkout`:**

```bash
cat > .git/hooks/pre-checkout << 'EOF'
#!/bin/bash
# Prevent creating PR branches from dev branch

current_branch=$(git symbolic-ref --short HEAD 2>/dev/null)
new_branch="$3"

# Only check when creating new branches (-b flag)
if [ "$2" = "1" ]; then
    # Check if we're on dev and creating a projquay- branch
    if [[ "$current_branch" == "dev" ]] && [[ "$new_branch" =~ ^projquay- ]]; then
        echo ""
        echo "❌ ERROR: Cannot create PR branch from 'dev'"
        echo ""
        echo "You're currently on: $current_branch"
        echo "Trying to create: $new_branch"
        echo ""
        echo "✅ Correct workflow:"
        echo "   git checkout master"
        echo "   git fetch --all && git rebase upstream/master"
        echo "   git checkout -b $new_branch"
        echo ""
        exit 1
    fi
fi
EOF

chmod +x .git/hooks/pre-checkout
```

**Test the hook:**
```bash
# This will be BLOCKED:
git checkout dev
git checkout -b projquay-test
# ❌ ERROR: Cannot create PR branch from 'dev'

# This works:
git checkout master
git checkout -b projquay-test
# ✅ Success
```

---

## Daily Workflow: Working on a Bug Fix

### Phase 1: Start New Issue

```bash
# Switch to dev and sync with latest master
git checkout dev
git fetch --all
git rebase upstream/master

# Claude will auto-create this when you run /create-plan-from-issue PROJQUAY-XXXX
# .claude/fixes/PROJQUAY-XXXX/fix.md will be created automatically
```

### Phase 2: Implement the Fix

**Make your changes in separate logical commits:**

```bash
# Example: PROJQUAY-9658 has 3 commits

# Commit 1: Add utility function
git add web/src/utils/freshLoginErrors.ts
git commit -m "fix(ui): add fresh login error utility (PROJQUAY-9658)"

# Commit 2: Fix the component
git add web/src/AppWithFreshLogin.tsx
git add web/src/hooks/UseGlobalFreshLogin.tsx
git add web/src/libs/axios.ts
git commit -m "fix(ui): handle verification errors (PROJQUAY-9658)"

# Commit 3: Add tests
git add web/cypress/e2e/superuser-user-management.cy.ts
git commit -m "test(ui): add fresh login error tests (PROJQUAY-9658)"

# Note the commit hashes (you'll need them for cherry-picking)
git log --oneline -3
# Output example:
# abc1234 test(ui): add fresh login error tests (PROJQUAY-9658)    ← commit3 (newest)
# def5678 fix(ui): handle verification errors (PROJQUAY-9658)      ← commit2
# ghi9012 fix(ui): add fresh login error utility (PROJQUAY-9658)   ← commit1 (oldest)
```

**Commit order:** commit1 (oldest) → commit2 → commit3 (newest/HEAD)

### Phase 3: Update .claude Documentation

**Separate commit for .claude changes:**

```bash
# Update the fix documentation created by /create-plan-from-issue
# Add any new patterns discovered

git add .claude/fixes/PROJQUAY-9658/fix.md
git add .claude/context/testing_patterns.md  # If you added patterns
git add .claude/context/react_standards.md   # If you updated patterns
git commit -m "docs: document PROJQUAY-9658 fix and patterns"
```

**At this point, dev has:**
- 3 fix commits (ghi9012, def5678, abc1234)
- 1 docs commit (.claude updates)

### Phase 4: Create PR Branch (Extract Only the Fix)

```bash
# Step 1: Switch to master and sync
git checkout master
git fetch --all
git rebase upstream/master
# (Optional) git push origin master

# Step 2: Create PR branch from master
git checkout -b projquay-9658

# Step 3: Cherry-pick ONLY the fix commits (not the .claude commit)
# Use the commit hashes from Phase 2
git cherry-pick ghi9012^..abc1234
# This picks: ghi9012 (commit1) → def5678 (commit2) → abc1234 (commit3)
# The ^ means "include this commit" (start from ghi9012, not its parent)

# Alternative if you want a single squashed commit:
# git cherry-pick ghi9012^..abc1234
# git reset --soft HEAD~3
# git commit -m "fix(ui): handle fresh login password verification errors (PROJQUAY-9658)
#
# - Add fresh login error utility
# - Handle verification errors
# - Add Cypress tests
#
# 🤖 Generated with Claude Code"

# Step 4: Push to your fork to create PR
git push origin projquay-9658

# Step 5: Go back to dev
git checkout dev
```

**What just happened:**
- ✅ `projquay-9658` branch has ONLY the fix commits (no `.claude` changes)
- ✅ `dev` still has both fix commits + .claude docs
- ✅ Ready to create PR: `origin/projquay-9658` → `upstream/master`

### Phase 5: Create Pull Request

On GitHub:
1. Go to your fork: https://github.com/harishsurf/quay
2. Click "Compare & pull request" for `projquay-9658`
3. Base: `quay/quay:master` ← Head: `harishsurf/quay:projquay-9658`
4. Fill in PR description
5. Submit PR

### Phase 6: After PR is Merged

```bash
# Step 1: Update master with the merged PR
git checkout master
git fetch --all
git rebase upstream/master
git push origin master

# Step 2: Rebase dev onto updated master
git checkout dev
git fetch --all
git rebase upstream/master

# ✨ MAGIC HAPPENS HERE:
# Git sees the fix commits (ghi9012, def5678, abc1234) already exist in master
# Git automatically DROPS those commits during rebase
# Git KEEPS the .claude docs commit (because it's unique)
# Result: dev = master + .claude improvements

# Step 3: Update your fork's dev branch
git push origin dev --force-with-lease
# (force needed because rebase rewrites history)

# Step 4: Clean up PR branch (optional)
git branch -d projquay-9658
git push origin --delete projquay-9658
```

**Result:**
```
Before rebase:
upstream/master:  A---B---C---G(your fix merged)
dev:              A---B---C---ghi9012---def5678---abc1234---docs

After rebase:
upstream/master:  A---B---C---G
dev:              A---B---C---G---docs'
                                  ↑
                    Git dropped ghi9012, def5678, abc1234
                    Kept docs (unique to dev)
```

### Phase 7: Start Next Issue

```bash
# Ready to work on next issue
git checkout dev
git fetch --all
git rebase upstream/master

# Run /create-plan-from-issue PROJQUAY-XXXX
# Repeat the cycle...
```

---

## Common Scenarios

### Scenario 1: Single Commit Fix

```bash
# On dev
git add web/src/MyComponent.tsx
git commit -m "fix(ui): fix the bug (PROJQUAY-1234)"

# Create PR branch
git checkout master
git fetch --all
git rebase upstream/master
git checkout -b projquay-1234
git cherry-pick <commit-hash>
git push origin projquay-1234
```

### Scenario 2: Multiple Commit Fix

```bash
# On dev with 5 commits for the fix
git log --oneline -5
# aaa1111 commit5 (newest)
# bbb2222 commit4
# ccc3333 commit3
# ddd4444 commit2
# eee5555 commit1 (oldest)

# Create PR branch
git checkout master
git fetch --all
git rebase upstream/master
git checkout -b projquay-1234

# Cherry-pick range (from oldest to newest)
git cherry-pick eee5555^..aaa1111
# Picks: eee5555 → ddd4444 → ccc3333 → bbb2222 → aaa1111

git push origin projquay-1234
```

### Scenario 3: Wrong Branch - Created PR Branch from dev

**Problem:** You accidentally created PR branch from `dev` instead of `master`

```bash
# You did this by mistake:
git checkout dev
git checkout -b projquay-1234  # ❌ Wrong! Contains .claude files

# Fix it:
git branch -D projquay-1234    # Delete the wrong branch

# Do it correctly:
git checkout master
git fetch --all
git rebase upstream/master
git checkout -b projquay-1234  # ✅ Correct!
git cherry-pick <commit-hash>
```

### Scenario 4: Forgot to Separate .claude Commit

**Problem:** You committed fix + .claude changes in one commit

```bash
# On dev
git log --oneline -1
# abc1234 fix(ui): fix bug (PROJQUAY-1234)  ← Contains both fix AND .claude changes

# Fix: Split the commit
git reset HEAD~1  # Undo the commit, keep changes

# Commit fix separately
git add web/src/...
git commit -m "fix(ui): fix bug (PROJQUAY-1234)"

# Commit .claude separately
git add .claude/
git commit -m "docs: document PROJQUAY-1234"
```

---

## Quick Reference

### Essential Commands

```bash
# Start working on issue
git checkout dev
git fetch --all && git rebase upstream/master

# Make commits...

# Create PR branch
git checkout master
git fetch --all && git rebase upstream/master
git checkout -b projquay-XXXX
git cherry-pick <first-commit>^..<last-commit>
git push origin projquay-XXXX

# After PR merged
git checkout master
git fetch --all && git rebase upstream/master
git checkout dev
git fetch --all && git rebase upstream/master
git push origin dev --force-with-lease
```

### Find Commit Hashes

```bash
# Show recent commits
git log --oneline -10

# Show commits with grep
git log --oneline --grep="PROJQUAY-9658"

# Show commits affecting specific file
git log --oneline -- web/src/AppWithFreshLogin.tsx
```

### Cherry-Pick Syntax

```bash
# Single commit
git cherry-pick abc1234

# Range (from commit1 to commit3, inclusive)
git cherry-pick commit1^..commit3

# Multiple non-consecutive commits
git cherry-pick abc1234 def5678 ghi9012
```

---

## Visual Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  upstream/master (quay/quay)                                │
│  A ─── B ─── C                                              │
└─────────────────────────────────────────────────────────────┘
                    ↓ fetch & rebase
┌─────────────────────────────────────────────────────────────┐
│  dev (your working branch)                                  │
│  A ─── B ─── C ─── D(.claude init)                          │
└─────────────────────────────────────────────────────────────┘
                    ↓ work on PROJQUAY-9658
┌─────────────────────────────────────────────────────────────┐
│  dev                                                         │
│  A ─── B ─── C ─── D(.claude) ─── E(fix1) ─── F(fix2) ──┐   │
│                                  ─── G(.claude update)   │   │
└──────────────────────────────────────────────────────────┼───┘
                    ↓ cherry-pick E, F                     │
┌──────────────────────────────────────────────────────────┼───┐
│  projquay-9658 (PR branch)                               │   │
│  A ─── B ─── C ─── E' ─── F'                             │   │
└──────────────────────────────────────────────────────────┘   │
                    ↓ push to origin                           │
┌─────────────────────────────────────────────────────────────┐
│  origin/projquay-9658 → Create PR → upstream/master        │
└─────────────────────────────────────────────────────────────┘
                    ↓ PR merged
┌─────────────────────────────────────────────────────────────┐
│  upstream/master                                            │
│  A ─── B ─── C ─── H(E+F merged)                            │
└─────────────────────────────────────────────────────────────┘
                    ↓ rebase dev on master
┌─────────────────────────────────────────────────────────────┐
│  dev (after rebase)                                         │
│  A ─── B ─── C ─── H ─── D'(.claude) ─── G'(.claude update)│
│                          ↑                                  │
│         Git dropped E, F (duplicates of H)                  │
│         Git kept D, G (unique .claude commits)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "dev has diverged from origin/dev"

This happens after rebasing. It's expected:

```bash
git push origin dev --force-with-lease
```

The `--force-with-lease` is safer than `--force` (won't overwrite if someone else pushed).

### "Can't push to upstream"

Good! You shouldn't push `dev` to `upstream`. Only push to `origin`:

```bash
git push origin dev
```

If you configured the branch protection in Step 2, this happens automatically.

### "Cherry-pick caused conflicts"

```bash
# Fix conflicts in the files
git status  # Shows conflicted files

# Edit files to resolve conflicts
# Then:
git add <resolved-files>
git cherry-pick --continue
```

---

## Reviewing Pull Requests

When reviewing others' PRs, you may need to test changes locally while still having access to `.claude/` for using Claude Code features (like Playwright testing).

### Basic PR Review (No Local Testing)

```bash
# Use Claude to review the PR remotely
/review-pr <pr-number>

# Leave comments on GitHub
gh pr review <pr-number> --approve
gh pr review <pr-number> --request-changes -b "Fix X"
```

### PR Review with Local Testing (With .claude Access)

```bash
# Step 1: Fetch the PR
git fetch upstream pull/<pr-number>/head:pr-<pr-number>-review
git checkout pr-<pr-number>-review

# Step 2: Bring .claude into review branch
git merge dev --no-commit --no-ff

# What this does:
# - Merges dev (which has .claude/) into review branch
# - --no-commit: Doesn't create merge commit yet
# - --no-ff: Ensures proper merge (not fast-forward)

# Step 3: Test with Claude Code features available
cd web
npm run start:integration

# Now you can:
# - Use /review-pr command
# - Use Playwright agent for UI testing
# - Access all .claude/ commands and context

# Step 4: Leave review
gh pr review <pr-number> --approve -b "Tested locally, looks good!"

# Step 5: Clean up (delete review branch)
git checkout dev
git branch -D pr-<pr-number>-review
```

**Key Points:**
- Review branch has PR changes + .claude directory
- The merge is never committed (temporary)
- Don't push the review branch
- Delete review branch when done

---

## Best Practices

✅ **DO:**
- Keep fix commits separate from .claude commits
- Use descriptive commit messages with JIRA number
- Rebase dev regularly to stay in sync with master
- Use `--force-with-lease` instead of `--force`
- Update .claude/fixes/PROJQUAY-XXXX/fix.md during implementation

❌ **DON'T:**
- Create PR branches from dev (use master)
- Mix fix and .claude changes in same commit
- Push dev to upstream
- Rebase after pushing to PR branch (breaks the PR)
- Force push to master or upstream

---

## Summary

**The Golden Rules:**
1. `dev` = your permanent workspace (never goes to upstream)
2. PR branches = created from `master` (clean, no .claude)
3. After PR merges, rebase dev to drop duplicates
4. .claude commits stay on dev forever, accumulating knowledge
