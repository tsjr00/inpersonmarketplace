# Session 70 — Live Cleanup and Audit

**Started:** 2026-04-10
**Mode:** Report (no code changes without explicit per-change approval)
**Purpose:** Identify the actual root causes behind "issues we fixed keep showing up," block-point the project from onboarding more users until the recurring-bug pattern is broken.

---

## TL;DR for session recovery

If this conversation gets compacted, here's what matters:

1. **Primary finding (actively broken in prod):** The multi-vertical vendor profile bug is live right now. `/api/vendor/markets/[id]/route.ts` throws `ERR_VENDOR_001` 9 times in the last 24 hours against 2 market IDs (b92a9c5c and b129614f). Root cause: `.single()` on `vendor_profiles` filtered only by `user_id` fails when a vendor has profiles in 2+ verticals.
2. **The same bug class has been "fixed" at least 3 times in March** — each fix patched one route and left the rest. Commits: `79c4fa87` → reverted `32ae7e8c` → re-fixed `17fa16cc` → `cc1f4462`. The pattern is "fix one caller" not "fix the root."
3. **50+ vendor API routes query `vendor_profiles` by `user_id` without a vertical filter.** Any of them can explode for multi-vertical vendors (e.g. Chef Prep / Med Prep Meals named in commit `cc1f4462`).
4. **Migration folder state is drifted** — 110–113 in pending but applied, 107–109 in both folders, 2 `ROLLBACK_*.sql` files where both contain identical migration 105 rollback code.
5. **`current_task.md` is 3 days stale,** `CLAUDE_CONTEXT.md` is missing sessions 67, 68, 69 + unnamed sessions.
6. **Error tracking IS working.** `error_logs` table captures every caught API error via `withErrorTracing → logError → logErrorToDb` at `src/lib/errors/logger.ts:36-65`. There is NO admin UI that surfaces it — errors accumulate invisibly. High/critical errors email `ADMIN_ALERT_EMAIL` via `sendAdminAlert` at `logger.ts:78-108`.

---

## Pass A: State Drift Report

### A.1 Migration folder

Cleanup work that was partially done and never committed.

| Migration | In pending/ | In applied/ | Applied to prod? | Status |
|-----------|------------|-------------|-----------------|--------|
| 107 `replaced_vendor_fk` | ✗ (git shows deletion) | ✓ | Yes | Uncommitted deletion in pending |
| 108 `day_of_sales_and_vendor_stay` | ✗ (git shows deletion) | ✓ | Yes | Uncommitted deletion in pending |
| 109 `day_of_cutoff_function` | ✗ (git shows deletion) | ✓ | Yes | Uncommitted deletion in pending |
| 110 `event_waves_schema` | ✓ | ✗ | Yes (per commit `ee40f7a0`) | Orphaned in pending |
| 111 `wave_rpc_functions` | ✓ | ✗ | Yes (per commit `ee40f7a0`) | Orphaned in pending |
| 112 `fix_company_paid_payout` | ✓ | ✗ | Yes (per commit `ee40f7a0`) | Orphaned in pending |
| 113 `hybrid_events_access_code` | ✓ | ✗ | Yes (per commit `ee40f7a0`) | Orphaned in pending |
| 114 `vendor_fee_discount` | ✗ | ✓ | Yes | Correctly handled |

**Other artifacts in pending/:**
- `ROLLBACK_105.sql` — rollback for migration 105
- `ROLLBACK_109.sql` — **contains IDENTICAL content to ROLLBACK_105** (both rollback the same `get_available_pickup_dates` function). This file is misnamed. Read in full to confirm.

**Cleanup required (awaiting user approval):**
- Move 110–113 from `supabase/migrations/` to `supabase/migrations/applied/`
- Commit the deletion of 107–109 from pending folder
- Either delete `ROLLBACK_109.sql` (appears to be a duplicate of 105) or rename to `ROLLBACK_109_actual.sql` with correct content
- Update `MIGRATION_LOG.md` to reflect 110–114 applied status

### A.2 Schema snapshot

`SCHEMA_SNAPSHOT.md` last changelog entry needs verification. Evidence from commit `80aec737` says migration 114 was applied and snapshot was updated. Need to verify 110–113 changes are reflected too.

**Known table staleness (from backlog.md):**
- `market_vendors` table shows 8 columns in snapshot, actual has 15+ (missing `response_status`, `invited_at`, `is_backup`, `backup_priority`, `replaced_vendor_id`, `event_max_orders_total`, `event_max_orders_per_wave`, etc.)

