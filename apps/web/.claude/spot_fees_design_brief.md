# EVENT SPOT FEES — design brief (prep 2026-08-14, code-verified)

Prepared while owner tested, per "do you need to do any planning now." Everything cited was read this session. Companion to backlog → "EVENT SPOT FEES". This is INPUT to the design session — nothing here is decided except where marked owner-decided.

## 1. What already exists (the machinery to replicate)

**The full vendor-pays-manager rail runs today for markets:**
- **Booking row:** `weekly_booth_rentals` status `pending_payment` → paid (mig 139; atomic booking via `book_weekly_booth_atomic`, mig 186).
- **Booking route:** `api/vendor/markets/[id]/book/route.ts` — auth chain (vendor approved at market via `market_vendors.approved`), agreement-acceptance gate, price snapshot from inventory, then `createBoothRentalCheckoutSession` (lib/stripe/payments).
- **Fee math:** `calculateBoothRentalFees` (pricing.ts:324) — vendor pays base×1.065+$0.15; manager receives base×keep% (default 93.5%); platform keeps the spread. **Already parameterized per-market** via `operator_keep_pct` (P6 lever).
- **Payment landing:** webhooks.ts booth section (~:1563) flips the row on checkout completion + notifies vendor (`booth_rental_paid_vendor`) and manager (`booth_rental_paid_manager`, with managerReceivesAmountCents).
- **Manager RECEIVES money via a market-level Connect account:** `markets.stripe_account_id`, onboarded through `api/market-manager/[marketId]/stripe/onboard` (Phase C Stage 2 — create/resume Express account, hosted account link, status sync on return).

**⚡ KEY INSIGHT: event markets ARE `markets` rows.** The Connect account column, the onboarding route pattern, and the payout math all attach to the market row — an event can carry `stripe_account_id` exactly like a managed market. "Organizer Connect" = the manager onboarding flow with `organizer_user_id` playing the `manager_user_id` role (auth check swaps `isMarketManager` for organizer-of-this-event). The mig-218 durable-link lesson applies to the invitation email.

## 2. Replication map

| Piece | Market side (exists) | Event side (to build) |
|---|---|---|
| Fee config | `market_booth_inventory` tiers | Single flat `spot_fee_cents` on the event (per-day variant for multi-day — see decisions) |
| Booking/payment row | `weekly_booth_rentals` | New `event_spot_payments` (or generalize) — vendor, market_id, amount snapshot, status pending_payment→paid |
| Checkout | `createBoothRentalCheckoutSession` | Same helper, new metadata type |
| Webhook flip | booth section in webhooks.ts | New case, same shape; notifies vendor + organizer |
| Receiver onboarding | manager Stripe onboard route | Organizer variant (auth = organizer_user_id) |
| Fee math | `calculateBoothRentalFees` | REUSE AS-IS (flat fee = the "weekly price"); platform cut comes free |
| Payout | manager receives via Connect | identical |

