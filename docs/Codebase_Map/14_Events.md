# 14 — Events (private / catering)

<!-- map-stamp: domain=events; verified=2026-08-16; commit=fe11be3a -->
<!-- map-claims
src/app/api/events/**
src/app/api/event-requests/**
src/app/api/event-approved-vendors/**
src/lib/events/**
src/components/events/**
src/app/[vertical]/events/**
src/app/[vertical]/vendor/events/**
src/app/[vertical]/event-manager/**
src/app/api/orders/reconfirm/**
src/app/[vertical]/reconfirm/**
-->

**An event is not a vertical.** It is a `catering_requests` row plus a `markets` row with `market_type='event'` and `is_private=true`, cross-linked by `markets.catering_request_id` / `catering_requests.market_id` (`lib/events/event-actions.ts:119-140`). Events exist in both verticals.

---

## Read this first

1. `lib/events/event-actions.ts` — the entire approve-and-match engine in one file. Read `:88-175` (approval) then `:198-398` (matching).
2. `api/events/[token]/select/route.ts` — the token-only trust boundary and the `approved → ready` transition.
3. `lib/events/shop-data.ts` — the single payload every attendee surface renders from, including the auth-gated price hiding.
4. `api/events/[token]/cancel/route.ts` — the only organizer-triggered money path; the comments at `:161-170` encode hard-won refund rules.
5. `lib/events/viability.ts` — pure and testable; read it last, it explains the scoring vocabulary used elsewhere.
6. **Treat `api/events/[token]/order/route.ts` and the wave stack as quarantined** — see [§ company-paid](#company-paid--deferred-and-non-executable). Do not reason about live money there.

## The token access model — three distinct levels

There is no single "organizer auth". Routes under `/api/events/[token]/*` use three different models, and confusing them is the most likely source of a security mistake in this domain.

| Level | Routes | Rule |
|---|---|---|
| **Token-as-credential, no account** | `select` (GET/POST), `waves`, `verify-code`, `validate-capacity`, `validate-order-cap`, `shop`, the event landing page | The 18-char token *is* the secret (~108 bits, `event-actions.ts:98-113`). It alone authorizes viewing candidate vendors and committing the final vendor selection (`select/route.ts:27-58`, `:166-207`). |
| **Authenticated + organizer identity (user id OR email)** | `details` (GET/PATCH), `refresh-matches`, `cancel` | Matches `organizer_user_id` **or** `contact_email` (`details/route.ts:117-121`). The first email-matched PATCH back-links `organizer_user_id` (`:229-231`) — this is how an account-less organizer becomes account-bound. |
| **Authenticated + strict `organizer_user_id ===`** | `broadcast`, `agreement`, `ratings` | No email fallback (`ratings/route.ts:42-44`). **Unreachable until the organizer has signed up and been linked by the level above** — a real ordering dependency. |

Attendee writes (`waves/reserve`, `order`, `my-order`) require a login but are **not** membership-checked against the event — token + any valid account suffices. Every route uses the service client and enforces access in application code, not RLS.

## Routes

| File | Purpose | Money |
|---|---|---|
| `api/event-requests/route.ts` | Public intake: validates (headcount 10–5000, `:79-165`), blocks vendors organizing by email (`:169-183`), moderates free text (`:186-200`), inserts `catering_requests`; auto-approves + auto-invites when `service_level='self_service'` and an address is present (`:291-299`) | No |
| `api/event-approved-vendors/route.ts` | Public typeahead of `event_approved` vendors for the request form (30/60s per IP) | No |
| `api/events/[token]/details/route.ts` | Organizer Stage-2 detail form; whitelist of 28 editable fields; flags `matchingChanged` | No |
| `api/events/[token]/select/route.ts` | GET accepted vendors + per-vendor `selected` state; POST final picks → status `ready`, others flagged backup (is_backup cleared on promotion), wave capacity recalculated. T-80 (2026-08-15): vendor confirmations go to NEWLY selected only; organizer email + QR kit on FIRST confirmation only — re-submits are quiet | No |
| `api/events/[token]/refresh-matches/route.ts` | Re-runs `autoMatchAndInvite` after matching-affecting edits | No |
| `api/events/[token]/vendor-fee/route.ts` | Event Vendor Fee (V1 2026-08-14): GET fee + payout state + `reuse_options` (labels of reusable Connect accounts while onboarding incomplete); PUT set/clear fee — non-zero fee REFUSED until the event market's Connect onboarding is complete (`connect_required`, decision 8b). Organizer-only, post-approval. Fee lives on `catering_requests.event_vendor_fee_cents` (mig 228) | No |
| `api/events/[token]/stripe/onboard/route.ts` | Organizer variant of the manager Stripe onboard route — mints a fresh hosted Connect link per click for the event MARKET's account (`markets.stripe_account_id`); lazy, driven from the fee card | No |
| `api/events/[token]/stripe/reuse/route.ts` | Points the event market at a Connect account the organizer already finished elsewhere (vendor account or prior event) — offered choice, never automatic (owner 2026-08-15). Client sends only a `source` keyword; the account id is re-derived + live-verified server-side via `lib/events/reusable-payout-accounts.ts` | Money-adjacent |
| `api/orders/reconfirm/[token]/route.ts` | B3 (mig 230): token-based order re-confirmation after a consequential event change. GET = state + the event's CURRENT facts; POST = "I'm still coming" (sets reconfirmed_at). ⚠ GET must NEVER confirm — mail scanners click links (mig-218 lesson); only the page's button POSTs. No auth: the token is the credential. Stamping + first ping: `lib/events/reconfirmation.ts` (called by both consequential-change PATCH sites); reminders/final/refund: `cron/event-reconfirm` (17_Crons.md) | Money-adjacent |
| `[vertical]/reconfirm/[token]/page.tsx` | The buyer-facing "are you still coming?" landing for the re-confirmation link — shows the event's new details + one confirm button (POSTs; arrival never confirms) | No |
| `lib/events/backup-bench.ts` | Backup-bench sizing (owner model 2026-08-15, mig 232): ceil((10% base PLACEHOLDER + 3%/risk-factor PLACEHOLDER) × system-computed vendor requirement) + the equal-weight CANCELLATION_RISK_FACTORS checklist ids. Counts and recommends only — money is phase 3 | No |
| `lib/events/fee-cancellation.ts` | ⚠ Phase 3 money bands (owner 2026-08-16): 72h protection window (≥72h out = refund, inside = instant forfeit — including after event start) + 14-day organizer waive window. Pure logic, tested by `fee-cancellation.test.ts` | Money |
| `lib/events/event-fee-refunds.ts` | ⚠ Event-death fee fan-out (Fees Phase 5): refunds every PAID `event_vendor_fee_payments` row WITH transfer reversal, releases pending/covered rows, leaves forfeits (waiver lever survives). Called by organizer cancel route + admin `[id]` cancel/decline | Money |
| `api/events/[token]/fee-waiver/route.ts` | ⚠ Organizer waiver lever (Phase 3): GET forfeited fees for the dashboard card; POST waives ONE — claim-first guarded flip to refunded, then full refund with reversal (un-claims on Stripe failure). Window: event date + 14 days | Money |
| `api/vendor/events/[marketId]/standby/route.ts` | Standby bench opt-in/out (POST/DELETE, mig 232): accepted + non-selected (is_backup) vendors only; sets/clears standby_opted_in_at. Zero obligation — commit to being ASKED, never to going | No |
| `api/vendor/events/[marketId]/pay/route.ts` | ⚠ Vendor pays the Event Vendor Fee: booth math via `calculateBoothRentalFees`, eligibility + 12h windows via `create_event_fee_payment_if_eligible` (mig 229, advisory-locked), Stripe destination-charge session via `lib/stripe/event-fee-payments.ts`. First PAYMENT wins at the webhook flip | Money-adjacent |
| `api/events/[token]/shop/route.ts` | HTTP wrapper over `lib/events/shop-data.ts` for the attendee shop | Prices |
| `api/events/[token]/waves/route.ts` | Wave availability via `get_event_waves_with_availability`; 10s CDN cache | No |
| `api/events/[token]/waves/reserve/route.ts` | POST reserves a wave slot (frees expired reservations first); DELETE cancels | No |
| `api/events/[token]/order/route.ts` | Company-paid order via `create_company_paid_order`, bypassing Stripe — **currently unreachable** | ⚠ dead path |
| `api/events/[token]/my-order/route.ts` | The caller's own order at this event (pick ticket + QR) | No |
| `api/events/[token]/verify-code/route.ts` | Validates an 8-char access code; returns payment model + per-attendee cap. Rate-limited 5/min | No |
| `api/events/[token]/validate-capacity/route.ts` · `validate-order-cap/route.ts` | Remaining capacity / boolean pre-checkout gate against `event_max_orders_total` | No |
| `api/events/[token]/cancel/route.ts` | Organizer cancellation: expires Stripe sessions, refunds, deactivates the market, unlinks listings, notifies everyone | **YES** |
| `api/events/[token]/broadcast/route.ts` | One-way organizer → vendors/attendees announcement; 2 per event per 7 days | No |
| `api/events/[token]/agreement/route.ts` | Organizer selects event-eligible opt-in statements into `market_optin_selections` | No |
| `api/events/[token]/ratings/route.ts` | Approved-only, anonymized attendee ratings for the organizer (`:46-52`) | No |

## Library

| File | Purpose |
|---|---|
| `lib/events/event-actions.ts` | `generateAccessCode()`, `approveEventRequest()` (token + market + schedule, `cutoff_hours` clamped 12–168 at `:132`), `autoMatchAndInvite()` |
| `lib/events/viability.ts` | Pure scoring. `calculateViability` (`:381-495`) branches on product model: company-paid uses budget + wave capacity (`:396-418`), attendee-paid uses buyer-rate estimation (`:419-434`), crowd uses foot traffic × buy rate (`:435-457`). Overall = worst sub-score (`:471-473`); all assumptions emitted as text for admin transparency |
| `lib/events/wave-generation.ts` | Slices the service window into 30-min waves, summing `event_max_orders_per_wave` across accepted non-backup vendors (`:95-100`), hard-erroring if an accepted vendor declared no capacity (`:126-136`), then flips `markets.wave_ordering_enabled` (`:171-174`) |
| `lib/events/shop-data.ts` | Single source for the attendee payload. Accepts status `approved\|ready\|active` (`:130`), **zeroes `price_cents` for anonymous callers** (`:222`), loads waves only when wave ordering is on (`:270-284`) |
| `lib/events/event-ref.ts` | `eventRefColumn(ref)` — lets an organizer route be addressed by `catering_requests.id` OR `event_token`. See the "id, not token" note above; this is the fix for the address deadlock |
| `lib/events/complete-event.ts` | `runEventCompletionEffects` (`:30-122`) — unfulfilled-order alerts, batched buyer feedback requests, per-vendor settlement summaries, organizer email, `listing_markets` cleanup. Callers flip status *before* calling, so effects fire once (`:26-29`) |

## The flow

1. **Intake** — public POST to `/api/event-requests`.
2. **Approval** — self-service + address auto-approves: `approveEventRequest` mints an 18-char token, creates the `market_type='event'` market and a `market_schedules` row, and mints an access code **only** for `company_paid`/`hybrid` (`event-actions.ts:167-173`). Without an address nothing auto-approves, and the UI copy says so.
3. **Matching** — `autoMatchAndInvite` (`event-actions.ts:198-398`): pull `event_approved` vendors, skip organizer-email conflicts and vendors with fewer than 4 event-eligible items (`:282-285`), score, drop red flags / deal-breakers / score < 2.5, cap at 15, dedupe existing invites, insert `market_vendors` as `invited`, and notify **without revealing the company name** (`:379-389`).
4. **Selection** — organizer picks; non-picked accepted vendors become backups; wave capacity recalculates.
5. **Attendee ordering** — attendee-paid events go through the normal cart and `/api/checkout/session` (see [10_Checkout_Payments.md](10_Checkout_Payments.md)).
6. **Completion** — admin or the expire-orders cron triggers `runEventCompletionEffects`.
7. **Ratings** — attendees rate → `pending`; admin moderates; organizer sees only approved, anonymized rows.
8. **Cancellation** — the money-heavy path: expire pending sessions first and skip on failure since the order may be race-paid (`cancel/route.ts:185-195`); refund remaining balance for Stripe-paid orders (`:204-210`); **skip auto-refund and log for manual review if any item is `fulfilled`** (`:199-202`); guard-cancel items and orders; free wave slots.

## company-paid — deferred and non-executable

A complete-looking vertical slice exists — access-code minting and verification, wave generation and reservation RPCs, a Stripe-bypassing order route, per-attendee caps, company-paid viability scoring, UI handlers, and an admin settlement page. **It has never been executable end to end**, and two independent breaks were re-verified in current code:

1. **Access-code contract break.** `ShopClient.handleConfirmOrder` posts only `reservation_id, listing_id, vendor_profile_id, wave_id` (`ShopClient.tsx:419-424`), but the route hard-403s whenever `event.access_code` is set (`order/route.ts:65-73`) — and approval sets an access code for *every* company-paid/hybrid event. Order confirmation always 403s, even after `verify-code` succeeds.
2. **Waves are never generated on the self-service path.** `generateEventWaves` has exactly two callers, both admin (`admin/events/[id]/route.ts:208`, `admin/events/[id]/generate-waves/route.ts:78`). The self-service `ready` flip doesn't call it (`select/route.ts:264-287`), so `wave_ordering_enabled` stays false and the event silently degrades to attendee-paid.

**No money leaks today — the flow is dead.** It is tracked as a single deferred package (ledger items EVT-1/2/7/11/13/17, VOR-14, EVT-15-half) to be built as one project when scheduled, not patched piecemeal. Two known defects to fix *within* that package: `generateAccessCode` uses `Math.random` rather than a CSPRNG (`event-actions.ts:70-77`), and the order RPC has a reservation TOCTOU.

**Hybrid events** share the access-code gate but route their paid remainder through the normal cart, so only the company-funded item touches the dead path.

## ⚠ Three different "events" surfaces — do not merge them

Added 2026-08-07 after the owner flagged the confusion explicitly: *"the vendors (my bookings) will show events as well as markets or parks — they are separate even though they both relate to events."*

| Surface | Means | Identified by |
|---|---|---|
| **Event manager** — `event-manager/[id]/dashboard` | *I am RUNNING this event* | `catering_requests.organizer_user_id` |
| **Vendor's event** — "My Vendor Events" tile, vendor dashboard row 2 | *I am booked to SELL at this event* | `market_vendors` for the event's market |
| **Attendee** — `events/[token]/shop` etc. | *I am BUYING at this event* | token + optional access code |

**An event organizer is NOT a market manager.** Different table, different identity column — organizers are `catering_requests.organizer_user_id`, managers are `markets.manager_user_id`. An approved event does get a linked `market_id`, which makes them look related. They are not.

✅ **The organizer's "My Events" band is GONE from the shopper dashboard** (removed 2026-08-08). It was a port, not a delete — vendors-confirmed / pre-order / participation counts, wave utilization, the order-value summary and the View Event Page / Select Vendors links all moved to the event-manager dashboard, re-scoped from every-event-at-once to one event. Its five queries left the shopper dashboard with it.

### ⚠ How an organizer GETS to their dashboard — do not break this chain

The band was the landing target of the whole organizer onboarding funnel, which is easy to miss because no test covers it:

`api/event-requests/route.ts:501` (confirmation email) · the post-submit screen (`EventRequestForm.tsx:479-480`) · the cron nudge (`expire-orders/route.ts:3342`) all send **`signup?ref=event`** → signup turns that into a redirect URL and **persists it in `user_metadata.signup_redirect_to`** (`signup/page.tsx:97`) → `confirm-email/page.tsx:52` replays it, possibly days later. Login honors `?ref=event` independently.

New signups now land on `/[vertical]/event-manager`. **`/[vertical]/dashboard?section=events` still redirects there permanently** (`dashboard/page.tsx`, top of the component) because accounts created before 2026-08-08 have that URL frozen in their metadata. Do not remove that redirect as "dead code" — it is load-bearing for a link you cannot see in the codebase.

`ScrollToSection` is now unreferenced: `#events-section` was the last `?section=` target in the app.

### ⚠ Addressing organizer surfaces: id, not token (2026-08-08)

`event_token` is minted at **approval**, so anything keyed by it is unreachable for an event that has not been approved — which is precisely the population that needs an organizer surface. That produced a deadlock: an event submitted without a street address could not be approved (`api/admin/events/[id]` refuses), could not be edited (no token ⇒ the editor never rendered), and could not be cancelled (no token ⇒ no route). Nothing could reach it.

The rule now: **the organizer's own surfaces are addressed by `catering_requests.id`; the token is for ATTENDEE pages only.** This is safe because those routes authenticate the session's organizer identity, never the token.

- `lib/events/event-ref.ts` — `eventRefColumn(ref)` returns `'id' | 'event_token'` so a route can accept either. A token can never be mistaken for a uuid (length arithmetic, documented in the file).
- `api/events/[token]/{details,cancel,refresh-matches}` accept either (segment name kept — the attendee URL space is unchanged).
- `event-manager/[id]/dashboard` and the picker are keyed on id; **neither filters on `event_token`, and `nav-destinations.ts` must not either** — that filter is what hid a stuck event from its own organizer.

### ⚠ Two copies of every event fact — and which one wins (2026-08-08)

Approval does not move data, it **copies** it. `approveEventRequest` writes the request's address / city / state / zip / date / end-date / headcount into `markets`, and the times plus a weekday derived from the date into `market_schedules`. Until 2026-08-08 that INSERT was the **only write to `market_schedules` in the whole events path**, so from approval onward there were two copies and no rule about which one won.

Each surface had been wired to whichever copy was convenient, which is why the module never felt consistent:

| Surface | Reads event facts from |
|---|---|
| Organizer dashboard, admin console | `catering_requests` |
| **Vendor event page** (`api/vendor/events/[marketId]`) | **BOTH** — date/address/headcount from `markets`, times/setup notes/dietary from `catering_requests` |
| Attendee shop, display | `catering_requests` |
| **Attendee shop, the actual booking** | **`market_schedules`** — this supplies the cart's `schedule_id` |

**The rule now: the request is the source of truth; `markets` and `market_schedules` are derived copies.** Migration 219 (`trg_sync_event_request_to_market`) enforces it in the database — a trigger rather than a helper, because the times desynced precisely because a route was written that did not know to sync.

Two things it does NOT sync, both intentional: `markets.name` (built from a per-vertical *and per-locale* config suffix that SQL cannot resolve — so `company_name` stays frozen post-approval), and `cutoff_hours` / `event_allow_day_of_orders` (no editor exists for them yet).

⚠ **`api/events/[token]/details/route.ts` also syncs the times in application code, and that block must stay until mig 219 reaches PROD.** Prod runs well behind staging, so the code can arrive in an environment that has no trigger. Running both is idempotent. The same condition gates removing five fields from that route's `PRE_APPROVAL_ONLY_FIELDS`.

### The organizer change ladder (2026-08-09)

Four rungs, and the trigger for each is different. Confusing them is how this gets rebuilt wrong.

| Rung | Fires when | Where |
|---|---|---|
| **Lead-time floor** | Booking closer than 10 days · 10–13 days needs an acknowledgment | `lib/events/lead-time.ts`, intake route + form |
| **Warning with real counts** | Any edit to the timing group on a live event | `OrganizerEventDetails.tsx`, counts from `details` GET |
| **Acknowledgment dialog** | A change to day / place / time-by-30-min **AND pre-orders exist** | `details` PATCH → `change_acknowledgment_required` |
| **Hard block** | Same change, inside `max(72h, cutoff + 24h)` of the event | `details` PATCH → `change_blocked` → change request |

**The dialog is gated on CONSEQUENCE, not the clock.** No pre-orders means no friction at all — nobody to re-confirm. A time-based band was specced and abandoned: once the block starts at 72h, a band "72h to the cutoff" has zero width, and it would have waved through a date change three weeks out that forced twenty people to re-confirm.

**The block window is not the ordering cutoff.** `cutoff_hours` answers *when do vendors need certainty*; the block answers *when is it too late to ask attendees*. Using the cutoff for both leaves zero re-confirmation runway on long-cutoff events. Full reasoning in `lib/events/change-window.ts`.

### The override — `event_change_requests` (mig 220, 2026-08-09)

A blocked organizer is not stuck. They raise a request: a reason category, **a required explanation in their own words**, and the change they want. An **admin always reviews** — auto-approving self-declared emergencies was proposed and rejected.

| Route | Does |
|---|---|
| `api/events/[token]/change-request` | Organizer raises one / lists their own. Refuses when the change is not actually blocked, so the queue stays real |
| `api/admin/events/change-requests` | The queue, **oldest first** — every row is time-critical by definition |
| `api/admin/events/change-requests/[id]` | Approve or decline |

Rules worth not rediscovering: a **decline requires a note** (a DB CHECK, not a convention). **`order_action` is required on approval and has no default** — pre-orders are judged case by case. An admin may **edit before approving on admin-assisted events only**; a self-service request is approved exactly as asked, or declined. Approval **claims the row before applying the change**, so a failure leaves an approved-but-unapplied row that is visible, rather than an applied-but-still-pending one a second admin would apply twice.

⚠ **Notifications are NOT built yet.** Two `TODO(notifications slice)` markers show where the organizer notice and the vendor fan-out belong. The vendor message must carry the organizer's explanation verbatim and attributed, so vendors know the change came from the organizer and not from us. `order_action` records what the admin decided about pre-orders; **acting on it belongs to the re-confirmation slice, which owns refunds.**

⚠ **Admin can edit event times as of 2026-08-09**, and that is load-bearing rather than incidental: the block tells the organizer to contact us, so somebody here has to be able to make the change. Before this, admin could edit address/city/state/zip but not times — the block would have been a dead end.

### ⚠ The intake match count is the SCORED count, not the roster (2026-08-08)

`api/event-requests` returns `match_count` from `autoMatchAndInvite`'s `matched` — scored against the organizer's criteria, deal-breakers and red flags dropped, capped. It previously returned a count of *every* `event_approved` vendor in the vertical, rendered as "N qualified vendors found in your area" with no criteria and no location predicate anywhere in the query.

`null` means matching never ran (full-service, or self-service with no address); `0` means it ran and found nobody. **Do not collapse the two** — the client renders three different states, and coercing null to 0 turns "we didn't look" into "we found nobody."

The success copy promises the organizer can "refine your criteria for more matches." That is literally true and already gated: `api/events/[token]/refresh-matches` 401s an anonymous caller and re-runs the full engine. Do not reword it into "we are still searching" — the engine runs once per submission and does not keep looking on its own.

## UI

| File | Purpose |
|---|---|
| `components/events/EventRequestForm.tsx` | The vertical-aware multi-stage intake form (~845 lines) |
| `components/events/OrganizerEventDetails.tsx` | Stage-2 detail editor + refresh-matches banner (~770 lines) |
| `components/events/OrganizerEventActions.tsx` | Cancel / manage actions (triggers the refund path) |
| `components/events/EventVendorFeeCard.tsx` | Organizer sets the flat Event Vendor Fee (dollars→cents); walks them into lazy Connect onboarding when `connect_required`; fee changes only affect unpaid vendors (paid rows snapshot) |
| `lib/stripe/event-fee-payments.ts` | ⚠ `createEventVendorFeeCheckoutSession` — destination-charge session for the Event Vendor Fee (organizer's portion auto-routes to the event market's Connect account). Deliberately its OWN module, cloned from `createBoothRentalCheckoutSession`, so the protected payments.ts isn't in this feature's blast radius. Does NO math (amounts pre-snapshotted by mig 229's RPC). `metadata.type='event_vendor_fee'` is the webhook routing signal |
| `lib/events/event-name.ts` | `maskedEventName` — per-viewer mask for an event market's name, which IS the organizer's company (`${company_name} ${suffix}` at approval). Applied by `api/vendor/events/[marketId]` and `api/vendor/markets` for vendors who have NOT accepted (T-75); public events never masked; attendee surfaces always see the real name. |
| `components/events/OrganizerProgress.tsx` | Stage strip + "what happens next" block, both DERIVED from `catering_requests.status` (no second source of truth). `part="strip"` renders under Event details, `part="next"` at the page bottom. Rule it encodes: at every stage say what the organizer FINISHED and what is underway — never render a stage as "nothing to do" (owner, 2026-08-12). A new status must be added to `STAGE_FOR_STATUS` or progress silently under-reports. |
| `components/events/EventBroadcastCard.tsx` · `EventAgreementPickerCard.tsx` · `EventRatingsCard.tsx` | Organizer broadcast composer, opt-in picker, approved-ratings display |
| `components/events/EventFeedbackForm.tsx` | Attendee post-event rating/survey (~465 lines) |
| `app/[vertical]/event-manager/page.tsx` | **Event picker** (new 2026-08-07) — lists events you organize; redirects out if none, straight in if exactly one. Lists ALL of them, approved or not |
| `app/[vertical]/event-manager/[id]/dashboard/page.tsx` | **Event manager dashboard** (new 2026-08-07, re-keyed token→id 2026-08-08) — the home organizers never had. Event summary, access code, attendee-shop link, the Stage-2 editor, cancel, and the broadcast / agreement-picker / ratings controls. Warns when a missing street address is blocking approval |
| `app/[vertical]/events/page.tsx` | Public marketing landing + request form |
| `app/[vertical]/events/[token]/page.tsx` | Public event landing (`force-dynamic`) |
| `app/[vertical]/events/[token]/select/page.tsx` | Organizer vendor-selection page (token-only, no auth — stated at `:16`) |
| `app/[vertical]/events/[token]/shop/page.tsx` + `ShopClient.tsx` | Attendee shop: server wrapper passing `initialData`, plus the cart/access-code/wave client |
| `app/[vertical]/events/[token]/my-order/page.tsx` | Attendee pick ticket + QR |
| `app/[vertical]/vendor/events/[marketId]/page.tsx` · `prep/page.tsx` | Vendor event detail and prep sheet |

## Known caveat

The SQL bodies of `create_company_paid_order`, `reserve_event_wave`, `cancel_wave_reservation`, `free_wave_on_order_cancel` and `recalculate_wave_capacity` have not been read as part of this mapping — claims above are anchored at their call sites. The fee math inside `create_company_paid_order` is **UNVERIFIED**.