**Action deferred:** Needs user to run `REFRESH_SCHEMA.sql` for structured table regeneration.

### A.3 Docs staleness

| File | Last updated to reflect reality | Reality diverged at | Gap |
|------|-------------------------------|-------------------|-----|
| `current_task.md` | 2026-04-07 (Session 68/69 setup) | Commit `80aec737` (migration 114 shipped) | 3 days, 8+ commits |
| `CLAUDE_CONTEXT.md` session history | Session 66 (2026-03-30) | Sessions 67, 68, 69 + unnamed April sessions | 4+ sessions missing |
| `backlog.md` | 2026-04-02 (Session 66) | Shows uncommitted modifications | Unknown changes |
| `vault-manifest.md` | `vault/pre-session-59` at `7f895e5` (2026-03-16) | Many vaulted systems likely modified since | 25+ days |

### A.4 Untracked `.claude/*.md` files

20+ files listed as untracked. User confirmed these are notes/audits with mixed signal — some findings were false positives that look "unresolved." Not treating as open items unless specifically flagged.

### A.5 Error tracking system status

**What the user thought:** Errors are being captured and stored automatically.
**Reality:** Partially true.

| Component | Status | Evidence |
|-----------|--------|----------|
| `error_logs` table | ✓ Exists, indexed (6 indexes on code/created/user/route/pg_code/severity) | `SCHEMA_SNAPSHOT.md:1641-1649` |
| Auto-capture on API errors | ✓ Active in all routes wrapped with `withErrorTracing` | `src/lib/errors/with-error-tracing.ts:36-90`, calls `logError(traced)` which writes to DB |
| Populated in prod | ✓ Confirmed by user's query — 27 rows in last 30 days | User's SQL result |
| Admin UI to view error_logs | ✗ **Does not exist** | Searched — no page surfaces this |
| Admin email alerts for high/critical | ✓ Active for severity='high' or 'critical' | `src/lib/errors/logger.ts:78-108`, sends to `ADMIN_ALERT_EMAIL` env var |
| Test-run email suppression | ✓ Fixed recently (`e0bd2690`) | Commit log |
| `error_resolutions` table (fix attempt log) | ✓ Exists but only populated MANUALLY via `recordFixAttempt()` | `src/lib/errors/resolution-tracker.ts:199-232` |

**Gap:** User doesn't see errors because (a) there's no admin dashboard for `error_logs`, and (b) most errors are logged as severity='low' or 'medium' which don't email. They accumulate silently.

---

## Pass C Input — Error Logs Analysis (prod, last 30 days)

| error_code | route | severity | count | active? | interpretation |
|-----------|-------|----------|-------|---------|----------------|
| `ERR_VENDOR_001` | `/api/vendor/markets/b92a9c5c-…` | medium | 5 | **YES, last 2h** | **Multi-vertical vendor profile bug — ACTIVE** |
| `ERR_VENDOR_001` | `/api/vendor/markets/b129614f-…` | medium | 4 | **YES, last 2h** | **Same bug, different market** |
| `ERR_AUTH_001` | `/api/cart/items` | low | 7 | Low (last 2d) | Expected — "not authenticated" attempts on cart API (buyers browsing without login). Low concern. |
| `ERR_CART_003` | `/api/cart/items` | low | 6 | No (all Mar 30) | Burst within 17 minutes on Mar 30 — matches the Session 66 cart incident (event cap enforcement broke cart). Resolved by revert `240bc72d`. |
| `ERR_DB_UNKNOWN` | `/api/vendor/onboarding/documents` | **high** | 2 | No (Mar 14) | Needs investigation — unknown DB error during vendor doc upload, high severity, should have triggered admin email |
| `ERR_VALIDATION_001` | `/api/vendor/event-readiness` | medium | 2 | No (Mar 29) | One-off, low priority |
| `ERR_VENDOR_001` | `/api/vendor/onboarding/coi` | medium | 1 | No (Mar 29) | Same multi-vertical bug, different route |

**Two hot active issues:**
1. Multi-vertical vendor hitting `/api/vendor/markets/[id]` right now
2. A `high` severity `ERR_DB_UNKNOWN` on March 14 that should have emailed admin — did you receive it?

---

## PRIMARY FINDING — Multi-Vertical Vendor Profile Bug

This is the single most important finding in this audit. It explains why "fixed" issues keep showing up.

### The bug

Routes that do this pattern fail for vendors with profiles in 2+ verticals:

```typescript
const { data: vendorProfile, error: vpError } = await supabase
  .from('vendor_profiles')
  .select('id, tier')
  .eq('user_id', user.id)
  .single()  // ← fails with "no rows" error when vendor has 2+ profiles
```

