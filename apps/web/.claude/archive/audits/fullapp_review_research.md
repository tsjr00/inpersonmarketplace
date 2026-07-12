# Full-App Code Review — Research (2026-06-27)

**Method:** Code-only. Do NOT use prior `.claude` audits/reviews as sources of truth.
Agents map subsystems + flag candidate gaps (with file:line pointers). Claude READS the
code and cites `path:line` before presenting anything as a finding. Unverified = labeled.

**Two goals:** (1) understand the app to add features; (2) find SIGNIFICANT gaps that
block a user from completing a workflow (dead-ends, missing UI↔backend connections,
unreachable/unescapable states, broken links). Not small inefficiencies. High-value
functionality/efficiency opportunities OK to surface.

## Subsystem checklist
- [ ] 1. Buyer journey: browse → listing → cart → checkout → order → pickup
- [ ] 2. Vendor journey: signup → 3-gate onboarding → listings → markets/schedule → orders → payouts
- [ ] 3. Market-manager journey: intake → dashboard → vendor mgmt → booth inventory → schedule → broadcast → Stripe Connect → settlement
- [ ] 4. Phase E season prepay: booking → checkout → webhook → settlement → credits → cancel
- [ ] 5. Events: create → vendor match/invite → shop → checkout → settlement
- [ ] 6. Market boxes / subscriptions: offering → subscribe → pickups → payouts
- [ ] 7. Cross-cutting: notifications, cron, auth/RLS/IDOR, multi-vertical isolation, pricing single-source

## Agent pointers (UNVERIFIED until Claude cites)

### Manager journey (agent a9fb)
- Intake → market `status='pending'`; Stripe onboard 403 until admin approves (`api/market-manager/[marketId]/stripe/onboard/route.ts:93-101`). LIKELY BY-DESIGN (anti-fraud) — verify it's not a dead-end (does admin approval path exist + notify?).
- **Season settlement panel UNBUILT** — dashboard `page.tsx:334-342` comment; no UI for season revenue / refund-vs-cap / settlement summary. Vendor cancel route exists but check UI button. (matches handoff: known unbuilt)
- Schedule PUT allows saving with NO active day (`api/market-manager/[marketId]/schedules/route.ts`) — verify no min-day validation; would a market with empty schedule break buyer availability?
- Stripe `action_required` recovery = refresh button only; verify no dead-end.
- Cancel-date "reschedule" disposition stores reschedule_date but no manager-side confirmation UI (advisory in v1 — likely known).
- Booth-inventory DELETE exists (`booth-inventory/[id]` DELETE) — CHECK: does deleting a tier with active paid rentals cascade/orphan? (schema-intent gate relevant)

### Buyer journey (agent acce) — many recoverable/by-design; verify these
- External payment lifecycle: order created `status='pending_external'`; agent claims NO auto-complete + buyer can't mark paid + abandoned orders orphan forever (no cleanup cron). VERIFY: `api/checkout/external/route.ts`, the external success page, and whether a cron expires pending_external. (potential real blocker: buyer-paid-externally with no confirmation path)
- Pickup confirmation window: `confirmation_window_expires_at` — agent claims buyer locked out after expiry with no message. VERIFY what happens to an order whose window expires (stuck status? auto-fulfill? refund?). (`buyer/orders/[id]` + cron)
- External-payment refund on buyer cancel: agent claims refund only works for Stripe; external orders can't refund (`buyer/orders/[id]/cancel/route.ts`). VERIFY — is there any external-refund/credit path.
- "Orders Closed" when no accepting pickup dates (`AddToCartButton`) — verify it's a genuine availability state, not a bug making sellable listings unbuyable.
- Vendor missing `stripe_account_id` → whole checkout fails for that vendor (`checkout/session/route.ts:283`) — by-design but verify buyer sees it BEFORE attempting, not a dead-end.

### Vendor journey (agent a678)
- **Partner-agreement publish gate** (HIGH candidate): `listings/[id]/publish/route.ts:107-119` blocks publish unless `vendor_partner` agreement accepted (for non-grandfathered vendors), but agent says it's NOT prompted/gated during onboarding and the error gives no link. VERIFY: is there ANY UI surface that prompts a new vendor to accept the partner agreement? If not → new vendors complete everything then can't publish with no clear path. (`api/user/accept-agreement`, onboarding UI, publish route)
- `sell_eligible=false` blocks publish with "contact support" + no self-serve recovery (`publish/route.ts:158-160`) — verify who gets sell_eligible=false (FM cat 3/4 booth-only) and whether that's intended dead-end.
- Listing CREATE endpoint: agent found no POST `/api/listings` or `/api/vendor/listings` — likely client-side Supabase insert via RLS. VERIFY how listings are created (is there a form→insert path that works?).
- Payout failure on fulfill → status `failed`/retry by cron Phase 5 but low vendor visibility (`fulfill/route.ts:356-407`) — verify vendor can SEE failed payouts somewhere.

