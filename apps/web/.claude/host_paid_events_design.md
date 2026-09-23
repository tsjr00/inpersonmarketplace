# Host-paid events — V1 design (owner rulings 2026-09-22, decisions.md row 2026-09-22)

**Status: DESIGN. Nothing built.** This is the basis for the specific build plan. Research + citations:
`host_paid_events_research.md`. Prior history: backlog.md "DEFERRED FEATURE PACKAGE — Company-paid events"
(2026-07-14), `docs/Codebase_Map/14_Events.md` §company-paid, decisions.md 2026-08-13 (superseded here).

**The picture in one paragraph.** A company (the HOST) feeds a room — a picnic, a conference lunch — through
the app. The host requests the event exactly as any organizer does today and picks "Our company pays for
everyone." The platform tells the host an ESTIMATE; the host pays it the way companies pay (check / ACH); an
admin records it. Trucks are invited, accept, and are selected exactly as today. Attendees — who each have an
account — enter the host's access code, pick a time slot and ONE meal from ONE truck. Orders are held from the
trucks until the host's money is recorded, then released in one digest per truck. On the day, trucks work a
wave-grouped prep sheet, tap "wave ready", and tap once per meal to fulfil. After the event the platform
charges the host for every meal that was PREPARED, refunds the rest or invoices the overage, and pays the
trucks manually (V1). The whole thing recycles the existing event flow; the money simply doesn't go through
Stripe.

---

## §0 Vocabulary

- **Host** — the organizer of a company-paid event (`catering_requests.organizer_user_id`). Same person as
  today's "organizer"; "host" is the word the intake and dashboard use for company-paid.
- **Estimate** — meals × per-meal ceiling at public prices + facilitation (H-4). What the host prepays.
- **Prepaid balance** — Σ `event_company_payments` rows with status `paid` for the event (existing table).
- **Release** — the moment the host's payment is recorded and held orders become visible to trucks (H-6).
- **Prepared** — an order item that reached `ready` or `fulfilled` (`order_item_status`, mig 001:28-35).
- **Wave** — a time slot (`event_waves`); per-wave capacity = Σ selected trucks' `event_max_orders_per_wave`.
- **Facilitation fee** — the one visible host-side line: $0.50 per meal (H-3).

---

## §1 Rules H-1 … H-14 — these are what the tests assert

