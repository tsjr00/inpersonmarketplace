# Build Instructions: Pre-commit Hooks

**FOR CC TO READ AND EXECUTE**

**Phase:** Phase-N-1-Pre-commit-Hooks  
**Branch:** feature/pre-commit-hooks  
**Estimated Time:** 20-30 minutes  
**Complexity:** Low

---

## CC: CRITICAL - Autonomous Operation Mode

**CC: Full autonomous permission. Do NOT ask Tracy for permission for file operations, package installs, commits, or pushes. Just do it and report what you did.**

**Only ask if:** Deleting production data, adding secrets, or truly ambiguous requirement.

---

## CC: Objective

Set up Husky and lint-staged to automatically format code and catch errors before commits. Prevents messy commits and catches TypeScript/ESLint errors early.

---

## CC: Pre-flight Checklist

- [ ] On branch: feature/pre-commit-hooks
- [ ] In /apps/web directory

**CC: Report verification, then proceed**

---

## Implementation

### Install Dependencies

**CC: Run in /apps/web:**
```bash
npm install -D husky lint-staged prettier
npx husky init
```

### Configure Husky Pre-commit Hook

**File:** `/apps/web/.husky/pre-commit`

**CC: Replace content with:**
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

cd apps/web
npx lint-staged
```

### Configure lint-staged

**File:** `/apps/web/package.json`

**CC: Add this section:**
```json
{
  "lint-staged": {
    "**/*.{ts,tsx}": [
      "prettier --write",
      "eslint --fix",
      "tsc-files --noEmit"
    ],
    "**/*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

**Install tsc-files:** `npm install -D tsc-files`

### Configure Prettier

**File:** `/apps/web/.prettierrc`

**CC: Create with:**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Update .gitignore

**File:** `/apps/web/.gitignore`

**CC: Add if not present:**
```
.husky/_
```

---

## Testing

**CC: Test the hook:**
1. Make small change to any .ts file (add comment)
2. Try to commit
3. Verify: Prettier formats, ESLint runs, TypeScript checks
4. Commit should succeed with formatted code

---

## Git Operations

**Commits:**
1. "feat(tooling): Add pre-commit hooks with husky and lint-staged"
2. "test: Verify pre-commit hooks working"

**Push after commits**

---

## CRITICAL: End-of-Session Requirements

1. Create session summary: `/docs/Session_Summaries/Phase-N-1-Pre-commit-Hooks-2026-01-13.md`
2. Update SESSION_LOG
3. No migrations
4. Commit documentation
5. Report to Tracy

---

## Success Criteria

- [ ] Husky installed and initialized
- [ ] Pre-commit hook configured
- [ ] lint-staged configured
- [ ] Prettier configured
- [ ] Tested with actual commit
- [ ] Session documentation complete

---

## Notes

- Hook runs automatically on `git commit`
- Only checks staged files (fast)
- Can skip with `git commit --no-verify` if needed
- Catches errors before they reach GitHub
