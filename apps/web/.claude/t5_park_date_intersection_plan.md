# T5 — get_available_pickup_dates park-date intersection (mig 199 plan)

Status: **BUILT 2026-07-18, gates green (tsc 0, vitest 1687/1687), awaiting commit approval.** D1 = 'paid' only + early-pay notice (occurrence notification + pay banner); D2 = no exemption (both logged in decisions.md). Mig 199 on disk with verification queries in-file (user runs at apply time). Relaunch-blocking priority (user call 2026-07-18).

## The gap (verified)
T4's booking↔selling bridge auto-creates/reactivates recurring `vendor_market_schedules` rows on the PAID flip of a park booking (webhooks). Recurring schedules persist past the booked dates, and `get_available_pickup_dates` (mig 162, applied everywhere) requires only an ACTIVE vms row for FT non-event markets (162:91-103) — so a paid-park truck's listing offers pickup dates the truck never booked. Buyers can order for dates the truck won't be at the park.

## The RPC today (mig 162 — read in full 2026-07-18)
- listing_schedules CTE joins listing_markets → listings → markets → market_schedules → vendor_market_schedules; FT non-event: cutoff 0 (:61-63), vms required (:96-103), date window = today (advance_order_days=0) or today+2..today+N (:152-158).
- matched_dates CTE carries the per-date predicates incl. mig 162's manager-cancelled NOT EXISTS (:160-166) — **the intersection goes here, same pattern**.
- Return shape MUST NOT change: 4 SQL wrappers (is_listing_accepting_orders, get_listings_accepting_status, validate_cart_item_schedule, cleanup_cart_items_invalid_schedules) + listing detail page + availability route + browse (via get_listings_accepting_status LATERAL — the documented slowest op, PERFORMANCE_BASELINE.md:65). CREATE OR REPLACE, NO DROP; anon-exec grants retained (mig 149 allowlist).

## Booking-side schema (verified from snapshot changelog migs 171/172/174)
- `park_spot_bookings`: ONE ROW PER spot PER `booking_date DATE`; `market_id`, `vendor_profile_id`, `status IN (pending_payment|paid|cancelled|completed|expired)`.
- **Index gift:** partial-unique `uq_park_spot_vendor_active(vendor_profile_id, market_id, booking_date) WHERE status IN ('pending_payment','paid')` — exactly the probe the EXISTS needs; `status='paid'` implies the partial predicate → index-served point lookup. NO new index needed.
- `markets.park_mode 'free'|'paid'` (mig 171, default 'free') — the scope gate.

## The change (mig 199, CREATE OR REPLACE)
listing_schedules CTE additionally selects `l.vendor_profile_id` + `m.park_mode`. matched_dates gains ONE predicate next to the mig-162 block:

  AND (
    ls.vertical_id != 'food_trucks'
    OR ls.market_type = 'event'
    OR ls.park_mode IS DISTINCT FROM 'paid'
    OR EXISTS (
      SELECT 1 FROM park_spot_bookings b
      WHERE b.vendor_profile_id = ls.vendor_profile_id
        AND b.market_id = ls.market_id
        AND b.booking_date = ds.potential_date
        AND b.status = 'paid'          -- pending user decision D1
    )
  )

Short-circuit order guarantees: FM rows never evaluate the EXISTS (first OR arm); FT free parks exit at park_mode; only FT paid-park listings probe — ≤8 candidate dates × 1 indexed lookup each.

## User decisions needed
- **D1 — which statuses count as "booked"?** Recommend `'paid'` only (money-consistent: the T4 vms bridge itself fires on the paid flip; booking = selling = paid). Alternative: `IN ('pending_payment','paid')` would let an approved standing-reservation occurrence sell BEFORE the truck pays it (occurrences auto-expire unpaid at the 2-day cutoff, mig 174 — selling on then-expired bookings is the risk).
- **D2 — multiple_trucks paid parks:** intersection applies regardless (booking = spot rental; the T4 multiple_trucks exemption was for the schedule-CONFLICT check, not the booking requirement). Confirm.

## Propagation (free, by design)
All four wrappers + display surfaces funnel through this RPC (mig 162 header) → unbooked dates vanish from listing detail/browse AND get rejected at cart-validate + checkout. Stale auto-created vms rows become harmless (no cleanup needed — out of scope).

## Out of scope (noted, not built)
- Booking-cancelled-after-buyer-orders cascade (park cousin of cancel-date-cascade) — separate finding if wanted.
- Stale-vms hygiene cleanup.
- Browse perf re-attack (COST_EFFICIENCY_ANCHORS known-heavy item) — unchanged.

## Verification plan (before commit)
1. **FM regression proof:** EXPLAIN ANALYZE on an FM listing before/after (plan should be identical — predicate short-circuits); dev DB.
2. **FT paid-park behavior:** dev seed — truck with recurring schedule + ONE paid booking → RPC returns only the booked date; free-park truck unchanged.
3. **Perf (code-stability Rule 2.1):** time get_listings_accepting_status on the browse listing set before/after (PERFORMANCE_BASELINE method); paid-park probe is indexed, expect noise-level delta. Record both numbers.
4. Gates: tsc/vitest (any BR-test conflict = decision point, presented). Grep-check: no test asserts the mig-162 body verbatim.
5. Staging smoke (user): paid park truck books date X → listing shows ONLY X; adding stale-date item to cart → validate rejects.

## Rollback
Re-apply mig 162's body (file kept in applied/). Code-side: none (no app-code changes required — SQL-only fix; pre-migration state = current behavior).

## Batch shape
ONE migration (199), NO app-code edits required, snapshot changelog entry, staging verification steps. Single-purpose session per the original deferral rationale.
