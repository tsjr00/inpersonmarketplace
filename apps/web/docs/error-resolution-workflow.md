# Error Resolution Workflow

**Loaded when fixing any error.** The `error_resolutions` table tracks all fix attempts and outcomes.

---

## STOP — Read This First

**Before fixing ANY error, you MUST:**

1. Create a task with first item: "Query error_resolutions for similar issues"
2. Actually run the query below (or ask user to run it)
3. Review results before proposing ANY fix
4. Document your fix attempt in `error_resolutions` when done

**This is not optional. Skipping this step wastes time repeating failed approaches.**

---

## Step 1: Query Before Fixing (REQUIRED)

```sql
-- Run this FIRST for any error involving these keywords
SELECT error_code, attempted_fix, status, failure_reason, migration_file
FROM error_resolutions
WHERE
  attempted_fix ILIKE '%KEYWORD%'  -- Replace with: RLS, policy, recursion, column, schema, etc.
  OR error_code ILIKE '%KEYWORD%'
ORDER BY created_at DESC
LIMIT 20;
```

**If you cannot query the database directly, ask the user to run this query and share results.**

---

## Step 2: After Each Fix Attempt

Document what was tried, whether it worked, and why:

```sql
INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  failure_reason,
  verification_method,
  created_by
) VALUES (
  'ERR_XXX_001',           -- Categorized error code
  'Description of fix',    -- What was attempted
  '20260130_007_xxx.sql',  -- Migration file if applicable
  'Summary of changes',    -- Code/policy changes made
  'verified',              -- 'pending', 'verified', 'failed', 'partial'
  NULL,                    -- Reason if failed
  'manual',                -- How it was verified
  'Claude'                 -- Who made the fix
);
```

---

## Error Code Categories

| Prefix | Meaning |
|--------|---------|
| `ERR_RLS_XXX` | Row Level Security issues |
| `ERR_PERF_XXX` | Performance warnings |
| `ERR_SEC_XXX` | Security warnings |
| `ERR_SCHEMA_XXX` | Schema/column issues |
| `ERR_AUTH_XXX` | Authentication issues |
| `ERR_VENDOR_XXX` | Vendor profile / API issues |
| `ERR_PAYOUT_XXX` | Stripe payout issues |

---

## Why This Matters

- Prevents repeating failed approaches
- Documents what works for specific error patterns
- Enables future developers (human or AI) to learn from past fixes

---

## Error Log Review (Protocol 8)

At every session kickoff, run this query against prod to catch active and regressed errors:

```sql
SELECT error_code, route, severity, COUNT(*) AS cnt,
       MAX(created_at) AS last_seen,
       MIN(created_at) AS first_seen
FROM error_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY error_code, route, severity
ORDER BY cnt DESC
LIMIT 20;
```

Review the output with these questions:
- **New error codes** — not seen in prior sessions? Investigate. Add to task list if real bugs.
- **Climbing codes** — were they "fixed" in a prior session but reappearing? That's a regression. Stop and root-cause before doing anything else.
- **High-severity codes** — `high` or `critical`? Flag immediately. These may warrant a hotfix this session.
- **Active vs stale** — is `last_seen` within the last hour? That's an active issue. Within the last day? Recent. Older than a week? Historical.

For full Protocol 8 details, see `PROCESSES_AND_PROTOCOLS.md`.
