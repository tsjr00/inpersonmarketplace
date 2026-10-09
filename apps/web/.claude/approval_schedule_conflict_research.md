# FM approval fails on a vendor's schedule conflict elsewhere — research for option A (2026-10-08, RESEARCH ONLY)

Owner: "research what is involved in item A … make sure we don't break something else. research only."
Trace `mugcqpnz-n44s9t` (Staging, 2026-09-25 02:39 UTC): `PATCH /api/market-manager/[marketId]/vendor-approval`,
update on `market_vendors`, P0001 "Schedule conflict: overlapping times with "River Road Farmers Market"…".

## The chain (all read in full this session)
1. Manager approves → `vendor-approval/route.ts:139-156` updates `market_vendors.approved = true`.
2. AFTER UPDATE trigger `trigger_auto_create_vendor_schedules` (WHEN approved changes; mig 002, re-created 095) →
   `auto_create_vendor_schedules()` (current body = mig 210): skips `vertical_id = 'food_trucks'`, otherwise
   INSERTs an ACTIVE `vendor_market_schedules` row for EVERY active `market_schedules` day of the market.
3. Each insert fires BEFORE INSERT `trg_check_vendor_schedule_conflict` → `check_vendor_schedule_conflict()`
   (mig 253): unless `profile_data.multiple_trucks` is true, an overlap with an ACTIVE schedule at ANOTHER market on
   the same weekday → `RAISE EXCEPTION` (default SQLSTATE P0001).
4. The raise aborts the trigger → the approval UPDATE rolls back → route `:165` `throw traced.fromSupabase` →
   `parseSupabaseError` has no P0001 mapping → `ERR_DB_UNKNOWN`, severity high → `error_logs` + admin email; manager
   sees the trigger sentence on the row (`VendorBoothList.tsx:314-316`).

## Three triggers create schedule rows the same way — option A must cover all three
| Trigger | Fires when | Function | Can trip the conflict? |
|---|---|---|---|
| `trigger_auto_create_vendor_schedules` | `market_vendors` UPDATE, approved changes | `auto_create_vendor_schedules` (mig 210 body) | YES — this incident |
| `trigger_auto_create_vendor_schedules_insert` | `market_vendors` INSERT with approved=true | `auto_create_vendor_schedules_insert` (mig 002 body; NO FT skip) | YES (who inserts approved=true? not traced — see owed) |
| `trigger_auto_add_schedule_to_vendors` (+ `_update` on reactivation) | `market_schedules` INSERT / reactivated | `auto_add_schedule_to_vendors` (mig 002 body) | YES — a MANAGER adding or reactivating a market day inserts rows for every approved vendor; one vendor's conflict elsewhere fails the manager's day edit. Route logs it as a DB error too (`market-manager/[marketId]/schedules/route.ts:318-319`). Not yet observed, same mechanism. |

## Environment state — matters for timing
- Mig 253 (conflict rule for BOTH verticals) is ✅ Dev + Staging, **⏳ Prod PENDING** (`SCHEMA_SNAPSHOT.md:75`). On
  Prod the FM exemption (mig 247) still applies → this failure cannot happen on Prod TODAY; it will the moment 253
  lands in the Prod catch-up. **Option A should ship before or with 253 on Prod.**
- `check_vendor_schedule_conflict` body: byte-identical on all three envs as of 2026-09-15 (253 header), then 253
  applied Dev + Staging. `auto_create_vendor_schedules` / `_insert` / `auto_add_schedule_to_vendors`: live bodies
  NOT fingerprinted this session (snapshot `:4055-4057` lists them, no hash) → pre-check owed.
- Newest migration = 261; Rule L allowance OK (stamp 261).

