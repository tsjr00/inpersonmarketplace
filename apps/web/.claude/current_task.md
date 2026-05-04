# Current Task: Sessions 75–77 — Wrap (Audit, Events Review, Stripe Reconcile)

**Updated:** 2026-05-03 (after Stripe reconcile fix push `76f4a69e`)
**Mode:** Report by default. User has tested reconcile tool and confirmed math is correct.
**Vercel build status for staging tip `76f4a69e`:** GREEN

---

## START HERE — Read in this order

1. This file (`current_task.md`) — session state + what's pending
2. `apps/web/.claude/session75_vendor_count_math_and_event_form.md` — Session 75 record
3. `apps/web/.claude/session76_events_review.md` — Session 76 audit findings
4. `apps/web/.claude/session76_fix_proposals.md` — Session 76 fix plan (all shipped)
5. `apps/web/.claude/backlog.md` — Priority 0 / 0.5 / 1 items
6. `CLAUDE.md` (project root) — project rules
7. `PROCESSES_AND_PROTOCOLS.md`

---

## origin/staging tip: `76f4a69e`

All work below is on staging. Origin/main (Prod) is 25 commits behind.

### Migration status

| Migration | Dev | Staging | Prod | Notes |
|---|---|---|---|---|
| 128 — `event_setting` column | ✅ 2026-04-30 | ✅ 2026-04-30 | ⏳ Pending | Session 75 |
| 129 — `address` DROP NOT NULL | ✅ 2026-05-01 | ✅ 2026-05-01 | ⏳ Pending | Session 75 |
| 130 — `recalculate_wave_capacity` no silent fallback | ✅ 2026-05-01 | ✅ 2026-05-01 | ⏳ Pending | Session 76 |

---

## Session 75 — Audit + event form (shipped, see prior current_task.md history)

Commits `8a2a5a1f` through `8a4a2328`. Full record in `session75_vendor_count_math_and_event_form.md`.

---

## Session 76 — Events review (shipped 2026-05-01/03)

**Audit:** `apps/web/.claude/session76_events_review.md` — 1 P0, 7 P1, 11 P2, 6 P3 with file:line citations.

**Commits:**
- `3b6f6c97` — Events language pass + notifications + wave capacity hard-error
- `13d8727e` — Migration 130 fix (TABLE return type)
- (Migration 130 file itself committed in `3b6f6c97`)

**What shipped:**
- FM "Pop-Up Market" → "Vendor Event" everywhere via existing `term()` system
- New terminology keys: `event_request_name_suffix`, `event_preference_unit_singular/plural`
- FM "Cuisine" → "Vendor Type" labels via `term()` (FT keeps "Cuisine")
- Spanish configs updated to match
- Mobile responsive form via `<style>` tag with `@media (max-width: 600px)` collapsing 2-col/3-col grids
- F1 hotfix: catering_vendor_invited actionUrl `${marketName}` → `${marketId}` (vendor invitation links no longer 404)
- F5: new `event_force_completed_with_unfulfilled` notification type (corrective tone for vendors with unfulfilled orders when admin force-completes)
- F7: event_confirmed branches "vendor"/"food truck" by vertical
- F8: catering_vendor_invited message phrasing smoothed
- F9: GET `/events/[token]/details` mirrors PATCH's email-OR-id auth (no 403 lockout for organizers)
- F11: event_cancelled_vendor warmer phrasing
- Wave generation hard-errors instead of silently filling 25 capacity (F6b)
- Migration 130 — `recalculate_wave_capacity` SQL function rewrite (no COALESCE silent fallback)
- NI-014 notification count test bumped 62 → 63

---

## Session 77 — Stripe reconcile admin tool (shipped 2026-05-03)

**Trigger:** User asked for ability to trace Stripe transactions back to platform records.

**Plan docs:**
- `apps/web/.claude/session76_fix_proposals.md` covered both Build A + Build B
- This session built B (admin reconcile tool); Build A (Stripe metadata enrichment) deferred

