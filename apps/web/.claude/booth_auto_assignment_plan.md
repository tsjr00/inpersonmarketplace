# Booth Auto-Assignment + Hands-Off Rental Flow — Design

**Started:** 2026-05-20 (Session 84)
**Mode:** Report (no code yet — presenting design, awaiting decisions)
**Goal (user words):** *"booth number auto-assignment and any other elements needed for a vendor to rent a booth and get it assigned + the MktMgr informed & paid, without the manager having to do anything."*

---

## Mechanical-gate findings (executed per new rule from Session 84 memory)

Searched `apps/web/.claude/` for locked decisions about auto-assignment:

| Doc | Line | Decision |
|---|---|---|
| `market_manager_v2_plan.md` | 53 | "Booth-number auto-assignment: **Path B (manual) locked for v1**; Path A (auto) deferred to v2.future" |
| `market_manager_v2_plan.md` | 128 | "Booth auto-assign vs manual | **Path B (manual) for v1**; Path A deferred" |
| `market_manager_v2_plan.md` | 309-325 | Full Path A vs Path B writeup |
| `phase_c_payment_loop_plan_2026-05-16.md` | 29 | "Booth auto-assignment (Path A) — locked as Path B (manual) for v1." |
| `market_manager_state_review_2026-05-14.md` | 573 | "Booth auto-assignment — locked as Path B (manual) for v1; Path A (auto) deferred to v2.future." |

**Path B was locked because** (`market_manager_v2_plan.md:316`): *"complex to implement well; edge cases (manager wants to block a booth, vendor cancels and booth needs to be released, etc.)"*

**Two of those edge cases have since been resolved:**
- "Manager wants to block a booth" → handled by `market_booth_placeholders` (mig 135) — placeholders reduce capacity by count.
- "Vendor cancels and booth needs to be released" → per `current_task.md:45-48` locked policy: **no vendor self-cancellation**. Once paid, booth is theirs for the week. Only Stripe-fail + cron Phase 16 sweeps create cancelled rows (and Stripe-fail deletes the row entirely).

**Conclusion:** user's request to work on auto-assignment is a deliberate reopen of the v2.future scope. The original blocking edge cases are largely gone. **Need explicit user confirmation that they're reopening v2.future scope before I implement.**

---

## Current state (verified, file:line citations)

**Booking flow (verified Pass 4):**
- `src/app/api/vendor/markets/[id]/book/route.ts:289-298` calls RPC `book_weekly_booth_atomic` inside the existing (market, inventory, week) advisory lock
- `supabase/migrations/20260518_142_book_weekly_booth_atomic.sql:115-131` INSERTs with `booth_number=NULL` (the column is left null at booking time)
- After Stripe succeeds and webhook flips status='paid', booth_number remains NULL until manager assigns

**Webhook flow (verified Pass 5 + this session):**
- `src/lib/stripe/webhooks.ts:1124-1308` `handleBoothRentalCheckoutComplete`
- Flips status pending_payment → paid (line 1172-1189)
- Fires `booth_rental_paid_vendor` (line 1266-1280) and `booth_rental_paid_manager` (line 1286-1301) notifications
- Notification payload does NOT currently include booth_number

**Notification templates (verified this session):**
- `src/lib/notifications/types.ts:572-584` `booth_rental_paid_vendor`: *"The manager will reach out with a booth number assignment before market day."* ← manual-assignment language
- `src/lib/notifications/types.ts:589-606` `booth_rental_paid_manager`: doesn't mention booth_number
- `src/lib/notifications/types.ts:631-641` `booth_rental_payment_failed_vendor`: cleanup notification

**UI state (verified Pass 5):**
- `src/app/[vertical]/vendor/bookings/page.tsx:256` already renders `booth_number` conditionally (` · Booth ${r.booth_number}`) — no UI work needed there
- `src/components/vendor/BookBoothForm.tsx:153-155` success state: *"The manager will reach out with a booth number assignment before your market day."* ← language needs update
- `src/components/market-manager/WeeklyBookingsList.tsx` renders booth_number + editable input — manager override still works