When a user has `vendor_profiles` rows for both `farmers_market` and `food_trucks`, `.single()` throws "more than one row" which gets caught as `!vendorProfile` and emits `ERR_VENDOR_001 "Vendor profile not found"`. The vendor sees "Vendor profile not found" and has no idea what to do. They retry → same error → they try a different market → same error.

### Evidence this is actively happening

- **9 errors in the last 24 hours** on `/api/vendor/markets/[id]` across 2 different market IDs (user's error_logs query result)
- Commit `cc1f4462` (2026-03-31): *"Reported by real FM vendor (Chef Prep) on prod who also has an FT profile (Med Prep Meals)"* — this is a known real vendor hitting real bugs in production
- Commit `56282e5c` (recent, on main now): *"fix: cross-vertical auth — detect existing accounts, auto-add verticals"* — the platform explicitly supports multi-vertical vendors, but the routes haven't caught up

### The fix pattern exists (from `markets/[id]/schedules/route.ts:80-86`)

```typescript
const { searchParams } = new URL(request.url)
const vertical = searchParams.get('vertical')

let vpQuery = supabase
  .from('vendor_profiles')
  .select('id')
  .eq('user_id', user.id)
if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
const { data: vendorProfile, error: vpError } = await vpQuery.single()
```

The client side also needs updating to pass `?vertical=` on the API call (see `MarketScheduleSelector.tsx` changes in commit `cc1f4462`).

### Scope — routes that emit ERR_VENDOR_001 and need auditing

Grep for `traced.notFound('ERR_VENDOR_001'`:

1. `src/app/api/vendor/markets/[id]/route.ts` — **HOT (9 errors last 24h), PUT + DELETE both affected**
2. `src/app/api/vendor/profile/certifications/upload/route.ts`
3. `src/app/api/vendor/profile/certifications/route.ts` (2 call sites)
4. `src/app/api/vendor/onboarding/documents/route.ts`
5. `src/app/api/vendor/onboarding/coi/route.ts` — known to have hit this (1 log entry)
6. `src/app/api/vendor/onboarding/category-documents/route.ts`
7. `src/app/api/vendor/onboarding/acknowledge-prohibited-items/route.ts`
8. `src/app/api/vendor/event-readiness/route.ts` — known to have hit this

### Broader scope — 56 vendor API routes query vendor_profiles by user_id

A `.single()` on `vendor_profiles` filtered only by `user_id` appears in 56 files under `src/app/api/vendor/`. Not all of them necessarily throw ERR_VENDOR_001, but any of them that does `.single()` without a vertical filter can silently break for multi-vertical vendors. A systematic audit is needed.

### Fix history — why this pattern keeps recurring

| Date | Commit | What was fixed | Approach |
|------|--------|---------------|----------|
| 2026-03-30 | `79c4fa87` | Vendor event routes | First attempt |
| 2026-03-30 | `32ae7e8c` | **Reverted `79c4fa87`** | Implementation was wrong |
| 2026-03-30 | `17fa16cc` | Vendor event routes (take 2) | Different approach — look up market's vertical first, then filter vendor_profiles |
| 2026-03-31 | `cc1f4462` | `markets/[id]/schedules/route.ts` + `MarketScheduleSelector.tsx` | Client passes `?vertical=`, server filters on it |
| — | (not yet) | `markets/[id]/route.ts`, certifications, onboarding, event-readiness, … | **Never fixed** |

**Root cause of the recurring pattern: each fix patched one caller of the bad query, not the root.** There's no shared utility like `getVendorProfileForVertical(user, vertical)` that all routes could use. So every route that got written or updated without the current session thinking about multi-vertical reintroduces the bug.

---

## Pass B — Other Recurring-Issue Patterns

Pulled from `git log --all --grep=revert` and commits with repeated "fix: X" patterns.

### Pattern 1: Multi-vertical vendor profile (PRIMARY — see above)

### Pattern 2: Critical-path file modifications breaking cart/checkout
- Session 66: `240bc72d revert: remove event cap enforcement from cart API` — added cap logic to `cart/items/route.ts`, broke the cart, reverted
- This led to the `critical-path-files.md` rule requiring per-file approval for 13 protected files
- The `ERR_CART_003` burst in the error_logs is likely the prod trace of this incident
- **Current state:** Rule exists. Event order cap enforcement still "pending reimplementation" per backlog.

### Pattern 3: Location filtering regression
- Session 59: `11205be0 revert: restore server-side location filtering on browse page`
- Performance audit broke location search, took 8 commits to fix
- Led to the `vault` branch concept
- **Current state:** Working, vault at `7f895e5`

### Pattern 4: Event-approved vendor filter (messy implementation cycle)
- `a38d9764 feat: event approved vendor filter — client-side toggle, no pipeline changes`
- `44fd18e4 fix: event approved filter — add field to fallback query path`
- `4a3925e9 revert: remove all event approved filter code from vendor search`
- Also: `bd9846de revert: remove event_approved filter from vendors page`
- 2 reverts on this feature. Suggests a design that didn't converge.
- **Current state:** Reverted. Feature may or may not exist in some form.

### Pattern 5: Silent fallbacks masking bad data
- `92249b45 Revert silent fallback, fix seed data category names to match CATEGORIES`
- User memory explicitly has this feedback: "never mask bad data with fallbacks"
- **Current state:** Ongoing vigilance required.

### Pattern 6: Schema snapshot updates missed
- User's `CLAUDE.md` has an entire rule file dedicated to this (`schema-snapshot-mandatory.md`)
- Backlog flags `market_vendors` table as stale
- Same issue already captured in state drift section A.2
- **Current state:** Recurring process failure.

---

## Recommendations (NO ACTION without approval)

### Immediate (stop the bleeding)

1. **Fix the hot bug on `/api/vendor/markets/[id]`.** Apply the same pattern used in `markets/[id]/schedules/route.ts`. Client side: find the component that calls PUT/DELETE on this route and pass `?vertical=`. This unblocks the real vendor hitting it right now.
   - **CRITICAL PATH FILE REVIEW:** `/api/vendor/markets/[id]/route.ts` is NOT on the 13-file critical-path list, but it IS the route users hit to manage their markets. Still requires normal presentation-before-changing.

2. **Audit the other 8 ERR_VENDOR_001 emitters.** One file at a time. Present each fix for approval. Same pattern.

### Short-term (prevent recurrence)

3. **Create a shared `getVendorProfileForUserAndVertical(supabase, userId, vertical)` utility.** Every route calls it instead of inlining the query. Makes the bug structurally impossible to reintroduce.

4. **Full sweep of the 56 routes** that query `vendor_profiles` by `user_id`. Not all are vulnerable, but they all need to use the shared utility. One systematic PR with very careful review.

### Process (prevent silent accumulation)

5. **Error log visibility.** Two options:
   - **(a)** Build a simple admin page at `/admin/error-logs` with filters (code, route, severity, date). Estimate: small, ~1 session.
   - **(b)** Weekly digest email summarizing top error codes by count. Even smaller. Could be a cron job.
6. **Error log as Pass-C feed.** Every session kickoff, run the prod error_logs query and act on anything new. I'll add this to the process design in task #4.

### Bookkeeping

7. **Migration cleanup.** Move 110–113 to applied/, commit 107–109 deletions, resolve the ROLLBACK_109 misnamed file. Needs explicit approval.
8. **Update `current_task.md`** to reflect Session 70 instead of stale Session 69 content.
9. **Update `CLAUDE_CONTEXT.md`** session history with 67, 68, 69 + this session.
10. **Schema snapshot refresh** — user runs `REFRESH_SCHEMA.sql`.

---

## Open questions for user

1. **Did you receive admin alert emails on 2026-03-14** for the two `ERR_DB_UNKNOWN` high-severity errors on `/api/vendor/onboarding/documents`? If not, `ADMIN_ALERT_EMAIL` may not be set in prod env.
2. **Who is the vendor hitting `/api/vendor/markets/[id]` right now?** You may want to reach out directly and tell them the fix is coming — they've been trying for 24 hours.
3. **Is "multi-vertical vendor" a common case?** How many prod vendors have profiles in 2+ verticals? That scopes urgency.
4. **Order of operations for fixes** — do you want: (a) fix the hot route first, ship, verify, then do the sweep, or (b) do the full sweep in one PR?

---

## Work log

- **Pass A complete** — migration drift, docs drift, error tracking status captured above
- **Pass C input captured** — error_logs data from user's prod query analyzed
- **Pass B partial** — multi-vertical profile bug identified as primary recurring pattern with 3 prior fix attempts documented. Other reverts categorized.
- **Fix implemented (2026-04-10 session):** Shared utility `getVendorProfileForVertical()` + all 8 ERR_VENDOR_001 emitter routes + 4 client callers updated. See "Fix implementation" section below.
- **Task statuses:** All investigation tasks complete. Task #4 (process design) still pending. Fix pushed to staging: NOT YET (awaiting user review + test).

---

## Fix implementation (2026-04-10)

### Files created
- `src/lib/vendor/getVendorProfile.ts` — `getVendorProfileForVertical()` utility. Permissive-then-strict: single-profile users work regardless of vertical param, multi-profile users require vertical, clear disambiguation errors.
- `src/lib/vendor/__tests__/getVendorProfile.test.ts` — 9 unit tests, all passing

### Server routes updated (8)
All 8 routes that emit `ERR_VENDOR_001` now use the shared utility:

| Route | Strategy |
|-------|----------|
| `markets/[id]/route.ts` | Fetch market first → use `market.vertical_id` → no client change needed |
| `event-readiness/route.ts` | Pass `vertical` from `?vertical=` query param |
| `onboarding/acknowledge-prohibited-items/route.ts` | Pass `vertical` from `?vertical=` |
| `onboarding/category-documents/route.ts` | Pass `vertical` from `?vertical=` |
| `onboarding/coi/route.ts` | Pass `vertical` from `?vertical=` |
| `onboarding/documents/route.ts` | Pass `vertical` from `?vertical=` |
| `profile/certifications/route.ts` (PUT + GET) | Pass `vertical` from `?vertical=` |
| `profile/certifications/upload/route.ts` | Pass `vertical` from `?vertical=` |

The old half-fix `if (vertical) vpQuery = vpQuery.eq(...)` pattern (with comments `H12 FIX` / `H13 FIX`) was removed in favor of the utility.

### Client callers updated (4)
- `OnboardingChecklist.tsx` — 2 fetch calls now pass `?vertical=${vertical}`, also passes `vertical` prop down to `FoodTruckPermitUpload` and `Gate2Content` → `CategoryDocumentUpload`
- `DocumentsCertificationsSection.tsx` — 3 fetch calls now pass `?vertical=${vertical}`
- `FoodTruckPermitUpload.tsx` — added `vertical: string` prop, fetch call passes it
- `CategoryDocumentUpload.tsx` — added `vertical: string` prop, fetch call passes it

### Client callers NOT updated
- `CertificationsForm.tsx` — **DEAD CODE**. Only its `Certification` TYPE is imported in `vendor/edit/page.tsx`. The component itself is not rendered anywhere (verified by grep for `<CertificationsForm`). Flagged for future cleanup.
- Any staging-only components outside the scope grep — none found

### Verification completed before handoff
- `npx tsc --noEmit` — clean
- `npm run lint` — 1 pre-existing error in `OrganizerEventDetails.tsx` (not touched by this session), 0 new errors introduced. Scoped lint of all 14 files I modified: 0 errors, 2 pre-existing warnings about unused vars.
- `npx vitest run` — 1462 tests passing across 51 test files
- 9 new unit tests for the utility — all passing

### What was NOT done
- **No commits, no pushes.** Changes are staged in working tree only, awaiting user review.
- **No migration file moves** (110–113 still orphaned in pending folder).
- **No updates to** `current_task.md`, `CLAUDE_CONTEXT.md`, `MIGRATION_LOG.md`, `SCHEMA_SNAPSHOT.md`.
- **No admin email per-vertical routing fix** (user requested but deferred to separate task).
- **No admin error_logs dashboard** (separate task).
- **No sweep of the other ~48 vendor routes** that query `vendor_profiles` by user_id without triggering ERR_VENDOR_001 — scoped for a future session.

### Staging verification plan (for user)
When ready to push to staging:
1. `git add -p` to review each hunk
2. Commit with message describing the multi-vertical fix
3. Merge main → staging, push staging
4. On staging, sign in as the multi-vertical test user (the one with both FM + FT profiles — user_id `beb62cf2-d1ec-48bf-989e-5f632254094e`)
5. Verify each of the affected flows works:
   - Edit a market → save → should succeed (was broken)
   - Delete a market → should succeed (was broken)
   - Upload onboarding business document → should succeed
   - Upload category/permit document → should succeed
   - Upload COI → should succeed
   - Acknowledge prohibited items → should succeed
   - Submit event readiness → should succeed
   - Save certifications → should succeed
   - Upload certification document → should succeed
6. Also test with a single-vertical vendor to ensure no regression (utility's permissive path)
7. If all green → push to prod (respecting 9 PM – 7 AM CT window)
8. After prod push, re-query error_logs — `ERR_VENDOR_001` count should stop climbing

---

*This file is a research working document per `CLAUDE.md` Incremental Research Protocol. It should survive context compaction. Update AS work progresses, not at the end.*