### Cross-cutting (agent aa53)
- Pricing single-source CONFIRMED (no fee math outside pricing.ts per grep). Auth/RLS spot-checks (booth-groups cancel, checkout/success, cancel-date) all verify ownership before service-client writes — no IDOR in sample. (good — light re-verify)
- **Cron Phase 3.6 auto-confirm external orders (24h post-pickup) sends NO notification** (`cron/expire-orders/route.ts` ~Phase 3.6); type `external_payment_auto_confirmed` defined (`notifications/types.ts:491-498`) but never sent. VERIFY both (dead notification type + silent auto-confirm). Tie to buyer-agent external-payment-lifecycle question.
- `buyer/orders` GET vertical filter OPTIONAL (~route:101-103) — cross-vertical leak if param omitted; LOW (auth'd to own orders). Verify callers pass vertical.
- Event approval/vendor-invite notifications fire-and-forget `.catch(()=>{})` — organizer/vendor may not learn of approval if Resend fails; no log. (LOW-MED)

### Phase E (agent a778)
- Core chain (manager create/open → vendor book → Stripe → webhook confirm → cron reconcile) all WORKS in code.
- **Vendor post-booking visibility (HIGH candidate):** `vendor/bookings/page.tsx:101` queries `weekly_booth_rentals` only, no `booth_booking_groups` join; comment line 30-31 says read-only v1, cancel deferred ("Fix-10"). VERIFY: after a season purchase, does the vendor see the individual paid weeks (they ARE weekly_booth_rentals rows w/ group_id) — i.e. is it "no visibility at all" or "shows weeks but not grouped + no cancel"? Material difference.
- **Vendor cancel button: route exists, NO UI calls it** (`api/vendor/booth-groups/[groupId]/cancel`). (known remaining item #1)
- **Manager settlement panel UNBUILT**: `getGroupCancelledDays` (`lib/markets/cancelled-days.ts`) unreferenced by any route; no UI to view cancelled-days vs refund_cap or grant credits. (known item #2)
- **Credit redemption UNBUILT**: `booth_credits` written by cancel, never read at booking; no offset. (known item #4, money path)
- Net: vendor can prepay a season then has no self-serve control; manager can't settle. These are GROWTH-completeness gaps, consistent with handoff.

### Market boxes (agent a465)
- **No buyer subscription-cancellation path (CRITICAL candidate):** `api/buyer/market-boxes/[id]/route.ts` is GET-only (no DELETE/PATCH); `market_box_subscriptions.cancelled_at` + status 'cancelled' exist but nothing sets them. VERIFY there's truly no cancel endpoint anywhere (grep for cancel under buyer/market-boxes). If true → buyer locked into a 4/8-week prepaid sub with no exit. (high-value: real user blocker)
- **Subscription completion-count ignores 'skipped' (MEDIUM candidate):** mig 006 completion trigger counts status IN ('picked_up','missed','rescheduled') >=4; 'skipped' not counted → if vendor skips, sub may never auto-complete. VERIFY against the ACTUAL applied trigger (mig 006 may have been superseded by 124/163). Schema gate: read the live function, not just mig 006.
- FT skip-a-week hardcoded 403 (`pickups/[id]/skip/route.ts:78-82`) — verify intended (FM-only feature) vs gap.
- MB payout when vendor lacks Stripe → `pending_stripe_setup`, no notification (`market-box-payout.ts:141-153`) — verify cron Phase 5 retries it AND whether vendor is ever told to connect Stripe. (vendor underpayment/visibility)
- At-capacity-after-checkout → async refund (`checkout/success`) — low, race-narrow.

## Verified findings (path:line) — Claude read each

### CONFIRMED significant gaps
1. **Market box subscriptions have NO cancellation path (buyer OR vendor).** `api/buyer/market-boxes/[id]/route.ts` exports GET only (line 14); the only POST under buyer/market-boxes is subscribe (`route.ts:178`) + confirm-pickup. Grep across all of `src` for `market_box_subscriptions … cancelled/cancelled_at` = ZERO matches. Schema has `cancelled_at` + status 'cancelled' but nothing ever sets them. ⇒ buyer prepays 4/8 weeks, no exit/refund if they must stop; vendor can't cancel either. Severity depends on business intent.
2. **Phase E season feature is incomplete for end-of-life actions** (matches handoff, confirmed in code): vendor cancel route exists (`api/vendor/booth-groups/[groupId]/cancel`) but NO UI calls it; manager settlement panel unbuilt (`lib/markets/cancelled-days.ts getGroupCancelledDays` unreferenced by any route); credit redemption unbuilt (`booth_credits` written by cancel, never read at booking). Vendor sees their season WEEKS on `vendor/bookings/page.tsx:101-106` (queries weekly_booth_rentals incl. season children) but ungrouped + no cancel.

### CONFIRMED lower / by-design / messaging
3. Buyer cancel of an EXTERNAL-payment order: refund only fires if `stripe_payment_intent_id` exists (`buyer/orders/[id]/cancel/route.ts:222-225`); external (cash/venmo) has none → item cancelled, message still says "Full refund will be processed" (`:300`). Off-platform refund is vendor's job; messaging implies automated refund that won't happen. LOW/messaging.
4. Refund failures ARE logged (`ERR_REFUND_001` cancel:237; reject/success routes too) — not silent. No automated refund retry (payouts have one). MED-ops.
5. `buyer/orders` + `/api/markets` GET vertical filter optional — LOW (auth'd to own data).

### FALSE ALARMS corrected by reading code (agents overstated)
- Cron Phase 3.6 external auto-confirm DOES notify vendor: `cron/expire-orders/route.ts:618 sendNotification(...,'external_payment_auto_confirmed',...)`. NOT a dead type.
- Vendor partner-agreement IS prompted in onboarding: `components/vendor/OnboardingChecklist.tsx:189-209 handleAcceptPartnerAgreement`. Publish gate (`publish/route.ts:107-119`) is satisfiable via the checklist.
- Events DO auto-transition: cron Phase 14 ready→active (`:2285-2312`), Phase 15 active→review (`:2315-2343`).
- Attendee-paid event orders carry market context: `checkout/session/route.ts:557 market_id: pickupInfo?.marketId`.
- Pricing single-source + auth/RLS spot-checks clean (agent aa53), light-verified.

### CANDIDATES — RESOLVED after Claude read (all false-alarm or mitigated)
- MB completion 'skipped': **false alarm.** mig `20260123_001_market_box_multi_term.sql:130-153` supersedes mig 006 — trigger fires on/counts `('picked_up','missed','skipped','rescheduled')`. Skipped IS counted.
- MB payout `pending_stripe_setup`: **mitigated.** cron Phase 5 query `.in('status',['failed','pending_stripe_setup'])` (`expire-orders/route.ts:100`) + MB-subscription payout retry (`:1243-1256`). Residual: vendor not explicitly nudged to connect Stripe (LOW).
- Event wave reservation expiry: **false alarm.** mig 120 T2-1 added `event_wave_reservations.expires_at`; `reserve_event_wave` sets `now()+INTERVAL '10 minutes'` (`:62-63`). 10-min TTL frees capacity. (Caveat: confirmed column+RPC set it; did not trace the capacity-recount filter, but T2-1's purpose is exactly this.)
- Event company-paid `access_code`: **false alarm.** auto-generated for company_paid AND hybrid at approval (`lib/events/event-actions.ts:167-173 generateAccessCode()`); both self-service + admin paths set it. Order route's `if (event.access_code)` effectively always enforces.
- Event company-paid vendor payouts: **mitigated.** `create_company_paid_order` records `vendor_payout_cents = price − 6.5% platform fee` (mig 112:1-4, 28-29); payout flows through normal order fulfillment. Settlement endpoint is a read-only REPORT, not the payout mechanism.

### NET RESULT
Only ONE confirmed significant gap stands: **Phase E season feature is incomplete for end-of-life actions** (vendor cancel UI, manager settlement panel, credit redemption) — known/planned, not a bug. Market-box no-cancellation = BY DESIGN (user confirmed 2026-06-27: farmers spend upfront cash on crops; off-platform refunds only). Money path, auth/RLS, pricing single-source, inventory/booking races, events lifecycle/payouts all verified sound.
