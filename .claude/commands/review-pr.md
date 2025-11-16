---
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr checks:*), Bash(git diff:*), Bash(git log:*), Read, Glob, Grep, TodoWrite
argument-hint: <pr-number>
description: Review a pull request for code quality and standards
---

# Review Pull Request

Systematically review a pull request for code quality, adherence to standards, potential bugs, and test coverage.

## PR Number

The pull request to review: `$ARGUMENTS`

## Review Workflow

### Step 1: Fetch PR Details

Get the full PR information:

```bash
gh pr view $ARGUMENTS
```

**Extract key information:**
- PR title and description
- Author
- Base branch and head branch
- Changed files count
- Review status
- CI/CD checks status

### Step 2: Get PR Diff

Fetch the full diff of changes:

```bash
gh pr diff $ARGUMENTS
```

**What to analyze:**
- File changes (additions, deletions, modifications)
- Scope of changes (UI, backend, tests, docs)
- Size of PR (lines changed)

### Step 3: Check CI/CD Status

Check automated tests and checks:

```bash
gh pr checks $ARGUMENTS
```

**Verify:**
- All tests passing
- Build successful
- Linting passing
- Type checking passing
- Any failing checks that need attention

### Step 4: Classify PR Type

Based on title, description, and files changed:

**UI Changes (React):**
- Files in `web/src/`
- New components or modified existing ones
- Focus on: PatternFly usage, React patterns, accessibility

**Backend Changes (Python):**
- Files in `endpoints/`, `data/`, `util/`
- API endpoints or database models
- Focus on: API design, security, error handling

**Test Changes:**
- Files in `web/cypress/e2e/` (E2E tests)
- Files ending in `.test.tsx` or `.test.ts` (unit tests)
- Focus on: Test coverage, test patterns, assertions

**Documentation:**
- Markdown files, README updates
- Focus on: Clarity, accuracy, examples

**Infrastructure/Config:**
- Docker files, CI/CD config, dependencies
- Focus on: Security, compatibility, breaking changes

### Step 5: Detailed Code Review

For each changed file, review according to type:

#### 5A. React/UI Code Review

Read changed files in `web/src/`:

**Check for:**
1. **Code Standards** (from `.claude/context/react_standards.md`):
   - ✅ Functional components with hooks (no class components)
   - ✅ Proper naming: PascalCase for components, camelCase for functions
   - ✅ TypeScript types defined for props
   - ✅ Exports: default for routes, named for utilities
   - ✅ No `any` types unless absolutely necessary

2. **Quay Patterns** (from `.claude/context/react_standards.md`):
   - ✅ Resources + Hooks pattern for API calls
   - ✅ React Query for server state (not Context)
   - ✅ PatternFly components used (no custom CSS)
   - ✅ Error handling with UIContext
   - ✅ Fresh login errors filtered with `isFreshLoginError()`
   - ✅ Modal structure follows standard pattern

3. **Architecture Compliance** (from `.claude/context/architecture.md`):
   - ✅ No breaking changes to shared backend (Angular compatibility)
   - ✅ Proper file organization (routes/, components/, hooks/, resources/)
   - ✅ `data-testid` attributes for Cypress selectors

4. **Code Quality:**
   - ✅ No console.log statements (use proper logging)
   - ✅ No commented-out code
   - ✅ No hardcoded strings (use constants or i18n)
   - ✅ Proper error boundaries
   - ✅ Loading states handled
   - ✅ Accessibility (ARIA labels, keyboard navigation)

#### 5B. Backend/API Code Review

Read changed files in Python codebase:

**Check for:**
1. **API Design:**
   - ✅ RESTful endpoint naming
   - ✅ Proper HTTP methods (GET, POST, PUT, DELETE)
   - ✅ Consistent error responses
   - ✅ Backward compatibility (Angular UI still works)

2. **Security:**
   - ✅ Authentication checks
   - ✅ Authorization (permissions/roles)
   - ✅ Input validation
   - ✅ SQL injection prevention
   - ✅ XSS prevention
   - ✅ CSRF token usage for mutations

3. **Database:**
   - ✅ Proper migrations if schema changed
   - ✅ Indexes for queries
   - ✅ Transactions where needed
   - ✅ No N+1 query issues

4. **Code Quality:**
   - ✅ Error handling and logging
   - ✅ No hardcoded credentials or secrets
   - ✅ Proper use of config variables
   - ✅ Type hints (Python 3.6+)

#### 5C. Test Review

Read test files:

**Check for** (from `.claude/context/testing_patterns.md`):
1. **Cypress E2E Tests:**
   - ✅ Test structure (describe, beforeEach, it)
   - ✅ API mocking with cy.intercept()
   - ✅ Proper use of cy.wait() for network requests
   - ✅ Wait for loading spinners to disappear
   - ✅ Use data-testid selectors (not CSS classes)
   - ✅ Test both success and error paths
   - ✅ Fresh login flow tested if applicable
   - ✅ No `.only()` left in code

2. **Test Coverage:**
   - ✅ New features have corresponding tests
   - ✅ Bug fixes have regression tests
   - ✅ Edge cases covered
   - ✅ Error paths tested

3. **Test Quality:**
   - ✅ Tests are deterministic (no flakiness)
   - ✅ Descriptive test names
   - ✅ Independent tests (no shared state)
   - ✅ Proper cleanup in afterEach/after

### Step 6: Check for Common Issues

**Anti-Patterns** (from `.claude/context/react_standards.md`):
- ❌ Throwing plain objects instead of Error objects
- ❌ Global error suppression
- ❌ Duplicate error checking (use utilities)
- ❌ Inline styles instead of PatternFly
- ❌ Missing data-testid attributes