## 3. Genuinely new pieces (no existing analog)
1. **The paid gate on sellability.** Owner-decided placement: LAST gate — accepted + selected + terms done → pay → pre-orders unlock. Today the rule is "event listing sells iff vendor has ACCEPTED market_vendors row" — **a REGISTERED PAIRED RULE (`event-sells-on-acceptance`, app↔SQL, pinned in paired-rules.ts + flow-integrity tests + mig 223's SQL)**. Adding "AND paid (when the event charges a fee)" changes both surfaces of the pair deliberately: the SQL definer (`get_available_pickup_dates` — 20th rewrite, by migration number) and the registry entry + tests, in one commit. The registry makes this a visible edit, not drift. Zero-fee events must behave exactly as today.
2. **Organizer-side fee setup UI** — where the organizer sets the fee (intake form? post-approval? admin sets it?). See decisions.
3. **Vendor-side pay step** — after organizer selection; invitation/respond flow gains a "pay your spot fee" state between accepted and selling.
4. **Refund story** — vendor pays fee, then event cancels / organizer changes date / vendor cancels. Who refunds, when, automatic or manual? (Cancellation flows: `events/[token]/cancel`, vendor cancel route, change-request system all exist to hook into.)

## 4. Multi-day events — current state + owner leanings
- Schema already has `markets.event_start_date` + `event_end_date` and `catering_requests.event_end_date` — multi-day EXISTS as a date range, but pre-ordering assumes ONE pickup date (`shop-data.ts` sets `pickup_date = event.event_date`; one schedule row; waves are per-event not per-day).
- **Owner leaning (TENTATIVE, 2026-08-13):** same vendor + same location + different days in one order "blurs the lines too much" → separate transaction per day. Aligns with the existing multi-market-cart paired rule (event items already must be ordered alone).
- Fee interaction: vendors may pay per day (car-show Fri/Sat case) → fee config may need per-day granularity, and the paid gate becomes per-day. SIMPLEST V1: one fee covers the whole event; per-day fees phase 2. (Owner to confirm.)
- Pre-order day selection: borrow catering advance-order windows (vendor-set how far ahead items orderable) — owner suggestion.

## 5. DECISION LIST for the design session (the agenda)
1. **Who sets the fee and when?** Organizer at intake vs post-approval vs admin-assisted only. (Fee visible to vendors BEFORE they accept? Presumably yes — it's part of what they're agreeing to.)
2. **Fee disclosure in the invitation:** does the invite say "spot fee: $X" up front? (Affects matching/accept UX + the T-08-class notification payloads.)
3. **One fee per event or per day (multi-day)?** V1 recommendation: per event.
4. **Pay deadline:** accepted-and-selected vendor never pays — how long until their spot is released / backup promoted? (Backup-vendor spec exists, unbuilt.)
5. **Refund policy matrix:** event cancelled by organizer / date changed / vendor cancels after paying / admin kills event. Which are automatic?
6. **Platform cut:** reuse booth math (6.5%×2 + $0.15, operator keep 93.5%) verbatim, or different rates for events?
7. **Zero-fee events:** confirmed no behavior change (gate skipped entirely)?
8. **Organizer Connect timing:** onboard at approval (before fees collectible) or lazily when first setting a fee? (Beneficiary flow's lazy pattern + durable email link is the precedent.)
9. **Naming:** "spot fee" vs "event entrance fee" vs per-vertical term() entries.
10. **Multi-day pre-orders (separate feature, same session?):** confirm separate-transaction-per-day leaning; per-day schedule rows/waves are real build items — scope V1 or defer?

## 6. Suggested build order (after design sign-off)
1. Schema: fee column(s) + `event_spot_payments` + organizer-Connect reuse (markets.stripe_account_id already exists — likely zero schema for that).
2. Organizer onboard route variant + fee setup UI.
3. Vendor pay step (booking-route clone) + webhook case.
4. The paid gate: SQL definer change (mig, with 223/225-style differential recipe) + registry/test update IN THE SAME COMMIT.
5. Notifications (typed payload keys from day one — avoid the T-08 class).
6. Multi-day pre-ordering as its own phase.

---

# PHASED BUILD PLAN — drafted 2026-08-14 after all 10 decisions signed off (decisions.md)

Each phase = present → build → owner tests → next. Gates marked ⚠ need their own approvals when reached.

## Phase 1 — Schema (migration 228)
- `catering_requests.event_vendor_fee_cents INTEGER NULL` — NULL/0 = free event (decision 7: byte-identical behavior). On the REQUEST per mig 219's ownership rule (request = source of truth); no market copy.
- `market_vendors.organizer_selected_at TIMESTAMPTZ` — starts the 12h protected window (decision 4). Protection is DERIVED (selected_at + 12h), not stored, so the override needs no clock mutation.
- New table `event_vendor_fee_payments`: catering_request_id, market_id, vendor_profile_id, fee snapshot (fee_cents, vendor_pays_cents, organizer_receives_cents, platform_keeps_cents — from calculateBoothRentalFees, decision 6), status CHECK (pending_payment/paid/refunded/released), stripe_checkout_session_id, paid_at, refund fields. UNIQUE partial (market_id, vendor_profile_id) WHERE status IN (pending_payment, paid). RLS: enabled, vendor-own + organizer-own SELECT policies (post-226 posture — no USING(true)).
- Organizer payout account: REUSE `markets.stripe_account_id` — zero schema.

## Phase 2 — Organizer side
- Fee setup card on event-manager dashboard (post-approval only, decision 1): set/change Event Vendor Fee (decision 9 name; term() entries both verticals).
- Lazy Connect (decision 8b): fee-set flow checks markets.stripe_account_id → if absent, starts onboarding (clone api/market-manager/[marketId]/stripe/onboard with organizer_user_id auth) + durable email link fallback (mig 218 pattern) for finish-later.
- Fee changes after vendors invited: fee is SNAPSHOTTED per payment row; changing the fee affects only future payers (present this behavior explicitly at build time).

## Phase 3 — Vendor side (pay step)
- Invitation discloses the fee (decision 2): catering_vendor_invited notification + vendor/events/[marketId] page + respond flow copy. Typed payload keys from day one (T-08 class prevention).
- Pay route (clone of vendor/markets/[id]/book shape): eligibility = organizer-selected + fee unpaid + window rules (decision 4) → createBoothRentalCheckoutSession variant → webhook case flips paid + notifies vendor & organizer.
- ⚠ RACE SAFETY: first-payment-wins across N spots via advisory-lock RPC (book_weekly_booth_atomic pattern): paid_count < spot_count checked under lock at session-create AND at webhook flip (webhook is authoritative; late loser auto-refunds — rare, bounded by simultaneous checkouts, same accepted model as mig 216).
- Window enforcement: no surplus → others blocked until selected vendor's 12h lapses; organizer override endpoint opens a specific waiting vendor early.

## Phase 4 — The paid gate (the paired-rule change)
- SQL: get_available_pickup_dates acceptance branch gains AND (event has no fee OR vendor has paid row) — new migration, mig 223/225-style spliced-diff + differential recipe.
- ⚠ SAME COMMIT: registry entry `event-sells-on-acceptance` reworded (acceptance AND payment-when-charged) + flow-integrity tests updated. **Test-expectation changes get presented separately per test-integrity rules — planned as a DECISION POINT, not a to-do.**
- App-side mirror: shop-data/vendor surfaces already derive from the SQL definer — verify no second copy of the sellability rule needs the fee clause (paired-rule sweep at build time).

## Phase 5 — Refunds (decision 5)
- Organizer cancels event → automatic full refund of all paid fee rows (hook into events/[token]/cancel; createRefund with deterministic keys).
- Date change / vendor cancels / admin kills: MANUAL V1 — admin needs a payments list per event (extend settlement/admin event view) with a refund action.

## Phase 6 — Polish
- Organizer earnings visibility (fees received) on event-manager dashboard; settlement report line items.
- Sharing/marketing audit (owner's presentation note) — separate small item.

**Order rationale:** 1→2→3 ship value without touching the sell gate (vendors can pay; nothing blocks selling yet) — 4 flips enforcement on; 5–6 complete the loop. Suggested pacing: 1+2 one session, 3 one session, 4 one careful session (money + paired rule), 5+6 one session.

---

# BUILD STATUS — updated 2026-08-14

- **Phase 1 ✅ BUILT.** Mig 228 applied Dev + Staging (owner); Prod pending (harmless early).
- **Phase 2 ✅ BUILT.** Fee route (GET/PUT + lazy-Connect refusal), organizer onboard route, EventVendorFeeCard on event-manager dashboard.
- **Phase 3 ✅ BUILT (owner "all approved" for the protected pieces).** Mig 229 (2 RPCs — WRITTEN, NOT APPLIED anywhere yet); lib/stripe/event-fee-payments.ts (own module — payments.ts untouched); pay route with reason→message map; organizer_selected_at stamped in select POST (once, never extended); fee disclosed on the invitation page pre-acceptance + pay button post-selection; webhooks.ts dispatch + handleEventVendorFeeCheckoutComplete (protected-file approval given; deny-once hook fired + verified + retried); 3 notification types (tripwire 105→108 with notation).
- All gates green: tsc, eslint (0 errors), 1970/1970 tests.
- ⚠ DEFERRED, flagged: organizer early-open override (decision 4 last clause) — after 12h the lapse opens spots automatically; explicit early-open is later polish. The invitation EMAIL/notification does not yet mention the fee (the invitation PAGE does — the notification links there); template fee line = later polish.
- **REMAINING: Phase 4** (paid gate in get_available_pickup_dates + registry/test edit — the careful session), **Phase 5** (organizer-cancel auto-refund hook + admin payments view), **Phase 6** (organizer earnings, settlement lines, sharing audit).
- Owner to apply mig 229 (Dev + Staging) before end-to-end testing the pay flow.
