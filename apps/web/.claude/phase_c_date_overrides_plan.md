# Phase C — Date Overrides (Cancel-a-Date) — Design Doc

**Status:** DESIGN (no code yet). Session 92 cont. Author pass 2026-06-21.
**Plan home:** `growth_build_plan.md` Phase C. Spec source: `session92_events_mm_growth_research.md` §J #7.
**Why now:** Phase E (season prepay) consumes Phase C's outputs — E's "cancelled-day counter" is *fed by the cancel-a-date feature* and E's settlement "make-up days" = special-date overrides (`decisions.md` 2026-06-12). So C is a prerequisite for E. Build C first.

---

## Locked decisions (user, 2026-06-21)

1. **Booth fee on a cancelled date → manager picks inline at cancel time** (option "b"): credit OR reschedule. NOT auto-refund (matches locked policy "refund or future date — manager's call", `decisions.md` 2026-05-19, and the season-prepay "keep money motionless" principle).
2. **Buyer product orders on a cancelled date → refunded automatically** via existing refund machinery.
3. **v1 = cancel-a-date ONLY.** Add-special-date (holiday/extra market day) **deferred** to a follow-up. (v1 is the piece E actually needs.)
4. **Un-cancel NOT supported in v1** — cancel is one-way. (Re-instating a cleared-weather date is a follow-up; v1 manager fixes a mistaken cancel via support.) → no un-cancel UI; the override row stays.
5. **Cancel-ahead window = 8 weeks** (matches the booth booking horizon — VERIFIED `markets/[id]/book/page.tsx:196` `nextSundays(timezone, 8)`). Manager can cancel any of the market's operating dates within the next 8 weeks. Rationale below (#2 investigation).
6. **Immediate buyer refund — APPROVED with one required carve-out** (see #3 investigation): reuse the refund + inventory-restore + buyer-notify cascade BUT skip the vendor-reliability penalty. Refund amount = the VERIFIED full-buyer-paid formula.
7. **Credit-vs-reschedule = single choice for the whole cancelled date** (not per-vendor). Per-vendor is an E-era refinement.

---

## Scope

**IN (v1):** Manager cancels a single upcoming market date for one of their markets (e.g., weather). Effects:
- That date disappears from buyer-facing availability + can't be ordered/checked-out.
- Existing buyer **product orders** for that date are auto-refunded.
- Affected **paid booth renters** are flagged for credit/reschedule (manager's inline choice) — NO money movement; this is the record E's counter later settles.
- Affected vendors + buyers are notified.

**OUT (deferred):** add-special-date (`status='special'`) — adding a date that is NOT a normal `day_of_week`. Harder because it requires the availability RPC to *generate* a non-DOW candidate date, not just *suppress* one. Schema below includes the `status` column so the follow-up needs no migration to the table shape.

---

## Schema — `market_date_overrides`

```
market_date_overrides
  id                UUID PK DEFAULT gen_random_uuid()
  market_id         UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE
  override_date     DATE NOT NULL
  status            TEXT NOT NULL CHECK (status IN ('cancelled','special'))  -- 'special' reserved for follow-up
  booth_disposition TEXT NULL CHECK (booth_disposition IN ('credit','reschedule'))  -- v1 cancel: manager's inline choice; NULL when no paid renters affected
  reschedule_date   DATE NULL          -- set when booth_disposition='reschedule' (the make-up date)
  reason            TEXT NULL          -- manager free-text (shown to vendors/buyers in notification)
  -- 'special' follow-up will use: start_time/end_time TIME NULL
  created_by        UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (market_id, override_date)     -- one override per market per date
```
- **RLS:** enabled, NO policies (service-client only behind `isMarketManager` — mirrors migs 137/157/160).
- **Index:** `(market_id, override_date)` — the availability/validate lookups filter on exactly this.
- `ON DELETE CASCADE` from markets (override is meaningless without the market). No cascade INTO other tables.
- Schema-intent gate (verification-discipline Rule 5): this table is the override *record* itself; cancelling an override (un-cancel) in v1 = DELETE the row is acceptable here because the row IS the soft-state (no downstream history depends on it yet). **OPEN Q below** on whether un-cancel should be supported in v1.

---

## Availability & checkout correctness (VERIFIED)

A cancelled date must be suppressed in **two** independent SQL paths. Both are surgical `NOT EXISTS` additions; mig-131 logic otherwise preserved verbatim.

### Path 1 — display/availability: `get_available_pickup_dates(p_listing_id)`
- **Verified** structure (`supabase/migrations/applied/20260504_131_pickup_dates_require_active_vms.sql`): the `matched_dates` CTE (:146-182) produces one row per candidate `pickup_date` that matches a market's `day_of_week`. Add to its WHERE (or `with_cutoff`/final SELECT :209):
  ```sql
  AND NOT EXISTS (
    SELECT 1 FROM market_date_overrides o
    WHERE o.market_id = ls.market_id
      AND o.override_date = ds.potential_date
      AND o.status = 'cancelled'
  )
  ```
- **Propagation (verified):** `is_listing_accepting_orders` wraps this fn (`20260205_002_pickup_scheduling_functions.sql`: `SELECT EXISTS(... FROM get_available_pickup_dates(...) WHERE is_accepting)`), and `get_listings_accepting_status` wraps it via LATERAL (`20260303_067_batch_listing_availability.sql`). So this single change covers: listing detail page, browse "available now" + badges, vendor listings page, cart/validate, checkout-session availability gate. **No separate edits to those three wrappers.**

### Path 2 — checkout specific-date gate: ALREADY COVERED by Path 1 (REVIEW CORRECTION 2026-06-21)
- **VERIFIED** (`20260205_002_pickup_scheduling_functions.sql`): `validate_cart_item_schedule(listing, schedule, date)` does NOT compute independently — it **wraps** `get_available_pickup_dates`:
  ```sql
  SELECT COUNT(*) FROM get_available_pickup_dates(p_listing_id)
   WHERE schedule_id = p_schedule_id AND pickup_date = p_pickup_date AND is_accepting = true;
  ```
- Therefore the single `NOT EXISTS (cancelled override)` filter in `get_available_pickup_dates` removes the cancelled date from its output → `validate_cart_item_schedule` returns 0/false for that date → cart-validate + checkout reject a buyer who already has a cart item for the cancelled date. **No separate change to this function.** A buyer can only have a cart item for a date inside the availability window, so coverage is complete.
- **Net: mig 162 rewrites exactly ONE function** (`get_available_pickup_dates`). Propagates to: listing detail, browse, vendor listings, batch `get_listings_accepting_status`, `is_listing_accepting_orders` (checkout), `validate_cart_item_schedule` (cart/checkout). `cleanup_cart_items_invalid_schedules` ALSO calls `validate_cart_item_schedule` (verified, same file) so stale cart items get swept too — no change needed there.
- **Migration note:** `get_available_pickup_dates` is SECURITY DEFINER; the rewrite is a `CREATE OR REPLACE` (return shape unchanged from mig 131, so no DROP). REVOKE is unaffected (it's a function the anon-revoke list did NOT include — it's a public buyer-browse function intentionally left anon-executable, per mig 149's "LEFT exposed" list). So NO re-revoke needed. Confirm at build that mig 149/152/153 did not touch it (they didn't — it's in the public-browse allowlist).

---

## Cancel cascade — two money paths

When manager confirms cancel of (market, date):

### A. Buyer product orders → AUTO-REFUND, immediate (money out)

**#3 investigation result: immediate refund is SAFE, with one required carve-out + two edges to decide.** Verified against the vendor-reject cascade (`api/vendor/orders/[id]/reject/route.ts`).

- **Find** `order_items` with `pickup_date = <date>` at this market's listings, not already cancelled/refunded/fulfilled.
- **Amount (VERIFIED math, reject:107-117):** `buyerPaidForItem = subtotal_cents + round(subtotal_cents × 6.5%) + proratedFlatFeeSimple($0.15, totalItemsInOrder)` — the full buyer-paid amount per item (decisions.md 2026-03-20 formula). Reusing this computation = correct math by construction.
- **Refund** via VERIFIED `createRefund(paymentIntentId, idempotencySuffix=order_item_id, buyerPaidForItem)` (`payments.ts:248`). Service client reads `payments` (vendor RLS can't). On failure → `ERR_REFUND_001` logError (reject:176). Status → `cancelled` then `refunded`.
- **Inventory:** restore (future-date items are pre-fulfillment, so always restorable). Order-level rollup → `cancelled` only if ALL its items cancelled (per-item granularity is correct — one order may hold items for other dates/vendors).

- **⚠️ REQUIRED CARVE-OUT (the "additional problem"):** the reject path calls `increment_vendor_cancelled` (reject:207) which dings the **vendor's reliability score**. A market-day cancellation is the manager's/weather's doing, NOT the vendor's — the cancel-a-date refund path **MUST NOT** increment that counter. → cannot reuse the reject route wholesale; reuse the refund+inventory+notify pieces, omit the penalty. Use `cancelled_by = 'market'` (new value) + the manager's reason.
- **No payout clawback:** future-date orders aren't fulfilled → vendor unpaid → no Stripe transfer to reverse. Clean.
- **External (pay-at-pickup) orders:** no `payments.status='succeeded'` row → skip refund, just cancel the item (reject already guards this).
- **EDGE (scale) — sync vs cron:** a popular cancelled date could touch many order_items; refunding all synchronously in the manager's request risks timeout. Traditional-market buyer orders only reach ~8 days ahead (RPC `generate_series(0,7)`), so per-date volume is modest → **synchronous is acceptable for v1**, but if a date has > ~25 refundable items, enqueue to the expire-orders cron pattern. Log what was deferred (no silent caps).
- **OPEN at build:** the refund logic is inlined per-route (not one shared fn) — extract a small `refundOrderItemsForCancelledDate()` helper or a new internal manager route.

### C. Market-box pickups on the cancelled date → CREDIT THE WEEK (reuse existing infra)

**RESOLVED: credit (option b), via the EXISTING skip-and-extend mechanism — no new mechanism needed.** Verified the market-box model already supports this first-class:
- Schema: `market_box_pickups` has `status`, `scheduled_date`, `is_extension`, `skipped_by_vendor_at`, `skip_reason`; `market_box_subscriptions` has `term_weeks`, `extended_weeks`, `original_end_date` (SCHEMA_SNAPSHOT:555-595).
- The existing vendor skip endpoint (`api/vendor/market-boxes/pickups/[id]/skip/route.ts:102`) calls **RPC `vendor_skip_week(p_pickup_id, p_reason)`**, which marks the pickup skipped, **creates an `is_extension` makeup pickup**, **extends the subscription by 1 week**, and notifies the buyer (`market_box_skip`). That IS "credit the week" — the buyer loses no paid pickup.
- **Phase C plan:** for each `market_box_pickups` row at this market with `scheduled_date = <cancelled date>` and `status IN ('scheduled','ready')`, the cancel route (service client) calls `vendor_skip_week` with `p_reason = 'Market day cancelled by manager'`. No refund, money motionless, subscriber made whole.
- **EDGE (rare):** if a buyer's pickup for the cancelled date is *itself* an `is_extension` makeup, `vendor_skip_week` rejects it ("cannot skip extension pickups", skip route:91). Fallback for those (e.g. credit a second extension manually, or notify) → **flag at build**, low frequency.
- **VERIFY AT BUILD:** read `vendor_skip_week` body (RPC, in a migration) to confirm exact extension/extend behavior + return shape; confirm how MB pickups link to a market (via offering → vendor → market_vendors, or a direct market_id) so the "pickups at THIS market on this date" query is correct. The skip route is FM-gated (food_trucks rejected) — Phase C is FM-only anyway, so consistent.

### A-note: existing booking copy goes stale
`BookBoothForm.tsx:344,358-359` currently tells vendors "market closures are handled **off-platform** by the manager… the manager will either refund [or reschedule]." Once C ships, closures are **on-platform** (date-cancel) and booth fees are credit/reschedule (never refunded). **Update this copy** as part of the build.

### B. Paid booth rentals → CREDIT/RESCHEDULE FLAG (NO money movement)
- **Why no refund:** booth rentals use **destination charges** (`transfer_data.destination`, verified `payments.ts:267-285`) — the manager's 93.5% is already in their Connect account. A refund would need `reverse_transfer:true` (clawback); `createRefund` does NOT do this. The locked policy + season-prepay decision both say credit-first, money motionless. So C never refunds booth fees.
- **What C does:** records `booth_disposition` (`credit` | `reschedule`, + `reschedule_date`) on the override row. The set of `status='cancelled'` override rows IS the data Phase E's cancelled-day counter aggregates per vendor (cross-ref paid `weekly_booth_rentals` whose week contains the cancelled date). v1 does not build the counter — it just records the override + disposition so E can.
- Affected renters = paid `weekly_booth_rentals` at this market whose `week_start_date` week (Sun–Sat) contains the cancelled date. (Same recipient query shape as the schedule-change dispatch.)
- **⚠️ REVIEW NUANCE 2026-06-21 — "reschedule" is ADVISORY in v1:** moving a vendor to a make-up market date requires *creating* that operating date = the **deferred add-special-date feature**. So in v1, `booth_disposition='reschedule'` = record `reschedule_date` + tell the vendor "your booth moves to [date]" (a recorded commitment, matching locked copy "refund or future date — manager's call"). It does NOT yet create a system operating date — that activates when add-special-date ships (the `reschedule_date` is forward-compatible). **`credit` is fully functional now** (feeds E). **OPEN Q below.**
- **Edge:** if a market runs >1 day/week and only one day is cancelled, the renter still has the other day; a full-week credit may be too generous. The manager's inline choice covers this (they can choose neither/credit/reschedule per their judgment). Most FM markets are single-day/week. No special handling in v1.

---

## Notifications + manager UI — mirror schedule-change (per code map; verify lines at build)

**Mirror the existing schedule-change flow** (Explore map; verify at build):
- Manager API route under `api/market-manager/[marketId]/...` (schedule-change lives in `.../schedules/route.ts` PUT with an `acknowledged:true` hard gate + dispatch to approved vendors + paid renters). New cancel route follows the same auth (`isMarketManager`), ack gate, and recipient queries.
- **New notification type** (e.g. `market_date_cancelled`) registered in `src/lib/notifications/types.ts` (`NotificationType` union + `NOTIFICATION_REGISTRY` config) — model on `market_schedule_changed` (`types.ts` ~:727). Audience: vendor (affected renters) + buyer (refunded orders). Bumps the notification-count test tripwire (user-approved each time, per Phase B/1B precedent).
- **Manager UI:** new card or inline action on the manager dashboard, wrapped in `ManagerCard` (`src/components/market-manager/MarketScheduleCard.tsx` is the closest pattern — ack dialog + date picker). Cancel action needs: date selection (upcoming operating dates for this market), reason text, and IF paid renters affected → the inline credit/reschedule choice (+ reschedule date). Acknowledgment dialog bullets adapted from the schedule-change 4-bullet pattern (manager does direct outreach; platform auto-refunds buyer orders; booth fees credited/rescheduled not refunded).

---

## The C → E seam (what C must leave behind for E)

E's season-prepay settlement (`decisions.md` 2026-06-12) needs, per cancelled season:
- **count of cancelled market days** a vendor prepaid for → derivable from `market_date_overrides WHERE status='cancelled'` ∩ vendor's paid rentals for those dates. ✓ C records this.
- **make-up days** = `status='special'` overrides → the deferred add-special-date feature. E's settlement menu can't offer "make-up days" until that follow-up ships, but the other settlement options (rollover credit / upgrade / cash last resort) don't need it. Acceptable: ship C-cancel → E → C-special as the make-up enabler.
- C does NOT need to build the counter or per-rental link table; E derives both. C just needs the override rows + `booth_disposition`.

---

## Build phasing (proposed)

1. **mig 161** — `market_date_overrides` table (+ index, RLS no-policy). Additive.
2. **mig 162** — `CREATE OR REPLACE get_available_pickup_dates` = mig-131 body verbatim + ONE `NOT EXISTS (cancelled override)` filter. Return shape unchanged (no DROP). Propagates to all wrappers incl. the cart/checkout validator. NO re-revoke (function is in the public-browse allowlist). SECURITY DEFINER + STABLE preserved.
   - MB-pickup linkage VERIFIED: `market_box_pickups → subscription → market_box_offerings.pickup_market_id` is the market key for cascade C's "pickups at this market on this date" query.
3. **Cancel API route** (`isMarketManager` + ack gate) — writes the override, runs buyer auto-refund cascade, flags booth renters, fans out notifications.
4. **Notification type** + i18n + registry; tripwire bump.
5. **Manager UI card/action** + ack dialog.
6. Flow-integrity: new status field (override) reachability; new notification contract.
- **Sequencing:** apply migs 161+162 to Dev+Staging BEFORE the code push (routes/validators read the table). Prod with the next push window.

---

## OPEN QUESTIONS — status

1. ~~Un-cancel in v1?~~ **RESOLVED: no (one-way).**
2. ~~How far ahead?~~ **RESOLVED: 8 weeks** (investigation: the booth booking window is `nextSundays(timezone, 8)` = 8 weeks, `markets/[id]/book/page.tsx:196`; the API itself imposes no upper cap — only "future Sunday" — so 8 weeks is the *practical* horizon a vendor could have booked into. Buyer product orders only reach ~8 days ahead, so the 8-week window is driven by booth renters, which is correct.)
3. ~~Refund timing?~~ **RESOLVED: immediate** (investigation confirms safe + math verified) **with the required vendor-penalty carve-out** in cascade A.
4. ~~Per-vendor vs whole-date choice?~~ **RESOLVED: whole-date.**

5. ~~Market-box pickups on a cancelled date?~~ **RESOLVED: credit the week** (cascade C above) — reuses the existing `vendor_skip_week` skip-and-extend RPC.

**ALL DESIGN QUESTIONS RESOLVED.** The cancel cascade is now a clean 3-path design, each path reusing verified existing machinery:
- **Buyer product orders** → auto-refund (reuse reject cascade minus the vendor-penalty).
- **Paid booth rentals** → flag credit/reschedule on the override row (no money movement; feeds Phase E).
- **Market-box pickups** → `vendor_skip_week` (skip + makeup extension; subscriber made whole).

---

## Verification ledger (what's cited vs. to-verify-at-build)

- **VERIFIED this session:** `get_available_pickup_dates` body + wrappers (`is_listing_accepting_orders`, `get_listings_accepting_status`); `createRefund` signature; booth rentals = destination charge (no auto-refund path).
- **TO VERIFY AT BUILD (Explore map, not personally read line-by-line):** `validate_cart_item_schedule` body + market_id resolution; schedule-change route dispatch line numbers + recipient queries; `MarketScheduleCard` ack pattern; notification registry exact lines; the reusable buyer-refund entry point (may need extraction).