**Security Issues:**
- ❌ Hardcoded credentials or API keys
- ❌ SQL injection vulnerabilities
- ❌ XSS vulnerabilities
- ❌ Missing authentication/authorization
- ❌ Sensitive data in logs or error messages

**Performance Issues:**
- ❌ Unnecessary re-renders
- ❌ Missing memoization for expensive calculations
- ❌ Large bundle imports (import entire libraries)
- ❌ N+1 database queries
- ❌ No pagination for large datasets

**Maintainability Issues:**
- ❌ Large files (>500 lines)
- ❌ Complex functions (>50 lines)
- ❌ Deep nesting (>4 levels)
- ❌ Duplicate code
- ❌ Missing comments for complex logic

### Step 7: Create Review TodoList

Use TodoWrite to create a structured review checklist:

```
1. Analyze PR scope and type (completed)
2. Review code standards compliance (in_progress)
3. Check for security issues (pending)
4. Verify test coverage (pending)
5. Check CI/CD status (pending)
6. Provide review summary (pending)
```

### Step 8: Provide Review Summary

Create a structured review report:

#### Format:

```markdown
# PR Review: #$ARGUMENTS - [PR Title]

## Summary
- **Type**: [Bug fix / Feature / Refactor / Tests / Docs]
- **Scope**: [UI / Backend / Tests / Infrastructure]
- **Size**: [Small / Medium / Large] - [X files, Y lines changed]
- **Risk Level**: [Low / Medium / High]

## Changes Overview
[Brief description of what this PR does]

## Code Quality: ✅ / ⚠️ / ❌

### Strengths
- ✅ [List good aspects]

### Issues Found
- ❌ **[Severity]**: [Description and location]
  - **File**: path/to/file.tsx:123
  - **Issue**: Detailed description
  - **Recommendation**: How to fix

### Suggestions
- ⚠️ [Non-blocking improvements]

## Standards Compliance

### React/UI Standards: ✅ / ⚠️ / ❌
- [Specific findings]

### Testing Standards: ✅ / ⚠️ / ❌
- [Specific findings]

### Architecture Compliance: ✅ / ⚠️ / ❌
- [Specific findings]

## Test Coverage: ✅ / ⚠️ / ❌
- New features tested: [Yes/No]
- Edge cases covered: [Yes/No]
- Regression tests: [Yes/No/N/A]

## Security Review: ✅ / ⚠️ / ❌
- Authentication: [OK/Issues]
- Authorization: [OK/Issues]
- Input validation: [OK/Issues]
- XSS/SQL injection: [OK/Issues]

## CI/CD Status: ✅ / ⚠️ / ❌
- Tests: [Passing/Failing]
- Build: [Passing/Failing]
- Linting: [Passing/Failing]

## Recommendation
- ✅ **APPROVE** - Looks good, minor suggestions only
- ⚠️ **APPROVE WITH COMMENTS** - Good overall, address comments when possible
- 🔄 **REQUEST CHANGES** - Issues must be addressed before merge
- ❌ **BLOCK** - Critical issues, do not merge

## Detailed Comments
[Line-by-line comments if needed]

## Questions for Author
[Any clarifications needed]
```

## Review Criteria by PR Size

### Small PR (< 100 lines)
- Quick review (5-10 minutes)
- Focus on: correctness, standards compliance
- Less concern about: architecture (likely minor change)

### Medium PR (100-500 lines)
- Thorough review (15-30 minutes)
- Focus on: all criteria, test coverage
- Check for: potential refactoring opportunities

### Large PR (> 500 lines)
- In-depth review (30-60 minutes)
- Consider: should this be split into smaller PRs?
- Focus on: architecture impact, maintainability
- Extra attention to: test coverage, security

## Tips

### Effective Reviews
- ✅ Be specific: Reference file names and line numbers
- ✅ Be constructive: Suggest solutions, not just problems
- ✅ Distinguish: Critical issues vs. suggestions
- ✅ Acknowledge good code: Mention positive aspects
- ✅ Ask questions: If intent is unclear, ask the author

### Red Flags
- 🚩 No tests for new features
- 🚩 Tests are disabled or skipped
- 🚩 Security concerns (auth, input validation)
- 🚩 Breaking changes to backend API
- 🚩 Large refactor mixed with feature changes
- 🚩 CI/CD checks failing
- 🚩 Missing data-testid attributes for new UI components

### Quick Win Checks
1. Search for `console.log` - should be removed
2. Search for `.only(` - should not be in committed code
3. Search for `any` - minimize TypeScript any usage
4. Search for `TODO` - should have JIRA ticket reference
5. Search for hardcoded URLs or credentials

## Example Usage

```
/review-pr 4500
```

This will:
1. Fetch PR #4500 details from GitHub
2. Analyze the diff
3. Check CI/CD status
4. Review code against Quay standards
5. Check for common issues and anti-patterns
6. Provide structured review with recommendations

## Follow-up Actions

After review:
- Post review comments on GitHub using `gh pr review`
- Approve: `gh pr review $ARGUMENTS --approve`
- Request changes: `gh pr review $ARGUMENTS --request-changes -b "comment"`
- Add inline comments for specific issues
- Tag relevant team members if expertise needed

## Key Locations

- **PR on GitHub**: `gh pr view $ARGUMENTS --web`
- **Review standards**: `.claude/context/`
- **React patterns**: `.claude/context/react_standards.md`
- **Testing patterns**: `.claude/context/testing_patterns.md`

---

**Last Updated**: November 2024
