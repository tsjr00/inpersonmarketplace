# Research: HOST-PAID events (company picnic / conference lunch), 2026-09-22

Owner ask: what is needed to make host-paid events functional while recycling the current event
process so the workflow feels similar. Report only.

## Checklist
- [x] Prior decisions + planning (decisions.md 2026-08-13 tentative 6.5%; backlog deferred package 2026-07-14)
- [ ] Codebase map §company-paid (14_Events.md:105-116)
- [ ] Backlog deferred package full text (backlog.md ~1679-1700)
- [ ] Dead path: api/events/[token]/order/route.ts + mig 119 create_company_paid_order
- [ ] Approval: access code minted for company_paid (event-actions.ts:167-173); verify-code route
- [ ] Attendee shop: ShopClient company-paid branch; waves
- [ ] Vendor fulfil/reject/confirm company-paid branches (no Stripe)
- [ ] Settlement report + event_company_payments (manual ledger)
- [ ] Organizer Stripe: event market Connect (vendor-fee V1) — reusable for host payment?
- [ ] What "recycle" means: intake → approve → invite → select → shop → fulfil → complete

## Findings
- decisions.md:170-178 (2026-08-13, TENTATIVE): organizer pays the same 6.5% buyer-side fee; dashboard
  "Total order value" and settlement companyPaidCents are BASE cents today — update both together.
- backlog.md:1679 DEFERRED PACKAGE (owner 2026-07-14 "we will need it later, not now"): company-paid
  ordering has NEVER been executable end-to-end. EVT-1 (P0) create_company_paid_order inserts
  non-existent orders columns; EVT-17 double-order race; EVT-7 waves not generated on self-service
  ready; VOR-14 buyer-confirm lacks company-paid branch; EVT-15 buyer-cancel branch; VOR-10 reject
  exemption already shipped assuming NO payments row + refunds via organizer settlement.
- Schema (mig 100/110): catering_requests.payment_model (company_paid|attendee_paid|hybrid),
  total_food_budget_cents, expected_meal_count; orders.payment_model; event_waves,
  event_wave_reservations, event_company_payments (payment_type, amount_cents, payment_method,
  stripe_payment_intent_id unused, status, notes, paid_at); markets.wave_ordering_enabled.
- Crosspollination research: organizer Stripe collection UNBUILT (G2); admin records
  event_company_payments manually; vendor payouts ride standard order_items flow.

## Code re-verified 2026-09-22 (what still holds)
- EVT-1 STILL TRUE: `create_company_paid_order` (mig 119:147-159) INSERTs orders(user_id, market_id,
  buyer_fee_cents, service_fee_cents, vendor_payout_cents) — none exist; orders.buyer_user_id NOT NULL
  omitted (snapshot orders section). Fee math hardcoded 6.5%+15¢ BOTH sides (119:138-144).
- EVT-2 STILL TRUE: ShopClient.handleConfirmOrder posts reservation_id/listing_id/vendor_profile_id/
  wave_id only (ShopClient.tsx:436-444); route 403s when access_code set (order/route.ts:65-73); approval
  mints a code for every company_paid/hybrid (event-actions.ts:170-177) → always 403.
- EVT-7 STILL TRUE: generateEventWaves callers = admin only (admin/events/[id]/route.ts:531,
  generate-waves/route.ts:84); select route's ready flip computes waveCount for capacity but never
  generates waves (select/route.ts:219-288); ShopClient isCompanyPaid requires waveOrderingEnabled (:342).
- Buyer-confirm NOW has an isCompanyPaid branch (confirm/route.ts:114) — VOR-14 may be resolved; verify.
- Vendor fulfil: company_paid → NO Stripe transfer, completes order, "payout comes through organizer
  settlement" (fulfill/route.ts:91, 203-209). Reject/resolve-issue exempt company_paid (reject:165,
  resolve-issue:209).
- Settlement report (admin/events/[id]/settlement/route.ts): companyPaidCents = bare subtotals (:356),
  companyPaymentBalance = manual payments − subtotals (:454) — EVT-11 (no 6.5%) still true.
- Admin payments route records deposit/final manually (admin/events/[id]/payments/route.ts:12-19).
- Organizer Stripe Connect exists on the event market for RECEIVING vendor fees only
  (event-fee-payments.ts:85-117, destination charge). Nothing collects money FROM the organizer.
