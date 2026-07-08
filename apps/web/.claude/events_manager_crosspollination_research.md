# Events: gap review + manager/park cross-pollination — research (2026-07-07)

**Goal:** (1) gap audit of the event system as it ACTUALLY exists (quality), (2) which market/park-manager capabilities to recycle into events + event managers, prioritized by impact/risk/ease (partner outreach).
**Method:** subagent mapped the event system from code; **key claims re-verified by Claude** (labeled ✅VERIFIED). Existing `.claude` event docs treated as stale/leads only.
**Actors (user): BOTH** the event organizer/host (`catering_requests`) AND a market manager running an event-type market — **but the latter persona doesn't exist in code yet** (see gap G7).

---
## Phase 1 — CURRENT event system (code-mapped; key items verified)

**Entity:** `catering_requests` (mig 070) — an organizer requests a catered/vendor event. Spawns a `market_type='event'` market (`event-actions.ts:119-140`, ✅VERIFIED: `vendor_profile_id:null`, `is_private:true`, NO `manager_user_id`). Related tables: `event_vendor_listings` (menus), `event_waves`/`event_wave_reservations` (time-slot capacity), `event_company_payments` (organizer payments, admin-recorded), `event_ratings` (attendee rating). Reuses `market_vendors` (+`response_status` invited/accepted/declined + per-event caps) and the standard `orders`/`order_items` money path.

**Lifecycle (✅VERIFIED correction):** `new → reviewing → approved → ready → active → review → completed` (+ `declined`/`cancelled`).
- `new→approved`: admin PATCH (needs address) OR self-service auto-approve at submit; creates the event market + `event_token` (+`access_code` for company/hybrid).
- `approved→ready`: vendor acceptance crossing threshold (emails organizer a `/select` link) OR admin.
- **`ready→active`: CRON** (expire-orders Phase 14, tz-aware). **`active→review`: CRON** (Phase 15, `event_end_date < today`, tz-aware). ✅VERIFIED both.
- **`review→completed`: ADMIN-ONLY, no cron** — fires settlement + feedback. **This is the real lifecycle gap (G1).**

**Actors:** organizer = `catering_requests.organizer_user_id` (nullable; may be account-less — the `event_token` is their credential; token routes accept organizer_user_id OR email match). Admin runs the lifecycle. **No manager persona for event markets.**

**Money:** 3 models on `payment_model`: **attendee_paid** (default; standard cart→Stripe checkout, reuses critical path), **company_paid** (attendee ordering bypasses Stripe via `create_company_paid_order`; **organizer Stripe collection UNBUILT — admin records `event_company_payments` manually**), **hybrid** (schema + branches exist but UI hidden). Vendor payouts ride the standard `order_items` payout flow; no event-specific payout engine. Settlement report recomputes fees from `pricing.ts`.

## Phase 2 — GAPS (quality focus)

| # | Gap | Evidence | Severity |
|---|-----|----------|----------|
| G1 | **`review→completed` has no cron** — a `review` event with no admin never settles/fires feedback; sits indefinitely | Phases 14/15 exist, no Phase for review→completed (✅) | **High** |
| G2 | **Organizer Stripe payment unbuilt** — company_paid trusts out-of-band pay; admin records manually | `event_company_payments` manual; `stripe_payment_intent_id` unused | **High** (revenue) |
| G3 | **`is_recurring`/`recurring_frequency` is a dead intake flag** — captured at intake, no consumer (UNVERIFIED any reader) → false expectation | `event-requests/route.ts:262-264` in; no generator found | Med |
| G4 | **`hybrid` payment model dark-shipped** — schema/branches built, UI hidden | `EventRequestForm.tsx` option hidden | Med |
| G5 | **Self-service w/o address dead-ends in `new`** — no admin nudge to finish | `event-requests/route.ts:291-294` | Med |
| G6 | **`reviewing` status has no writer** — manual-only label | no auto-setter found | Low |
| G7 | **No event-type-market manager persona** — event markets have no `manager_user_id`; "manager runs events at their venue" isn't wired | `event-actions.ts:123` | **Foundational** (blocks half the user's vision) |

## Phase 3 — CROSS-FUNCTIONALITY MATRIX (manager/park → events)
Scored: **Impact** (outreach value) · **Risk** (money/complexity) · **Ease** (effort). Presence = state in events today.

| Capability | In events today | Impact | Risk | Ease | Tier |
|---|---|---|---|---|---|
| **Broadcasts** (organizer→vendors/attendees) | ABSENT (only vendor→organizer 1:1 relay) | **High** | Low | Med | **1** |
| **Agreement/opt-in statements** at event join | ABSENT (ad-hoc terms checkbox only) | Med-High | Low | Med | **1** |
| **Post-event surveys** | ABSENT (cron traditional-only; `event_ratings` covers attendee side) | Med | Low | Easy-Med | **1** |
| **Vendor vetting + docs review** (per-event) | PARTIAL (global `event_approved` + readiness form; no per-event) | Med-High | Med | Med-Hard | **2** |
| **Attendance / geo check-ins** at the event | ABSENT (fulfillment ≠ check-in) | Med | Low-Med | Med | **2** |
| **Organizer onboarding checklist / dashboard polish** | PARTIAL (My Events exists; no checklist) | Med | Low | Med | **2** |
| **Vendor-paid event booking + manager earnings** | ABSENT (events don't charge vendors) | **High** | **High** | Hard | **3** (model change) |
| **Recurring events** (consume `is_recurring`) | ABSENT (dead flag) | Med | Med | Med-Hard | **3** |
| **Event-market MANAGER persona** (G7) | ABSENT | High (for the "manager runs events" half) | Med | Med-Hard | **3** (foundational) |
| Cancel-a-date + credits | N/A (events are single-date; whole-event cancel exists) | Low | — | — | skip |
| Vendor roster (`market_vendors`) | PRESENT (fully reused) | — | — | — | done |

**Reusability note:** events already run on a `markets` row + `market_vendors`, so most ports attach cleanly to the event's market. The opt-in catalog, broadcast, check-in, and vetting systems are all vertical/market-agnostic → low structural risk to extend. The blockers are (a) the missing manager persona for event markets (G7), and (b) anything touching the money path (Tier 3).

## Recommended sequencing
- **Tier 1 (quick, high-outreach, low-risk — do first):** organizer **broadcasts**, **agreement statements** at event join, **surveys** for events. All attach to the event market, reuse proven systems.
- **Fix-anyway quality gaps (independent of outreach):** G1 (review→completed cron), G3 (dead is_recurring — either build or stop promising it at intake), G5 (self-service dead-end). G2 (organizer Stripe) is a bigger revenue project.
- **Tier 2:** per-event vetting/docs (reuse this session's `park_vendor_vetting` + info-sharing pattern), event check-ins, organizer onboarding checklist.
- **Tier 3 (strategic, decide first):** the **event-market manager persona** (G7 — needed for "a market manager also runs events at their venue"), vendor-paid event booking (revenue model change), recurring events.

## Open questions for the user
1. For the "market manager runs events" half — do you want event markets to gain a real `manager_user_id`/manager surface (G7), or keep events admin+organizer only? This gates the whole manager-side port.
2. Is vendor-paid event participation (Tier 3) a direction you want (new revenue lever), or are events staying attendee/organizer-paid only?
3. Should `is_recurring` be built (recurring event series) or removed from intake to stop the false promise?