| # | Rule | Source |
|---|---|---|
| H-1 | **One attendee = one meal from one truck** per event (V1). One reservation per attendee per event (`uq_event_wave_reservations_market_user`, mig 110:50). | owner 2026-09-22 (1) |
| H-2 | **Attendees must be signed in** to order; the host's ACCESS CODE identifies the event, the account identifies the person. No guest ordering. | owner (4) |
| H-3 | **Fees.** Menu prices shown to host and attendees are the SAME all-in prices the public app shows (6.5% baked via `calculateItemDisplayPrice`). **No 15¢ on either side** (no card). Host additionally pays **$0.50 per meal**, shown as ONE line "Event facilitation fee — $0.50 per meal". Vendor pays 6.5%, no 15¢. Fee math comes from `pricing.ts` constants — never re-typed in SQL. Full math disclosed in the host agreement + app terms. | owner (10)(14) — supersedes decisions.md 2026-08-13 |
| H-4 | **Estimate** = `expected_meal_count` × `company_max_per_attendee_cents` (an all-in per-meal ceiling the host sets) + $0.50 × `expected_meal_count`. Both inputs REQUIRED at intake when payment model = company_paid. | owner (1) |
| H-5 | **Host pays out of band** (check / ACH). An admin records the payment on `event_company_payments` (status `paid`). No Stripe checkout for hosts in V1. | owner (5) |
| H-6 | **Ordering gate.** Attendees may order as soon as the event is `ready`. Orders are HELD — invisible to trucks, no truck notification — until prepaid balance ≥ 1 recorded payment (any amount ≥ 0 … see §8 Q1). On release: ONE digest per truck. Held orders never expire (§3.7). If the host never pays, the admin cancels the event through the existing cancel path; attendees are told by it. | owner (6)(18) |
| H-7 | **Cutoff 24h** before the event start (`cutoff_hours` = 24 at approval for company_paid; clamp 12–168 allows it). Sold out is sold out: the truck's listing `quantity` is the cap, decremented at order time and restored on cancel. Per-truck `event_max_orders_total` and per-wave capacity still apply. | owner (8)(19) |
| H-8 | **Prepared → charged and paid.** At completion: items in `ready`/`fulfilled` are charged to the host and owed to the vendor (including prepared-but-unclaimed). Items still `pending`/`confirmed` are treated as cancelled — NOT charged, NOT paid. | owner (7)(13)(15) |
| H-9 | **Handoff = one vendor tap.** No attendee 30-second acknowledgment, no QR scanning. The attendee's pick-ticket is the truck's paper backup for a true-up against its in-app fulfilled count. (Fulfil's vendor-first branch already exists: `fulfill/route.ts:501-533`; company_paid moves no money there: `:203-230`.) | owner (17) |
| H-10 | **Prep sheet has "Mark this wave ready"** — sets every unready item in the wave to `ready` in one tap (the vendor's protection under H-8). | owner (16) |
| H-11 | **Vendors are paid MANUALLY in V1** by an admin from the settlement report; each payout is recorded so the vendor's earnings page shows it paid (new `payout_status` value `manual`). | owner (9)(12) |
| H-12 | **True-up.** Charged = Σ prepared meals at all-in price + $0.50 each. Balance = prepaid − charged. Positive → refund (recorded as a `refund` ledger row); negative → invoice (`final_settlement` row). Out of band, admin-recorded. | owner (1) |
| H-13 | **Access code is a CSPRNG value**, never `Math.random` (`event-actions.ts:70-77` today). | backlog EVT-13 |
| H-14 | **Everything else is the existing event flow, unchanged**: intake → approval (token, event market, schedule) → invitation gate → accept with menu + capacity → host selects (+ menu pare) → `ready` → completion effects → ratings. | recycle |

---

## §2 Migration 259 — `2026MMDD_259_host_paid_events_v1.sql` (⛔ PRE-CHECK FIRST; snapshot changelog row the moment the file exists; live fingerprints on Dev/Staging/Prod before writing)

**Pre-check (paste, expect):**
1. `information_schema.columns` for `orders`, `order_items`, `listings`, `event_company_payments`,
   `vendor_payouts`, `catering_requests` — the rewrite is composed ONLY against this output (backlog EVT-1
   lesson: the current RPC writes `orders.user_id/market_id/buyer_fee_cents/service_fee_cents/
   vendor_payout_cents` and reads `listings.base_price_cents`, none of which exist).
2. `SELECT md5(prosrc), length(prosrc) FROM pg_proc WHERE proname = 'create_company_paid_order'` on all 3 envs
   (expect the mig-119 body everywhere; any drift → stop).
3. `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'payout_status'::regtype` (record; expect no `manual`).
4. `SELECT count(*) FROM orders WHERE payment_model = 'company_paid'` — expect 0 on every env (the path has
   never executed). Anything else → stop and read.

**Changes (additive; inert until an event chooses company_paid):**
- `catering_requests.orders_released_at TIMESTAMPTZ NULL` — the release stamp (H-6). NULL = held.
- `event_company_payments.payment_type` CHECK widened to `('deposit','final_settlement','refund')` (H-12).
  (Today the admin route enforces the two-value list in code: `payments/route.ts:103-105`; add the DB CHECK
  only if one exists — pre-check says.)
- `ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'manual'` (H-11; non-transactional — own statement, as
  mig 035 did).
- **`create_company_paid_order` — DROP + CREATE with the real schema.** Signature adds the fee inputs so SQL
  is never a second source of fee truth: `(p_user_id, p_market_id, p_reservation_id, p_listing_id,
  p_vendor_profile_id, p_wave_id, p_buyer_fee_cents, p_vendor_fee_cents, p_facilitation_cents)` — the route
  computes them from `pricing.ts` (H-3). Body: reservation `FOR UPDATE` (EVT-17), listing by `price_cents`
  joined through `event_vendor_listings` (excluding `host_status='declined'`, mig 241), per-attendee cap
  (existing logic), wave capacity check, **`atomic_decrement_inventory`** (H-7), INSERT `orders`
  (`buyer_user_id`, `vertical_id`, `status='paid'`?→ see §8 Q2, `payment_model='company_paid'`,
  `event_wave_reservation_id`, money columns that EXIST), INSERT `order_items` (`status='confirmed'`,
  `wave_id`, `market_id`, `pickup_date`, `vendor_payout_cents`, `platform_fee_cents`), mark reservation
  `ordered` with a guarded UPDATE. RAISE codes documented in the header; service-role only (REVOKE PUBLIC/
  anon/authenticated, GRANT service_role — the mig-248 lesson, verified with `has_function_privilege` ×3).
- Cancel path restores inventory via `atomic_restore_inventory` (route change, §3.6).

**Post-check:** columns present · function fingerprint recorded in the snapshot · enum has `manual` ·
lockdown anon f / authed f / service t · `count(*) company_paid orders` still 0.

**Rollback block** in the file: drop the new columns/CHECK, re-create the mig-119 function verbatim (kept in
the file as a quoted block), note that enum values cannot be dropped.

---

## §3 Surfaces (each: what changes · what it reads · what it refuses)

### 3.1 Intake — `EventRequestForm.tsx` + `api/event-requests`
- Company-paid already selectable (`:90`). When chosen: **`expected_meal_count` and
  `company_max_per_attendee_cents` become REQUIRED** with helper text: *"How many meals will you cover?"* /
  *"The most one meal may cost (menu price as attendees will see it)."* Live estimate line under them (H-4):
  *"Estimated prepayment: N × $X + N × $0.50 = $Y — we true up after the event."*
- **Host agreement / terms**: no organizer-facing agreement surface was found by search (UNVERIFIED as an
  absence — needs an unfiltered read of the intake + approval pages during the build plan). The disclosure
  ruling (14) requires the full price math to be in an agreement the host accepts and in the app terms →
  build-plan item: locate or add the host acceptance point.
- Refuses: company_paid without the two numbers.

### 3.2 Approval — `lib/events/event-actions.ts`
- Unchanged except: access code via CSPRNG (H-13); `cutoff_hours` = 24 for company_paid (H-7).

### 3.3 Host dashboard — `event-manager/[id]/dashboard/page.tsx`
- New card **"Payment"** (company_paid only): Estimate (H-4 math, one line, no fee breakdown beyond the
  facilitation line) · *"Send a check or ACH for $Y to …"* (platform payment instructions — content owner-
  supplied, §8 Q3) · **Prepaid balance** from the ledger · Release status: *"Orders are being held until your
  payment is recorded"* → *"Payment recorded 9/30 — trucks have your orders."*
- Existing "Total order value" line (`:341-342`) → **"Meals ordered"** (count + $ at all-in prices + facilitation)
  and, after completion, **"Charged / Prepaid / Balance"** (H-12). This closes the decisions.md 2026-08-13
  "update both surfaces together" pair with §3.10.
- Access code display unchanged (`:304-314`).

### 3.4 Admin — payments ledger `api/admin/events/[id]/payments` + `EventsAdminPage`
- Recording a `paid` payment on a company_paid event **stamps `orders_released_at` if NULL** and triggers the
  release (§3.7). `refund` type accepted (H-12). Admin sees the same Estimate / Prepaid / Charged / Balance.

### 3.5 Waves — `select/route.ts` ready flip
- When the event is company_paid and turns `ready`, call `generateEventWaves` (today admin-only:
  `admin/events/[id]/route.ts:531`, `generate-waves/route.ts:84`). Idempotent (returns early if waves exist,
  `wave-generation.ts:51`). Wave duration = `markets.wave_duration_minutes` (default 30).

### 3.6 Attendee shop + order — `ShopClient.tsx`, `api/events/[token]/order`, `waves/reserve`
- Shop: send `access_code` with the order POST (`ShopClient.tsx:436-444` today omits it → 403 at
  `order/route.ts:65-73`). One meal (qty 1) from one truck; the picker already caps at `listing.quantity`
  and shows "N left" ≤ 10 (`:1139, 1179-1219`).
- Order route: compute `p_buyer_fee_cents`/`p_vendor_fee_cents` from `pricing.ts` (6.5%, no flat) and
  `p_facilitation_cents = 50`; call the new RPC; **notify the attendee only** (`order_confirmed`); **do NOT
  notify the vendor** while `orders_released_at IS NULL` (H-6). `console.error` → `logError`.
- Attendee cancel (`buyer/orders/[id]/cancel`… path per build plan): company_paid early-branch — no Stripe
  refund math; `atomic_restore_inventory`; free the wave reservation (EVT-15 half).
- Refuses: no account · wrong code · past cutoff · wave full (suggests next) · cap exceeded · item sold out.

### 3.7 The hold — `orders_released_at`
- Held items are ordinary `order_items` with `status='confirmed'` (created that way today: `order/route.ts:15`),
  so the expire cron never touches them (it expires `status='pending'` past `expires_at`,
  `cron/expire-orders/route.ts:171-172`). Guard in tests (§5).
- Vendor surfaces filter: **Vendor Event Page order counts, prep sheet (`prep/route.ts`), vendor orders list**
  show NOTHING for a company_paid event while `orders_released_at IS NULL`; instead one line: *"Orders are
  held until the host's payment is recorded."*
- **Release** (admin records payment): stamp; send ONE `event_orders_released_vendor` digest per selected
  truck (count + link to prep sheet); email too (money-relevant lead time — comms-cost rule satisfied).
- Never-paid host → admin cancels via existing `admin/events/[id]` cancel → attendees + trucks notified by
  the existing cancel path; held items cancelled; inventory restored.

### 3.8 Truck — Vendor Event Page + prep sheet `api/vendor/events/[marketId]/prep`
- Prep sheet already groups by wave with counts (`:12-16`). Add **"Mark this wave ready"** (H-10) → bulk
  `status='ready'` on the wave's `confirmed` items (new route or extend `orders/[id]/ready` with a wave form).
- **Fulfil = one tap per meal** (H-9) → existing `fulfill` vendor-first branch; company_paid path completes
  the order and notifies the attendee (`:206-230`). No change to fulfil itself.
- OrderCard copy for company_paid items: *"Host-paid event — tap Fulfil when you hand it over; the host pays
  for every meal you mark ready."*

### 3.9 Completion — `lib/events/complete-event.ts`
- Vendor settlement summary counts `fulfilled` only today (`.eq('status','fulfilled')`, ~`:107`). For
  company_paid: count **`ready` OR `fulfilled`** (H-8) and mark unready items cancelled (guarded UPDATE,
  reason `not_prepared`); inventory restore for them.

### 3.10 Settlement report — `api/admin/events/[id]/settlement` + `admin/events/[id]/settlement/page.tsx`
- Company-paid section: per truck — prepared meals · all-in $ · vendor payout (6.5%, no 15¢) · **paid-manually
  marker** (H-11) with a "Record payout" action that inserts `vendor_payouts` (`status='manual'`,
  `transferred_at=now`, no transfer id). Host — charged (H-12) · prepaid · balance · buttons "Record refund"
  / "Record invoice" → ledger rows. Replaces the bare-subtotal balance (`:356, :454`).
- Vendor earnings page reads `vendor_payouts` — `manual` rows display as paid with the date.

### 3.11 Notifications (`lib/notifications/types.ts`)
- New: `event_orders_released_vendor` (digest, in-app + email) · `event_host_payment_recorded` (host, in-app).
  Tripwire 135 → 137, pre-approved by this design. Reuse for everything else (`order_confirmed`,
  `order_fulfilled`, `event_settlement_summary`, cancel family).

---

## §4 Build order (each part committed locally; ONE push at the end; migration on Dev first, then Staging)

- **A — Migration 259 + RPC rewrite + route wiring** (§2, §3.6 order route, fee inputs from pricing.ts,
  decrement/restore, CSPRNG, cutoff 24). Tests: RPC contract pins, fee-source pin, no-SQL-fee-literals pin.
- **B — Intake + approval + host dashboard Payment card + admin ledger (release stamp, refund type)**
  (§3.1–3.4). Tests: required-fields, estimate math, release stamp idempotent.
- **C — Waves on ready + shop access code + the hold** (§3.5–3.7). Tests: waves generated once; vendor
  surfaces empty while held; digest sent once; cron never touches held items.
- **D — Truck side: wave-ready button, copy; completion prepared rule; settlement report + manual payouts**
  (§3.8–3.10). Tests: prepared rule (ready counts, confirmed doesn't); manual payout row shape; balance math.
- **E — Host agreement/terms disclosure + printable test blocks (workflow W11 "Host-paid event, start to
  true-up") + registry rows + Codebase Map 14 + this file's §8 closed.**

---

## §5 Guardrails / tests (business-rule tests assert §1; never edited to match code)

- `host-paid-events.test.ts` (pure): estimate (H-4) · charged/balance (H-12) · prepared classification (H-8)
  · fee derivation from `FEES` with no flat (H-3).
- Flow-integrity pins: order route computes fees from `pricing.ts` and the migration file contains no
  `0.065`/`15` fee literals · ShopClient order POST includes `access_code` · select ready-flip calls
  `generateEventWaves` for company_paid · vendor prep/orders readers filter on `orders_released_at` · expire
  cron's Phase-1 predicate stays `status='pending'` · fulfil company_paid branch still moves no money.
- Guardrail Rule G/M/O: snapshot row at file creation; function named in the snapshot; lockdown verified.
- Notification tripwire 135 → 137 with citation to this file.
- Codebase-map coverage: new files in map 14.

---

## §6 Transition / data
- No existing data: `company_paid` orders = 0 on every env (pre-check 4 confirms). Dormant until an event
  chooses company_paid. Prod receives 259 in the normal post-wipe order after 252→258.

---

## §7 What people give up (so nobody is surprised)
- **Host:** no card payment in V1; pays by check/ACH and waits for an admin to record it before trucks see
  orders. One meal per attendee. Refund/invoice after the event is manual.
- **Attendee:** must have an account; one meal; 24h cutoff; no per-item acknowledgment (nothing to do at
  handoff but show the ticket).
- **Truck:** paid after the event by admin, not at the tap; must tap "wave ready" (or per-item Ready) or
  forfeit pay for that meal (H-8). Sees orders only after release.
- **Admin:** two manual moments — record the host's payment (release) and, after completion, record payouts
  and the refund/invoice.

---

## §8 Open items for the build plan (owner rulings needed before part A)
- **Q1 — Release threshold.** Any recorded payment releases, or payment ≥ estimate? (Recommend: ≥ estimate,
  with an admin override for a host who paid a deposit.)
- **Q2 — Order status for a company-paid order.** `orders.status = 'paid'` (so existing "is this order
  paid" gates pass) vs a new value. Recommend `paid` — no Stripe row is normal for this model (backlog VOR-10
  assumptions hold). Needs the `order_status` enum values read at pre-check.
- **Q3 — Payment instructions content** shown to the host (payee, address/ACH details) — owner-supplied; where
  it lives (verticals.config? env?) decided in the build plan.
- **Q4 — Host agreement point** — existing surface or new (§3.1).
- **Q5 — Items with no `quantity` set** (null = unlimited today). Require trucks to set a quantity per event
  item at accept, or allow unlimited? (Recommend require — H-7's "sold out is sold out" needs a number.)

---

## §9 PARKED (V2 — owner 2026-09-22)
- **Multi-day events, up to TWO meals per day per attendee** — relax `uq_event_wave_reservations_market_user`
  to (market, user, service_date, slot); waves per day; access code unchanged. Planned next.
- Bigger allowance / several items or trucks per attendee — attractive, NOT planned ("don't let complexity
  make the process fragile").
- Host pays via Stripe (Checkout or Invoicing with ACH) → automatic vendor transfers at fulfil.
- Hybrid (host covers part, attendee pays the rest) — schema + intake exist, hidden.
- QR scan-to-fulfil — declined for V1.