- Intake already offers "Our company pays for everyone" (EventRequestForm.tsx:90); hybrid hidden.
- Organizer dashboard shows access code + "Total order value" (base) for company_paid (:304-342).
- Attendee order = ONE listing, qty 1, per wave reservation; per-attendee cap company_max_per_attendee_cents
  (119:97-118); attendee must be signed in (order/route.ts:26-30).

## Owner rulings 2026-09-22 (decisions.md row): prepay estimate → refund/invoice after · V1 = 1 attendee
1 meal 1 truck · existing fees hold · attendees need accounts · host pays OUT OF BAND, admin records
the prepaid balance (Stripe host checkout NOT V1).

## More re-verification 2026-09-22
- mig 119 RPC also reads `l.base_price_cents` (119:72) — listings has only `price_cents` (snapshot) →
  a 4th dead reference in the RPC. Full rewrite regardless.
- `event_company_payments`: payment_type ('deposit'|'final_settlement' enforced by the admin POST),
  amount_cents, payment_method (free text), status (pending → PATCH paid/refunded), notes, paid_at.
  Admin POST vertical-scoped. No refund/negative type today.
- `vendor_payouts`: order_item_id, vendor_profile_id, amount_cents, stripe_transfer_id, status
  (payout_status enum — values UNVERIFIED), transferred_at. Used by fulfil for Stripe transfers.
- `order_items.vendor_payout_cents` + `platform_fee_cents` exist (per-item money lives here, as the
  backlog says). `wave_id` on order_items.
- Waves: `generateEventWaves` — wave count from service window ÷ `markets.wave_duration_minutes`
  (default 30), per-wave capacity = Σ accepted vendors' event_max_orders_per_wave, sets
  wave_ordering_enabled (wave-generation.ts:44-52). Vendor prep sheet groups orders by wave
  (prep/route.ts:12-16). Attendee shop accepts status approved|ready|active (shop-data.ts:131).
- Event cutoff: `cutoff_hours` clamped 12–168h at approval (event-actions.ts:132 per map).

## Round 3 code facts (2026-09-22)
- `order_item_status` = pending → confirmed → ready ("Vendor marked ready for pickup") → fulfilled ("Buyer
  picked up") | cancelled | refunded (mig 001:28-35). Vendor Ready tap sets 'ready' (ready/route.ts:84).
  → "prepared" IS distinguishable: ready or fulfilled.
- Fulfil supports BOTH orders: buyer-first (ack → vendor within 30 s; :119-141) and vendor-first (vendor
  fulfils, buyer acks later; :501-533; bundles excepted). For company_paid fulfil moves no money (:203-230)
  → the 30-s window is irrelevant to money at host-paid events; a single vendor tap suffices.
- Event QR: my-order shows pick-ticket + QR (my-order/route.ts:10); NO scan endpoint found under
  api/vendor or api/events → QR is visual only (UNVERIFIED whether any client reads it).
- Inventory on company-paid path: RPC reads listing + evl link only (119:70-90) — NO quantity decrement.
  Event shop shows "N left" ≤10 and caps the picker from listing.quantity (ShopClient:1139, 1179-1219);
  per-vendor `event_max_orders_total` cap (validate-order-cap) and per-wave capacity also apply.
- Company-paid orders are created 'confirmed' (order/route.ts:15) — no vendor-confirm expiry; a HELD
  state (gate until host pays) must stay clear of the expire-orders cron.
- payout_status enum: base values UNVERIFIED; 'skipped_dev' + 'pending_stripe_setup' added (mig 035).
- Fee math, owner's proposal vs counter: both = 6.5% + $0.50/meal to the host; counter keeps public
  prices identical (6.5% baked) + ONE visible line "$0.50 per meal facilitation fee".

## Shape of the build (report 2026-09-22)
Phase 1 (make executable + host money IN via Stripe): rewrite RPC (migration, fee from pricing.ts);
client sends access_code; waves generated on ready for company_paid; CSPRNG code; host Checkout
session (prepay) → webhook marks event_company_payments paid (stripe_payment_intent_id unused today);
fulfil for company_paid → ordinary transferToVendor from platform balance once host paid; settlement +
dashboard include the 6.5% (decisions.md pair). Phase 2: unused-prepay refund to host, deposit/final
split, buyer-cancel branch, guest ordering, hybrid.
Decisions needed: host payment shape (prepay max exposure vs deposit+final vs invoice-after) · confirm
fee (6.5% host + 6.5%+15¢ vendor as RPC does) · attendee accounts vs guest · unused-funds refund rule.