**DB constraint state (verified Pass 1):**
- `weekly_booth_rentals` has UNIQUE only on `(vendor_profile_id, market_id, week_start_date)` (mig139:83)
- **No UNIQUE on `(market_id, week_start_date, booth_number)`** — same-week booth-number double-assignment is currently possible. This is backlog item P1.5 / N6a.

**Booth-number storage:**
- All three tables use `booth_number TEXT` (free-form text, max 50 chars by app validation)
- `market_vendors.booth_number` (legacy, regular vendor — not weekly rental)
- `market_booth_placeholders.booth_number` (off-platform occupancy; UNIQUE per market)
- `weekly_booth_rentals.booth_number` (this PR's target)

---

## Design

### Decision 1: Booth-number labeling scheme

**D1.A — Per-tier sequence integers (RECOMMENDED).** Auto-assigned labels are "1", "2", "3"… within each size tier. Renders in UI as "Booth 1 (10x10)" / "Booth 1 (10x20)". Capacity is by count; placeholders use whatever labels they want (don't have to match).

**D1.B — Concatenated label.** Auto-assigned labels are "10x10-1", "10x10-2". More self-documenting in cross-tier reports but longer in the UI.

**D1.C — Manager-enumerated list.** Add `booth_labels TEXT[]` column to `market_booth_inventory`; manager populates ["A1", "A2", "B1"]; system picks lowest-indexed unassigned label. **Conflicts with "manager doesn't do anything" — discarded.**

**Recommendation: D1.A.** Simplest implementation, matches the user's hands-off constraint. Manager can override per-booking via the existing PATCH if they want different labels.

### Decision 2: When does auto-assignment happen?

**D2.A — Inside the existing `book_weekly_booth_atomic` RPC (RECOMMENDED).** Already inside the (market, inventory, week) advisory lock — naturally race-safe. Booth number is set BEFORE payment lands. If payment fails (book route's catch block deletes the orphan row → number freed). If payment stalls (cron Phase 16 sweeps after 30 min orphan / 24 h stale → status='cancelled', number scoped out by the UNIQUE constraint condition).

**D2.B — In `handleBoothRentalCheckoutComplete` after status flip.** Only assign after we know they paid. Needs its own race-safe assignment query outside the original lock. Adds complexity.

**Recommendation: D2.A.** Pending_payment rows already count toward capacity (mig142:103), so assigning the label then is consistent with capacity semantics. Cleaner code path.

### Decision 3: Placeholder-label collision handling

Manager might have placeholder labeled "3" (off-platform vendor). System auto-assigns integers 1..N.

**D3.A — Skip placeholder labels that parse as integers (RECOMMENDED).** Inside the RPC, union the set of in-use integer labels from both `weekly_booth_rentals` (this week, non-cancelled) and `market_booth_placeholders` (this market, this inventory). Auto-assigned number = smallest 1..count not in the union.

**D3.B — Ignore placeholder labels.** Just count for capacity, don't bother matching labels. Simpler but a placeholder "3" can coexist with auto-assigned "3" → confusing in the dashboard.

**Recommendation: D3.A.** Marginal extra SQL (a UNION); avoids visible label collisions.

### Decision 4: DB-level UNIQUE constraint (N6a from backlog P1.5)

Add a partial UNIQUE index on `weekly_booth_rentals(market_id, week_start_date, booth_number) WHERE booth_number IS NOT NULL AND status <> 'cancelled'`.

- Excludes NULL bookings (pre-auto-assignment legacy rows)
- Excludes cancelled rows (so their freed labels can be reused)
- Active states (pending_payment, paid, completed) are uniqueness-checked

Auto-assignment naturally satisfies this. Manager PATCH must also satisfy — need to catch 23505 and return a friendly 409.

### Decision 5: Notification template updates

`booth_rental_paid_vendor`:
- Add `boothNumber?: string` to template data
- New message: *"Your booth booking at MarketName for the week of WEEK is confirmed ($X). Your booth is **#N**. See you there."* (Fall back to existing "manager will reach out" copy if boothNumber missing — for old data backfill.)

`booth_rental_paid_manager`:
- Add `boothNumber?: string`
- New message: *"VendorName booked **Booth #N** at MarketName for the week of WEEK. Your portion ($X) will arrive in your Stripe account."*

### Decision 6: Webhook payload update

`handleBoothRentalCheckoutComplete` (CRITICAL-PATH FILE — needs file-level approval):
- Add `booth_number` to the rental row SELECT (line 1202-1206)
- Pass `boothNumber` into both notification calls

### Decision 7: Vendor BookBoothForm success state

`BookBoothForm.tsx:135-176` (success flash):
- The flash fires when Stripe redirects back. Server may or may not have processed the webhook yet — so booth_number may or may not be set.
- Simplest: keep the current copy ("manager will reach out") — it'll be obsolete but harmless. Vendor sees the assigned number on their My Bookings page within a minute.
- Better: server-side fetch of the rental row on the success page; if booth_number is set, show it.
- **Defer the "better" — minor UX, not blocking.**

### Decision 8: What about existing NULL booth_numbers on staging/prod?

Bookings already made before this rolls out have `booth_number=NULL`. Options:
- Leave them — manager assigns manually (current flow)
- Backfill via a one-shot script as part of the migration

**Recommendation: leave existing nulls.** New bookings get auto-assigned; manager dashboard's "needs booth #" count clears for new ones; old ones still need manager touch.

---

## Critical-path file impact

Per `apps/web/.claude/rules/change-discipline.md` Rule 3, modifying critical-path files requires file-specific approval with explicit risk statement.

**On critical-path list (needs explicit approval to modify):**
- `src/lib/stripe/webhooks.ts` — Decision 6. Risk: this file processes Stripe webhook events; a bug here causes orders not to register as paid. Mitigation: changes are limited to one function (`handleBoothRentalCheckoutComplete`) and only modify the notification payload — not the status flip logic.

**Not on critical-path list:**
- `src/lib/notifications/types.ts` — Decision 5
- `src/app/api/market-manager/[marketId]/weekly-rental/[rentalId]/route.ts` — Decision 4 (23505 mapping)
- `src/components/vendor/BookBoothForm.tsx` — Decision 7 (deferred)
- New migration file
- Possibly modifying mig 142's existing RPC via `CREATE OR REPLACE FUNCTION` (no schema change; function-only)

---

## Proposed work breakdown (in order)

1. **New migration 144 — booth auto-assignment**
   - `CREATE OR REPLACE FUNCTION book_weekly_booth_atomic(...)` replacing mig 142's RPC. New body: same lock + capacity logic + auto-assign integer booth_number + INSERT with the assigned number.
   - `CREATE UNIQUE INDEX idx_wbr_market_week_booth ON weekly_booth_rentals(market_id, week_start_date, booth_number) WHERE booth_number IS NOT NULL AND status <> 'cancelled'` (N6a).
   - Rollback block: revert function to mig 142's body + DROP INDEX.

2. **Notification template updates** — `src/lib/notifications/types.ts`. Add `boothNumber?` to template data shape. Update two message templates with conditional booth-number line.

3. **Webhook handler update** — `src/lib/stripe/webhooks.ts` `handleBoothRentalCheckoutComplete`. **Requires explicit file-level approval per Rule 3.** Select `booth_number` from rental row; pass into notification payloads.

4. **Manager PATCH 23505 mapping** — `src/app/api/market-manager/[marketId]/weekly-rental/[rentalId]/route.ts`. Catch 23505 from the UPDATE, return 409 with "Booth #N is already assigned to another vendor for this week."

5. **Quality gate** — typecheck + lint + vitest. Verify no regressions.

6. **Migration application** — Dev → Staging only (Prod gated on the existing 6-migration batch + 25-commit prod push that's still pending).

7. **Optional polish (defer):**
   - BookBoothForm success state shows assigned number (Decision 7)
   - Backfill script for existing NULL booth_numbers (Decision 8 — discarded for v1)
   - Manager-editable booth labels (Decision 1.C — discarded for v1)

---

## Open questions for user

1. **Confirm reopening v2.future scope** — Path B is locked in three docs. Building Path A now requires acknowledging that.
2. **Confirm D1.A** (per-tier integer labels) — vs. D1.B concatenated labels.
3. **Confirm D2.A** (inside the existing RPC) — vs. D2.B post-payment.
4. **Confirm D3.A** (skip placeholder integer labels) — vs. D3.B (label-blind).
5. **File-level approval for modifying `src/lib/stripe/webhooks.ts`** — only the `handleBoothRentalCheckoutComplete` function, only the notification payload (not the status-flip logic). 1 SELECT addition + 2 payload additions.
6. **Migration 144 vs in-route logic** — the RPC modification is the cleanest path. Confirm OK to ship as a new migration that does `CREATE OR REPLACE FUNCTION` on mig 142's RPC.

---

## What this does NOT include

- Vendor-initiated cancellation (locked NO per current_task.md:45-48)
- Manager-initiated booking cancellation flow (G17; closed per same policy)
- Manager-editable booth labels (D1.C; conflicts with "hands-off" goal)
- "Two vendors share a booth" edge case (backlog item; no design pass yet)
- N6b (auto-assignment) is THIS DOC; N6a (UNIQUE constraint) is included in step 1.

---

## Implementation status (Session 84, 2026-05-20)

**Shipped (uncommitted in working tree; migration 144 applied to Dev + Staging 2026-05-20, Prod pending — batches with migs 138–143):**
- `supabase/migrations/20260520_144_booth_auto_assignment.sql` — 3 statements: ALTER markets / CREATE UNIQUE INDEX / CREATE OR REPLACE FUNCTION `book_weekly_booth_atomic` with auto-assignment + new error `LABELS_EXHAUSTED` (P0004).
- `src/lib/markets/booth-labels.ts` — pure helpers (parse, validate, generate).
- `src/app/api/market-manager/[marketId]/booth-labels/route.ts` — GET + PUT.
- `src/app/api/market-manager/[marketId]/weekly-rental/[rentalId]/route.ts` — 23505 → 409 mapping.
- `src/lib/notifications/types.ts` — `boothNumber?` added; vendor + manager templates updated.
- `src/lib/stripe/webhooks.ts` — CRITICAL-PATH change (notification block only); `booth_number` SELECT + payload pass-through.
- `src/components/market-manager/BoothInventoryManager.tsx` — new "Booth numbering" section at top with live preview + validator.

**Quality gate (verified before reporting back):** tsc clean, eslint clean for changed files (2 pre-existing `refundErr` warnings in webhooks.ts unrelated), 1493/1493 vitest pass.

---

## Known edge cases (NOT fixed in this PR — backlogged)

### Label range drifts from inventory total after initial save

The PUT `/booth-labels` validator enforces `range count === sum(market_booth_inventory.count)` at save time. But the booth-inventory POST/PATCH/DELETE routes do NOT re-check that invariant when the manager later adds, removes, or edits a size tier.

**Sequence that produces drift:**
1. Manager saves labels `"1"`..`"8"` while their inventory totals 8 booths.
2. Manager later adds another size tier with 2 more booths (e.g., adds `"10x20: count 2"`).
3. Inventory total = 10. Configured label range = 1..8 (8 labels). Out of sync.

**What happens at booking time:**
- For the 9th booking onwards, the RPC raises `LABELS_EXHAUSTED` (P0004) — booking fails.
- If the manager ever explicitly cleared one of the label columns to NULL (mixed-null is rejected by the validator, but a future bug or manual DB edit could set this state), the RPC silently falls back to defaults `1..total`.
- In either path the manager sees no warning until either a vendor's booking fails or they happen to look at `error_logs`.

**Why it's safe to defer:** the failure mode is a FAILED booking with a logged exception, not silent corruption. New rentals don't go in with wrong labels — they don't go in at all. Manager will eventually notice (via the surfaced error or a vendor complaint) and re-save labels to fix.

**Tracking:** added to `apps/web/.claude/backlog.md` under Priority 1.5 ("Booth label range can drift from inventory total after initial save"). Three fix options listed there with sizing. Recommended path: validate-on-mutation in the booth-inventory routes — block changes that'd break the range OR auto-clear labels with a returned warning.
