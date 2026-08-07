# 14 — Events (private / catering)

<!-- map-stamp: domain=events; verified=2026-08-07; commit=45e98384 -->
<!-- map-claims
src/app/api/events/**
src/app/api/event-requests/**
src/app/api/event-approved-vendors/**
src/lib/events/**
src/components/events/**
src/app/[vertical]/events/**
src/app/[vertical]/vendor/events/**
src/app/[vertical]/event-manager/**
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
| `api/events/[token]/select/route.ts` | GET accepted vendors; POST final picks → status `ready`, others flagged backup, wave capacity recalculated, confirmation email + QR marketing kit. Status-guarded update 409s on double-submit (`:278-287`) | No |
| `api/events/[token]/refresh-matches/route.ts` | Re-runs `autoMatchAndInvite` after matching-affecting edits | No |
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
| **Event manager** — `event-manager/[token]/dashboard` | *I am RUNNING this event* | `catering_requests.organizer_user_id` |
| **Vendor's event** — "My Vendor Events" tile, vendor dashboard row 2 | *I am booked to SELL at this event* | `market_vendors` for the event's market |
| **Attendee** — `events/[token]/shop` etc. | *I am BUYING at this event* | token + optional access code |

**An event organizer is NOT a market manager.** Different table, different identity column — organizers are `catering_requests.organizer_user_id`, managers are `markets.manager_user_id`. An approved event does get a linked `market_id`, which makes them look related. They are not.

⚠ **The organizer's old "My Events" band is STILL on the shopper dashboard** (`[vertical]/dashboard/page.tsx:747-981`) even though the dashboard above now exists. Deliberate: the owner asked to *"keep the way in for organizers for now (testing)"* because the nav that will route here does not land until Slice 4. **Remove the band in Slice 4, not before** — pulling it now strands organizers mid-test.

## UI

| File | Purpose |
|---|---|
| `components/events/EventRequestForm.tsx` | The vertical-aware multi-stage intake form (~845 lines) |
| `components/events/OrganizerEventDetails.tsx` | Stage-2 detail editor + refresh-matches banner (~770 lines) |
| `components/events/OrganizerEventActions.tsx` | Cancel / manage actions (triggers the refund path) |
| `components/events/EventBroadcastCard.tsx` · `EventAgreementPickerCard.tsx` · `EventRatingsCard.tsx` | Organizer broadcast composer, opt-in picker, approved-ratings display |
| `components/events/EventFeedbackForm.tsx` | Attendee post-event rating/survey (~465 lines) |
| `app/[vertical]/event-manager/page.tsx` | **Event picker** (new 2026-08-07) — lists events you organize; redirects out if none, straight in if exactly one |
| `app/[vertical]/event-manager/[token]/dashboard/page.tsx` | **Event manager dashboard** (new 2026-08-07) — the home organizers never had. Event details, access code, attendee-shop link, plus the broadcast / agreement-picker / ratings controls |
| `app/[vertical]/events/page.tsx` | Public marketing landing + request form |
| `app/[vertical]/events/[token]/page.tsx` | Public event landing (`force-dynamic`) |
| `app/[vertical]/events/[token]/select/page.tsx` | Organizer vendor-selection page (token-only, no auth — stated at `:16`) |
| `app/[vertical]/events/[token]/shop/page.tsx` + `ShopClient.tsx` | Attendee shop: server wrapper passing `initialData`, plus the cart/access-code/wave client |
| `app/[vertical]/events/[token]/my-order/page.tsx` | Attendee pick ticket + QR |
| `app/[vertical]/vendor/events/[marketId]/page.tsx` · `prep/page.tsx` | Vendor event detail and prep sheet |

## Known caveat

The SQL bodies of `create_company_paid_order`, `reserve_event_wave`, `cancel_wave_reservation`, `free_wave_on_order_cancel` and `recalculate_wave_capacity` have not been read as part of this mapping — claims above are anchored at their call sites. The fee math inside `create_company_paid_order` is **UNVERIFIED**.