**Commits (all shipped to staging):**
- `ecf22fad` — Initial reconcile tool (lib + API + page + AdminNav link + settlement page link icons)
- `2a6d99b1` — Fixes 1-4: PI matching, exclude payout BT from totals, "Stripe fee" rename, platform revenue column
- `7f1d6c3a` — Fixes 5-6: handle `payment` BT type + per-row diagnostics
- `76f4a69e` — Fixes 7-8: drop phantom columns + capture SQL errors

**Reconcile tool — current state on staging:**

Files:
- `src/lib/stripe/reconcile.ts` — matching pipeline (3 charge tables × cross-vertical scope, with discriminated `LookupOutcome` for accurate diagnostics)
- `src/app/api/admin/stripe-reconcile/route.ts` — POST endpoint, admin-scoped
- `src/app/[vertical]/admin/stripe-reconcile/page.tsx` — UI
- `src/components/admin/AdminNav.tsx` — added "💳 Stripe Reconcile" link
- `src/app/[vertical]/admin/events/[id]/settlement/page.tsx` — magnifier 🔍 icon next to each order # links to reconcile

What works:
- Paste Stripe ID (pi_/ch_/tr_/po_), order# (FA-2026-...), or email
- Auto-detects input type
- Payout audit shows balance transactions with totals (gross/Stripe fees/net/platform revenue)
- Matched-order column populated
- Per-row diagnostic surfaces *why* unmatched rows didn't match (DB error vs cross-vertical vs not-found vs no PI)
- Vertical scoping: platform admin sees all; vertical admin scoped to their vertical

Math (verified against `src/lib/pricing.ts` + Stripe SDK types):
- Stripe fee = `bt.fee` from Stripe API (2.9% + $0.30 of charge amount, NOT subtotal)
- Platform revenue = `orders.platform_fee_cents` = `13% × subtotal + $0.30` (full both-sides + flat)
- Net = `bt.amount` - `bt.fee` per BT, summed across non-payout BTs
- "Net platform retention" per order ≈ platform_revenue − attributable Stripe fee (e.g. $13.30 − $3.39 = $9.91 on a $100 subtotal)

**Bugs found + fixed during build:**
- `payments.stripe_charge_id` doesn't exist → was breaking SELECT silently (caught by user testing)
- `market_box_subscriptions.vertical_id` doesn't exist → same silent SELECT failure
- BT type `'payment'` (newer Stripe) wasn't handled, only `'charge'`
- Diagnostic conflated "not found" with "query error" with "filtered by vertical"
- All fixed in `76f4a69e`

**Known understated metric:**
Platform revenue uses `orders.platform_fee_cents` only. Settlement page math is more complete (`buyer_fee + buyer_flat + vendor_fee + vendor_flat`) but requires touching order_items. Logged as TODO in reconcile.ts comment. Not blocking.

---

## Pending — TOP OF NEXT SESSION

### 1. Prod push (when ready, within 9pm-7am CT window)

Apply migrations to Prod **before** code push:
1. Migration 128 (event_setting column)
2. Migration 129 (DROP NOT NULL on address)
3. Migration 130 (recalculate_wave_capacity rewrite — preserves TABLE return type)

Then:
4. `git push origin main` — pushes 25 commits including everything from sessions 75-77
5. Move 128, 129, 130 to `supabase/migrations/applied/`
6. Update MIGRATION_LOG.md (replace "Pending Prod" with prod date)
7. Update SCHEMA_SNAPSHOT.md changelog entries

### 2. Build A — Stripe metadata enrichment (DEFERRED)

The original plan from `session76_fix_proposals.md` Q-set. Touches CRITICAL-PATH `checkout/session/route.ts` per `critical-path-files.md`. Adds `order_number`/`order_id` to:
- Regular order Transfers
- Market box Charges (via post-creation PI metadata update)
- Market box Transfers

After A ships, the reconcile tool's metadata-completeness flags (✗ → ✓) become the verification surface. Pipeline is already wired for it — no rewrite needed.