## History that constrains the fix (mig 210 / 211 / 224)
- 210 (2026-07-25): the SAME failure on FT parks ("phantom conflict" blocked an operator's Approve). Fix = skip
  auto-create for FT entirely. Its own header (2026-08-12 note) says: the fix was right; "approval is vetting, not
  scheduling"; consequence 3 = an approved truck has NO schedule until it saves one and nothing prompts it.
- 211 misread 210 and deactivated real vendor-entered FT schedules on Prod (incident); 224 restored them.
  Lesson recorded there: `vendor_market_schedules` has no provenance column (created_by/source) — auto-created rows
  cannot be told from vendor-entered rows after the fact. Any option that later "cleans up" auto rows is unsafe.
- `respond/route.ts:92-108` relies on the FM auto-create existing (refuses event accepts because the flip "fabricates
  schedule rows"). Option A keeps auto-create → that reasoning still holds.

## What depends on auto-created rows (FM)
- Market visibility: a traditional market shows when ≥1 vendor has a published listing linked AND an ACTIVE
  `vendor_market_schedules` row (`markets/nearby/route.ts:88-94` comment; `lib/markets/market-visibility.ts`,
  `visible-markets.ts` — not read this session, consumers only).
- Manager "active vendors" filter (`market-manager/[marketId]/vendors/route.ts:76-90` reads is_active rows).
- Vendor week strips, booking gates, surveys — readers only (list in the 10-08 writer scan).
- The listing form ALSO upserts the same rows on listing save (`ListingForm.tsx:455-460`, `ignoreDuplicates`),
  and silently ignores the upsert error → a conflict there drops the vendor's days with no message. Separate defect.

## Option A — design sketch (NOT built)
**Rule:** approval (and a manager adding a day) never fails because of ONE vendor's conflict at ANOTHER market;
the conflicting day is skipped, everything else is created, and the manager is told what was skipped.

1. **Migration (one file, three functions):** replace the row-set INSERT in `auto_create_vendor_schedules`,
   `auto_create_vendor_schedules_insert` and `auto_add_schedule_to_vendors` with a loop that inserts ONE row inside
   a sub-block `BEGIN … EXCEPTION WHEN raise_exception THEN <skip> END` — only when SQLERRM starts with
   'Schedule conflict' (re-raise anything else). This reuses the ONE conflict rule (no second copy of the overlap
   predicate — the project's "never a fourth copy" rule). Keep the FT skip in the UPDATE function; decide whether the
   INSERT function should get the same FT skip it never had (today an FT `market_vendors` INSERT with approved=true
   would auto-create all park days — check who does that).
   Pre-check: `pg_get_functiondef` of all three on Dev/Staging/Prod (drift); post-check: behavioural — approve an FM
   vendor with a known overlap → approved, conflicting day absent, other days present.
2. **Route (`vendor-approval`):** after a successful approval, compare the market's active `market_schedules` with
   the vendor's `vendor_market_schedules` at this market → `skippedDays: ['Saturday']` in the response; manager UI
   (`VendorBoothList.tsx`) shows "Approved. Saturday was not added: this vendor is already at another market then."
   Same for the manager day-editor (which vendors were skipped).
3. **Error mapping (`supabase-errors.ts`):** add `P0001` → a validation-class code (e.g. `ERR_DB_RULE`,
   severity low/medium, 400/409) so a trigger refusal anywhere stops emailing the owner as "unknown DB error".
   ⚠ Blast radius: EVERY `traced.fromSupabase`/`observed()` on a P0001 — booth-number triggers already special-case
   P0001/P0005 before falling through; other sites would change from 500+email to 4xx+no email. Needs the list
   (grep `P0001` = 5 explicit handlers today) and a decision on severity.
4. **Tests:** (a) SQL behaviour cannot run in vitest (no DB) → an integration test against Dev exists for other
   RPCs (`integration` suite, 52 specs) — add one: approve with an overlap → row count; (b) route-execution test for
   `skippedDays`; (c) pin that all three trigger functions carry the sub-block (migration-text scan).
5. **Docs:** map 12 (manager) + 18/`SCHEMA_SNAPSHOT` functions section + changelog row (Rule G) · registry row ·
   printable W6 step · decisions row (rule: "a vendor's conflict elsewhere never blocks approval").

## Risks / what could break
- **Silent skip ≠ silent loss:** the skip must be REPORTED (step 2) or a vendor is approved with a missing day and
  nobody knows — the 210 consequence-3 problem again. The vendor can still activate the day themselves on their
  schedules page once they declare multi-location or free the other day (existing 409 path).
- **Exception sub-blocks in triggers:** each caught exception forces a sub-transaction; cost is per row (a market has
  ≤7 days × 1 vendor on approval; the add-day trigger = 1 day × N approved vendors). Negligible, but note it.
- **Catching by message text** ('Schedule conflict') couples the three functions to the conflict function's wording;
  safer: give the conflict RAISE a custom SQLSTATE (e.g. `P0006`) in the same migration and catch that. That
  touches `check_vendor_schedule_conflict` (prod-pending 253) and the 2 routes that match on the message
  (`schedules/route.ts:445,673` — message match still works if the text is unchanged).
- **mig 253 pending on Prod:** ship A before/with it, or Prod gets the failure first.
- **Listing-form silent drop** stays unless addressed (separate).
- **Who INSERTs `market_vendors` with approved=true** (self-approve paths, admin tools, seeds)? Not traced → owed.

## Owed before any build
- Owner: `SELECT proname, md5(prosrc) FROM pg_proc WHERE proname IN ('auto_create_vendor_schedules',
  'auto_create_vendor_schedules_insert','auto_add_schedule_to_vendors','check_vendor_schedule_conflict')` on all 3 envs.
- Claude: read `market-visibility.ts` / `visible-markets.ts` in full; trace `market_vendors` INSERT writers; read
  `manager/[marketId]/schedules/route.ts` lines 270-330 in full; list the P0001 fall-through sites; decide on
  custom SQLSTATE vs message match; read `VendorBoothList.tsx` approval handler in full.
