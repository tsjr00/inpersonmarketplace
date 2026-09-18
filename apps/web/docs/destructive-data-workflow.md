# Destructive Data Workflow — purges, resets, seed removal

**Loaded when writing ANY SQL that deletes rows outside a migration** (test-data purges, seed removal before launch,
"start clean" resets). Migrations have their own workflow (`migration-workflow.md`); this one exists because a purge
is MORE dangerous than a migration and, on 2026-09-18, got less rigor.

---

## The incident this comes from (Dev purge, 2026-09-18)

Three failed runs of a destructive script, then the deletes committed **without the post-check ever running**.
The outcome happened to be correct. The safety net was not there.

1. A guard was hard-coded to a row count taken from `pg_stat_user_tables` — an ESTIMATE (5). The exact count was 6
   and had been pasted by the owner in the same conversation.
2. The script relied on `BEGIN`/`COMMIT` plus a TEMP table surviving across statements. In the Supabase SQL editor
   the temp table did not survive; the deletes ran unguarded and committed.
3. Three revisions were sent live without a dry run; one had a syntax error.
4. After the first failure, "nothing was deleted" was asserted from transaction reasoning instead of a read-only count.
5. A purge got less ceremony than a migration (no class banner, no pre-check, no post-check, no file).

Full record: `apps/web/.claude/test_data_reset_research.md` and `apps/web/.claude/rule-incidents.md`.

---

## The rules

### 1. Exact counts only
Every number in a guard comes from an exact `count(*)` the owner ran and pasted **this session**. Never from
`pg_stat_*`, never from memory, never from an earlier turn's estimate. If a table's exact count is not on screen,
it is not in a guard.

### 2. One atomic `DO` block — nothing else
Guards, count capture (into PL/pgSQL variables), deletes and post-checks all live inside ONE `DO $$ … $$;` statement.
- No `BEGIN`/`COMMIT`. No temp tables. No multi-statement state. The Supabase editor does not guarantee any of it.
- Arithmetic on single lines (a multi-line `+` continuation produced a parse error).
- An exception anywhere inside the block rolls back everything inside it — by Postgres, not by the editor.

### 3. Prove the net before the payload
Before the real run, the owner runs the IDENTICAL block with **one guard deliberately wrong** (expected count + 1).
- It must fail with that guard's message.
- A read-only count query must then show nothing changed.
- Only then run it with the correct guard. The failing run doubles as the syntax check: a parse error fails the
  whole block before any delete executes.

### 4. After ANY error, the first action is a read-only count
No re-run, no revised script, no statement about what happened until the counts are on screen. A destructive
script is never fixed forward.

### 5. Blast radius in the pre-check
From the FK map (`SCHEMA_SNAPSHOT.md` → Foreign Keys), list every table each `DELETE` cascades into, and every
table with a RESTRICT / NO ACTION reference that will block the delete (delete those children first, or null the
link). Every KEPT table a cascade could touch goes into the post-check. Circular links (e.g.
`markets.catering_request_id` ↔ `catering_requests.market_id`) are nulled on one side first.

### 6. The script lives in a file
`supabase/maintenance/YYYYMMDD_<env>_<purpose>.sql`, reviewed like a migration. Header = class banner
(`⛔ DESTRUCTIVE — run the failing-guard dry run first`), the pre-check query, the expected counts, the post-check.
Not composed ad hoc across chat turns. The owner pastes the file.

### 7. Staging / Prod: never a table-wide `DELETE` where real rows could exist
Target rows by owner-confirmed accounts / ids / seed-id prefixes. The Stripe-id safety count (payments, payouts,
fee payments, rentals, bookings, subscriptions carrying a Stripe id) for the TARGETED set must be zero, or the
owner confirms in writing that those are test-mode objects. A row with a real transfer id is never deleted by this
workflow.

### 8. What the pre-check must show the owner
Per table: rows to delete. Per kept table: exact current count (these become the post-check baseline captured
inside the block — not hard-coded). The Stripe safety lines. The distinct owners (buyers / vendors) affected.

---

## Template (single atomic block)

```sql
DO $$
DECLARE
  keep_users bigint; keep_vendors bigint; keep_listings bigint; keep_markets bigint;
  leftover bigint;
BEGIN
  -- 1. guards on the purge set — EXACT numbers the owner pasted
  IF (SELECT count(*) FROM orders) <> 27 THEN RAISE EXCEPTION 'orders: expected 27'; END IF;
  IF (SELECT count(*) FROM vendor_payouts WHERE stripe_transfer_id IS NOT NULL) <> 0
    THEN RAISE EXCEPTION 'SAFETY: real Stripe transfer present'; END IF;

  -- 2. capture the kept structure (exact, inside the same statement)
  SELECT count(*) INTO keep_users FROM user_profiles;
  SELECT count(*) INTO keep_vendors FROM vendor_profiles;
  SELECT count(*) INTO keep_listings FROM listings;
  SELECT count(*) INTO keep_markets FROM markets;

  -- 3. deletes, children before parents
  DELETE FROM market_box_pickups;
  -- …

  -- 4. post-checks
  SELECT (SELECT count(*) FROM orders) + (SELECT count(*) FROM order_items) INTO leftover;
  IF leftover <> 0 THEN RAISE EXCEPTION 'post-check: purge set not empty (%)', leftover; END IF;
  IF (SELECT count(*) FROM user_profiles) <> keep_users THEN RAISE EXCEPTION 'post-check: user_profiles changed'; END IF;
  -- …
END $$;
```

Dry run = the same block with one guard number changed (e.g. `<> 28`). Expected: the guard's message, and a
read-only count afterwards identical to before.
