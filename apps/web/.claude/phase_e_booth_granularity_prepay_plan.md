# Phase E — Booth Season/Partial Prepay (week-grain) + Settlement

**Status:** DESIGN — for user approval. No code, no migration until approved.
**Created:** 2026-06-24 (Session — Phase E kickoff)
**Mode:** Report (design-first). Approval to build is separate; critical-path/money files need per-file approval.

---

## 1. Locked direction (user, this session)

- **GREEN path chosen.** Sell at **week grain** (the existing atomic unit). However many days a market runs that week is included for the weekly price — same as today. ("Sell 1 week at a time & however many days that represents is not an issue for us now.")
- **Group layer = add weeks together, pay once.** Season = all weeks in the season; partial = a subset of weeks. The existing one-off single-week rental is reused unchanged.
- **Build the group table to support PARTIAL from day one** (UI may launch season-only). ("Adding weeks together shouldn't break anything.")
- **Per-day selling for multi-day markets = DEFERRED** to a later follow-on (it's the risky unit change).
- **REJECTED for v1:** rewriting `weekly_booth_rentals` into generic period types (daily/weekly/recurring). Touches the atomic unit ~19 files depend on.
- **No Stripe subscriptions** (decisions.md 2026-06-12). **No half-day** (markets self-segregate by hours). **No mid-season refunds** — settlement is credit-first at season end.

---

## 2. Current shape (verified, cited) — what we reuse vs. add

| Piece | Today | Citation |
|---|---|---|
| Rental unit | 1 row = vendor × market × **Sunday week** × size tier; `UNIQUE (vendor_profile_id, market_id, week_start_date)`; `status IN (pending_payment\|paid\|cancelled\|completed)`; `price_cents` snapshot | `20260512_139_weekly_booth_rentals.sql:59-84` |
| Price | per **size tier**, `weekly_price_cents`; `UNIQUE (market_id, size_label)` — **no per-day price** | `20260508_134_market_booth_inventory.sql:25-35` |
| Booking | `book_weekly_booth_atomic` RPC: advisory-lock `hash(market:inventory:week)`, recount capacity, auto-assign booth label, insert ONE pending row | `20260518_142…sql:72-104`, `20260522_146…sql:163-331` |
| Booth uniqueness | trigger across 3 tables; rentals week-specific, vendors/placeholders week-agnostic | `20260522_146…sql:70-126` |
| Book route | creates pending row → `createBoothRentalCheckoutSession` (ONE checkout/week) → stores session id; Stripe-only (`stripe_charges_enabled` gate) | `api/vendor/markets/[id]/book/route.ts:137-144, 386-417` |
| Money | destination charge: `transfer_data.destination`=manager, `transfer_data.amount`=managerReceivesCents, platform keeps spread; idempotency `booth-rental-${rentalId}` | `payments.ts:312, 332-347` |
| Webhook | `metadata.type==='booth_rental'` → resolve `rental_id` → flip that one row to paid → notify vendor + manager | `webhooks.ts:146, 1127-1303` |
| Fees | `calculateBoothRentalFees(weeklyPriceCents)` pure, per-week, single source | `pricing.ts:324` |
| Operating days | `market_schedules` (day_of_week + start/end + `active`) — booth system ignores which day, anchors to Sunday | `book/route.ts:209-227`; schedule cols `SCHEMA_SNAPSHOT.md` (verify `day_of_week` at build) |
| Cancelled dates | `market_date_overrides` (Phase C, all envs) — the cancelled-day data source | `phase_c_date_overrides_plan.md:117, 136` |

**Reused unchanged:** the rental row, the race-safe RPC, booth auto-assignment, conflict triggers, the destination-charge mechanics. **Added:** a parent group, a season/partial booking route, a multi-line checkout, prepay-window config, and a season-end settlement flow.

---

## 3. Design

### Part A — Market-type confirmation (manager-facing gate)

Managers must **confirm their `market_schedules` are accurate** so we know the market's operating days. Today this drives nothing for rentals (we sell weeks), but it (a) lets the vendor see what a week covers ("this market runs Sat + Wed; a week covers both") and (b) is the switch that later unlocks per-day selling.

- Add a confirmation step (a checkbox + timestamp) at manager approval / dashboard. **Build-time:** locate the manager approval flow (not yet read) and the schedule card (`MarketScheduleCard.tsx`).
- **Minimal v1:** a `markets.schedule_confirmed_at TIMESTAMPTZ` (additive). Season-booking UI requires it set.

### Part B — `booth_booking_groups` (the grouping layer) — ADDITIVE

One row per "a vendor bought a set of weeks in one payment."

```
booth_booking_groups
  id UUID PK
  vendor_profile_id UUID  -> vendor_profiles(id)
  market_id UUID          -> markets(id) ON DELETE CASCADE
  inventory_id UUID       -> market_booth_inventory(id)   -- one size tier per group (v1)
  kind TEXT CHECK (kind IN ('season','partial'))
  season_id UUID NULL     -> market_seasons(id)  (Part E; null for ad-hoc partial)
  week_count INTEGER
  total_vendor_cents INTEGER       -- sum of per-week vendorPays (audit)
  total_manager_cents INTEGER      -- sum of per-week managerReceives (transfer amount)
  status TEXT CHECK (status IN ('pending_payment','paid','cancelled')) DEFAULT 'pending_payment'
  stripe_checkout_session_id TEXT
  stripe_payment_intent_id TEXT
  agreement_acceptance_id UUID -> vendor_market_agreement_acceptances(id)
  created_at / updated_at
```

- **Child link:** add nullable `group_id UUID -> booth_booking_groups(id)` to `weekly_booth_rentals`. One-off bookings leave it null → **zero change to the existing flow**.
- **Child status stays authoritative.** The group has its own status, but each weekly rental keeps its own `status`, so every existing `status IN (...)` query, the capacity recount, and the cancel cascade keep working **unmodified**.

### Part C — Season/partial booking flow (new route, reuses the RPC)

New `POST /api/vendor/markets/[id]/book-season` (sibling, does **not** touch the one-off route):

1. Same gates as one-off (auth, vendor profile, market, `stripe_charges_enabled`, inventory belongs to market).
2. Resolve the **week set**: for season, enumerate the season's weeks (Part E) minus already-cancelled `market_date_overrides`; for partial, the vendor-selected subset.
3. **Per-week fees** via `calculateBoothRentalFees` (per-week rounding — matches the per-item rounding decision, MEMORY). Sum vendor + manager totals.
4. Insert the group (`pending_payment`).
5. Loop the **existing** `book_weekly_booth_atomic` per week inside one DB transaction, stamping `group_id`. Reuses race lock, capacity, booth assignment, DUPLICATE/OVERBOOKED. If any week fails (e.g. one week overbooked), **roll back the whole group** and tell the vendor which week blocked it. *(Open decision O3: all-or-nothing vs. book-what's-available.)*
6. Create **one** Stripe checkout for the group (Part D). On failure, delete the group + its children (mirror the one-off orphan cleanup).

> **No new booking RPC.** We orchestrate N calls to the proven one. The only new SQL primitive is optional: a thin `book_season_atomic` wrapper if we want the N inserts under a single advisory lock. **Recommend starting without it** (per-week locks already prevent overbook); add only if testing shows a partial-group race.

### Part D — Money path (CRITICAL PATH — needs file-level approval)

New `createSeasonBoothCheckoutSession` in `payments.ts` (sibling to the existing function; the existing one is untouched):

- `line_items`: one per week (`description: "Week of YYYY-MM-DD"`, `unit_amount: vendorPaysCents[week]`) — vendor sees the itemized season.
- `payment_intent_data.transfer_data`: `destination` = manager account, `amount` = **sum** of `managerReceivesCents`. One charge, one transfer, platform keeps the summed spread.
- `metadata.type = 'booth_rental_season'`, `metadata.group_id`. Idempotency `booth-season-${groupId}` (deterministic — MEMORY rule).
- **Webhook:** add a `booth_rental_season` branch in `webhooks.ts` next to `booth_rental` (`:146`): resolve `group_id` → flip the group to `paid` AND all child rentals `WHERE group_id=$ AND status='pending_payment'` to `paid` → fire **one** summary notification to vendor + manager (not N).

**Critical-path/protected files touched:** `payments.ts` (additive function) and `webhooks.ts` (additive branch). Both are protected-path; I will show exact diffs and get per-file approval before editing.

### Part E — Season definition + prepay window + refund cap (manager-set)

```
market_seasons
  id UUID PK
  market_id UUID -> markets(id) ON DELETE CASCADE
  name TEXT                      -- "Summer 2026"
  start_date DATE
  end_date DATE
  declared_market_days INTEGER NULL  -- manager declares, OR derive from schedules (Open O1)
  prepay_open BOOLEAN DEFAULT false  -- manager opens/closes the prepay window
  prepay_opens_at / prepay_closes_at TIMESTAMPTZ NULL
  refund_cap_days INTEGER            -- O2: floor(10% of declared_market_days), min 1; platform ceiling = 15% of season days
  status TEXT CHECK (status IN ('draft','open','active','ended','settled'))
  created_at / updated_at
```

- **Week enumeration:** the weeks in `[start_date, end_date]` whose `day_of_week` matches an active `market_schedules` row, minus cancelled overrides. Manager either declares the count or we derive it (Open O1).
- **Prepay window:** vendor can buy a season only while `prepay_open` and within the window. After it closes, vendors fall back to one-off (offering #2) or partial (#3).

### Part F — Cancelled-day counter (DERIVED, no new infra)

At season end, per paid group:
`cancelled_days = COUNT(market_date_overrides WHERE market_id=$ AND status='cancelled' AND date ∈ group's week set)`.
Compare to `market_seasons.refund_cap_days`. **No materialized counter** — Phase C already stores the source of truth.

### Part G — Settlement + vendor self-cancel (credit-first) — RESOLVED

**Why credit, not cash:** the season is a **destination charge** — the manager already holds the money at prepay time (`payments.ts:332-337`). Credit-first leaves the money in place and gives the vendor a **standing claim against future booth rentals at that market** (like a store-credit balance). No money moves backward through Stripe → no clawback, no refund-rate optics. The tradeoff: credit is **stranded** if the vendor never books that market again (mitigations: expiry + cross-market credit, both deferred). Cash refund (with `reverse_transfer` clawback) stays the deferred last-resort.

**`booth_credits` ledger (new, additive):**
```
booth_credits
  id UUID PK
  vendor_profile_id UUID -> vendor_profiles(id)
  market_id UUID -> markets(id)            -- per-market (operator-wide = deferred O4 option)
  amount_cents INTEGER                      -- positive = granted, negative = redeemed
  balance_after_cents INTEGER               -- running balance (or derive via SUM)
  source TEXT CHECK (source IN ('season_settlement','vendor_cancel_pre','vendor_cancel_post','redeemed'))
  related_group_id UUID NULL -> booth_booking_groups(id)
  expires_at TIMESTAMPTZ NULL               -- deferred; null = no expiry in v1
  created_at
```

**Settlement at season end (manager-side cancels > cap):** manager offers a menu; vendor picks. v1 ships **rollover credit + booth upgrade** (no money movement). Make-up-days deferred (needs add-special-date); cash-refund deferred (needs clawback).

| Option | Money movement | v1? |
|---|---|---|
| Rollover credit | none (ledger grant) | ✅ |
| Booth upgrade | none (in-kind, manager action) | ✅ |
| Make-up days | none (adds operating dates) | ❌ needs add-special-date |
| Credit at operator's other markets | none (cross-market) | ❌ deferred |
| Cash refund (last resort) | **reverse_transfer clawback** | ❌ deferred |

**Vendor self-cancel of a paid season (O5, RESOLVED):**
- **Before the season's first market day** → **full credit, no penalty.** Grant `amount = total_vendor_cents` to `booth_credits` (source `vendor_cancel_pre`). Mark the group `cancelled` + child rentals `cancelled`.
- **After the season has started** → **penalty + remainder as credit.** Compute remaining-week value (weeks not yet elapsed); grant `remaining_value × (1 − penalty%)` as credit (source `vendor_cancel_post`); penalty portion stays with the manager. **No cash, no Stripe refund.** Penalty % = reuse the product model's 25% (`cancellation-fees.ts:12`) unless user sets a booth-specific value at build.
- **NOTE — supersedes decisions.md 2026-06-12 "no mid-season refunds":** vendor self-cancel now exists but settles in **credit, not cash**, so the "money motionless" principle holds. Log this as a decision update at build.

**Credit redemption (build-time money-path detail, file-approval gate):** applying credit to a future booking reduces the vendor's cash due AND reduces that booking's `transfer_data.amount` to the manager by the credited amount (the manager already holds that cash from the original season). Work out exact platform-spread accounting in the money-path pass.

---

## 4. Notifications + UI

- **Notifications (new types, tripwire bump — currently 80):** `booth_season_paid_vendor`, `booth_season_paid_manager` (group summaries), `season_settlement_offer_vendor`, `season_settlement_chosen_manager`. Register in `notifications/types.ts` union + registry + i18n (en/es).
- **Vendor UI:** season/partial selector on the booking page (pick season or weeks → one all-inclusive total, no breakdown — UX decision 2026-05-19); bookings page shows the group.
- **Manager UI:** a `ManagerCard` to define a season, open/close the prepay window, set the cap; a season roster; the end-of-season settlement panel.

---

## 5. Migrations (additive, in order)

1. `market_seasons` (+ indexes, RLS no-policy).
2. `booth_booking_groups` (+ FK, indexes, RLS no-policy).
3. `ALTER weekly_booth_rentals ADD group_id` (nullable FK; existing rows untouched).
4. `markets.schedule_confirmed_at` (+ `booth_credits` ledger if O4 includes credit).
5. No change to `book_weekly_booth_atomic`, the conflict trigger, or `market_booth_inventory` for v1.

Apply Dev+Staging before code push; Prod with the push. Update `SCHEMA_SNAPSHOT.md` after each.

---

## 6. Backward-compat / disruption analysis

- One-off rentals: `group_id` null → unchanged. ✅
- Capacity recount, cancel cascade, check-in eligibility, booth conflicts: all key on the child rental row, which is unchanged. ✅
- Existing weekly managers who never open a season: see nothing new. ✅
- The only behavioral change is additive surfaces gated on `prepay_open` / `schedule_confirmed_at`.

---

## 7. Flow-integrity + critical-path touchpoints

- New cross-file contracts → add flow-integrity tests: season-checkout → webhook group-flip → all children paid; settlement-offer → vendor-choice → ledger entry.
- Critical-path/protected: `payments.ts`, `webhooks.ts` (additive only) — per-file approval + exact diffs before editing. No edit to cart/checkout/pricing core.

---

## 8. DECISIONS — RESOLVED (user, 2026-06-24)

- **O1 — Season week count:** ✅ **derive** from `market_schedules` (∖ cancelled overrides), manager **confirms**; on mismatch the manager must reconcile (fix one side so they agree). ⚠️ **PRE-BUILD DISCUSSION REQUIRED** — see §10.
- **O2 — Refund cap:** ✅ **B + D** — cap = **~10% of derived season days** (floor, min 1), per-**market** (all vendors), with a **platform ceiling of 15%** so no manager can set an abusive cap. Stored as `market_seasons.refund_cap_days` (computed; ceiling enforced).
- **O3 — Partial-group failure:** ✅ **all-or-nothing**, with a message listing the blocked week(s) so the vendor can adjust their selection.
- **O4 — Settlement v1 scope:** ✅ **rollover-credit + booth-upgrade only.** Make-up-days + cash-refund deferred. (Part G.)
- **O5 — Vendor self-cancel:** ✅ before season start = **full credit, no penalty**; after start = **penalty + remaining value as credit** (never cash). (Part G — supersedes the "no mid-season refunds" decision: credit, not cash.)

## 10. PRE-BUILD DISCUSSION ITEMS (do not skip)

- **O1 cutoff/day coupling.** Listing availability + order cutoff are derived live from `cutoff_hours` + the operating `day_of_week` via `get_listings_accepting_status()` (`availability-status.ts:8-40`, `constants.ts:32-37`). Changing a schedule day during the reconcile is **live-computed (no migration)** but **moves the buyer-facing order cutoff**. Design the manager-facing disclosure ("changing this day also moves your order cutoff to X hours before [new day]") together before building. Verify the RPC's "next market day" computation at build.
- **Money-path pass** (`payments.ts` + `webhooks.ts` season functions, credit redemption accounting) — exact diffs + per-file approval before editing (critical/protected paths).
- **Penalty %** for after-start self-cancel — confirm 25% (product default) or a booth-specific value.

---

## 9. Build phasing (proposed, after approval)

1. Migs (Part B/E/A) → Dev+Staging.
2. Season/partial booking route + group orchestration (no critical-path).
3. Money path: `createSeasonBoothCheckoutSession` + webhook branch (**file approval gate**).
4. Manager season/prepay UI + vendor season selector.
5. Settlement panel + `booth_credits` (per O4).
6. Notifications + i18n + tripwire bump.
7. Flow-integrity tests. Stage → user test → prod with migs.