### 3. P0-3 event cancellation refund + cleanup (PLANNED, not started)

Full plan: `apps/web/.claude/session75_p0-3_event_cancel_plan.md`. 4 open questions for user before implementation.

### 4. P1-5 refund underpay (DEFERRED — design questions)

See `session75_fix_proposals.md` P1-5 section.

### 5. P1-8 schema snapshot regen (PENDING USER SQL RUN)

User runs `supabase/REFRESH_SCHEMA.sql` in Supabase SQL Editor, pastes results back, Claude rebuilds structured tables. Snapshot is ~5 migrations stale; sections for `catering_requests` columns are missing entirely (only FK section exists).

### 6. Reconcile tool refinements (LOW PRIORITY)

- Align platform_revenue math with settlement page (use full fee components, not just `orders.platform_fee_cents`)
- Add "Show in Stripe" deep-link icons on single-result view (already in payout audit)
- Optional: support refund (re_) lookup

---

## Critical context — DO NOT FORGET

- **`payments.stripe_charge_id` does not exist** — only `stripe_payment_intent_id`. Charge IDs come from Stripe API at runtime via `getChargeIdFromPaymentIntent()`.
- **`market_box_subscriptions.vertical_id` does not exist** — vertical comes from joined `market_box_offerings`.
- **`bt.type` can be `'charge'` OR `'payment'`** — latter is newer Stripe API for PaymentIntent-driven charges, both are valid. SDK union has 40+ types.
- **`source` field on BalanceTransaction** is `string | BalanceTransactionSource | null` — use `expand: ['data.source']` to inline, fallback to `stripe.charges.retrieve()` if expand doesn't honor.
- **Stripe charges fees on the CHARGED amount, not the subtotal** — i.e. on `subtotal + buyer_fee_we_added`, not just `subtotal`. Effective Stripe cost is slightly higher than 2.9% of subtotal.
- **`orders.platform_fee_cents` = full gross platform revenue** — `13% × subtotal + $0.30` (both sides + flat fees combined). Not just one component.
- **Schema snapshot is partially stale + missing some tables** — verify against migrations OR live `information_schema.columns` query before composing SQL.
- **Pre-push Playwright Turbopack flake** — `rm -rf .next` (full directory, not just `.next/dev/cache`) before retrying. Memory: `feedback_clear_full_next_dir.md`.

---

## Working tree

```
M apps/web/.claude/backlog.md
M apps/web/.claude/current_task.md
M apps/web/.claude/settings.local.json
```

(Plus a stack of untracked planning docs in `.claude/` that are intentional.)

---

## Recent commits on staging (origin/staging from newest)

```
76f4a69e fix: stripe reconcile — drop phantom columns, capture sql errors
7f1d6c3a fix: stripe reconcile — handle 'payment' BT type + add per-row diagnostics
2a6d99b1 fix: stripe reconcile — match by PI, fix totals, label fees, add platform revenue
ecf22fad feat: stripe reconciliation admin tool + migration 130 bookkeeping
13d8727e fix: migration 130 — preserve TABLE return type from migration 120
3b6f6c97 fix: events language + notifications + wave capacity hard-error
8a4a2328 fix: vendor_count suggestion — layered formula + helper text decoupled
14cf11e7 fix: migration 129 — DROP NOT NULL on catering_requests.address
3210f64e feat: vertical admin Phase B Batch 2 — error-logs + admins compressed mobile rows
f236f85b chore: pre-push hook + Protocol 5 — npm run build before Playwright
eea40abd fix: NotificationTemplateData.sourceType type
5dea312b feat: event data gathering — Stage 1/Stage 2 wiring + migration 128
dad58074 fix: P1-7 directory rename — [id] → [listingId]
c96f3ee9 fix: Session 75 audit batch 2 — critical-path bugs (P1-2, P0-2, P1-1)
8a2a5a1f fix: Session 75 audit batch 1 — non-critical-path bugs
```
