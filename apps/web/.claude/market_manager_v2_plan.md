# Market Manager v2 — Comprehensive Build Plan

**Status:** Drafted Session 80 (2026-05-08). Supersedes `market_manager_v1_plan.md` — that v1 plan was correct but narrow (manager dashboard only). This v2 expands scope to include the **weekly booth rental wedge**, market manager onboarding, dual personas (manager + event organizer), opt-in vendor agreement system, and surveys/share features.

**Vertical:** `farmers_market` only for v1. FT park operator deferred.

---

## Session 81 Consolidated Roadmap (2026-05-09)

> **This section is the current source of truth for build sequencing.** The original A–L sections below remain as detailed reference but Phase tracking, status, and next-up sequencing should be read from here.

### Status legend
- ✅ Built and on staging
- 📋 Documented in plan, not yet built
- 🆕 New requirement raised in Session 81 transcript
- ⚠ Open decision

### Topical breakdown with current status

#### 1. The wedge: weekly booth rentals
- 📋 Pivot from season-long memberships to weekly rentals
- 🆕 Why this is the wedge (rationale for landing page + sales conversations): many markets can't fill season-long slots due to climate, crop variety, vendor mix, manager overhead. Weekly drop-ins are real revenue but messy to track manually.
- 📋 Revenue model: 6.5% × 2 sides on booth rental + 6.5% × 2 sides on product sales at the market

#### 2. Personas, auth, dashboards
- 📋 Three roles, two email scopes (vendor isolated; manager + organizer can share email)
- ✅ Dual-key auth helper (`isMarketManager`) and `getMarketsManagedBy`
- ✅ "My Markets" card on buyer dashboard (FM-only)
- ✅ Email→user_id backfill on first authenticated load
- ✅ Vendor=organizer block already narrowed to vendor-only (verified Session 81 — no code change needed at `src/app/api/event-requests/route.ts:169-176`)
- 🆕 Dual-role dashboard UX (manager + organizer same email): **DECIDED — each card appears only after the role is set up**
- 🆕 Manager + organizer email overlap rationale: managers may want to run offseason events, reusing booth/payment infra
- 📋 Stripe Connect "market" account for managers (separate from "vendor" account)

#### 3. Market manager onboarding wizard
- 📋 7 steps in original v2 plan; consolidated into 5 wizard steps for v1: confirm market identity, booth inventory, off-platform placeholders, opt-in selection, confirm
- 📋 Stripe Connect onboarding step deferred to Phase C (no payment in Phase A/B)
- 🆕 No separate "completion" column on `markets` — wizard reads inventory/selections tables to compute progress (Option A; Session 81 lock-in)
- ✅ Step 2 (booth inventory) shipped piecemeal as a dashboard card; will be wrapped in wizard step
- 📋 Steps 1, 3, 4, 5 unbuilt (in progress, Phase A)

#### 4. Booth inventory + assignment
- ✅ `market_booth_inventory` table + CRUD (mig 134)
- ✅ Per-vendor `booth_number` assignment endpoint
- ✅ **Off-platform booth placeholders schema (mig 135 — Session 81)** — table written, applied to Dev + Staging
  - Schema design: UUID FK to `market_booth_inventory(id)` ON DELETE SET NULL with same-market integrity trigger. Single-column FK matches codebase pattern; preserves placeholder if size tier removed.
- 📋 Off-platform placeholders API + UI (Phase A2)
- 📋 Booth size dropdown on vendor assignment (current_task.md backlog; Phase B follow-up)
- 🆕 Permission boundary rules (Session 81 lock-in):
  - Manager cannot disassociate vendor *from a market* if vendor associated themselves first → **already enforced by API surface**: manager API has no DELETE endpoint for `market_vendors` rows. Will add a flow-integrity test in A5 to lock this in mechanically.
  - Manager *can* associate/disassociate a vendor with a *booth number* (post-onboarding) → already supported via PATCH `/api/market-manager/[marketId]/vendor-booth`
- ⚠ Booth-number auto-assignment: **Path B (manual) locked for v1**; Path A (auto) deferred to v2.future

#### 5. Vendor weekly booking flow (Phase B)
- 📋 Modeled on event organizer flow
- 🆕 Booking unit = **week**, not market-day
- 📋 Flow: pick market → pick week → pick size → see price → see opt-in agreement → pay via Stripe → confirmation + electronic signature
- 📋 Pricing: weekly-only for v1 (locked); multi-week / monthly bundles deferred
- 📋 Booth-rental Stripe Connect with 6.5% × 2 markup (Phase C)
- 📋 Co-branded onboarding URL `?market=…&ref=manager` (Phase B)

#### 6. Co-branded vendor onboarding (Phase B)
- 📋 Signup page co-branded with farmersmarketing.app + market name
- 📋 Manager-selected opt-in statements rendered as required checkbox list
- ✅ Vendor signup at `/[vertical]/signup` already accepts `?ref=&email=` query params; co-brand extension via `?market=&ref=manager` is a small change

#### 7. Opt-in vendor agreement system
- ✅ **Catalog + selections schema (mig 136 — Session 81)** — tables written + 15 statements seeded, applied to Dev + Staging
- ✅ Types + helpers (`src/lib/markets/optin-types.ts`)
- 📋 Manager onboarding step UI (Phase A3)
- 📋 Vendor signup checklist UI (Phase B)
- 📋 Acceptance snapshot table (Phase B — `vendor_market_agreement_acceptances`)
- 🆕 Marketing story: "finished market agreement = electronic signature + time/date stamp + payment association" (lands on landing page in Phase D)

#### 8. Event organizer ↔ market manager bridge (offseason events)
- 📋 Reuses booth registration + payment + agreement infrastructure
- 📋 Strategic value: manager has existing vendor relationships → vendor acquisition leverage
- 🆕 Dual-role dashboard UX decided: cards appear only after role is set up (covered in #2)

#### 9. Same-day / festival transactions
- ⚠ **DEFERRED — separate build** (Session 81 lock-in)
- 🆕 Constraint when revisited: do not modify existing prepayment cart/checkout
- 🆕 Scope idea: limited "event-ready listings" subset, not full vendor catalogs
- 🆕 Needs technical research before scoping

#### 10. Surveys + data collection (Phase E)
- 📋 Post-market push to vendors who attended + buyers who picked up
- 📋 Star (1–5) + free-text comment
- 📋 Delivery: in-app + email (Session 81 lock-in)
- 🆕 Timing: same-day evening of market purchase, OR next morning if event ran into the evening (Session 81 lock-in — cron needs market-close-time-aware logic, not a flat 24-hour delay)
- 📋 `market_surveys` table proposed

#### 11. Share button + templates (Phase E)
- 📋 On `/markets/[id]` profile page
- 📋 Two templates: market-day (with vendor list) + non-market-day (generic)
- 📋 Web Share API + socials fallbacks

#### 12. Vetting story (marketing surface)
- 📋 Three-gate vetting + opt-in agreement = Gate 4
- ✅ Public landing page exists (`/market-manager-program`)
- 🆕 Refinement work after backend planning (Phase D)

#### 13. Manager dashboard surface inventory
| Surface | Status |
|---|---|
| Vendor list w/ booth #, status | ✅ basic |
| Booth inventory CRUD | ✅ |
| Off-platform booth placeholders | 📋 Phase A2 |
| Aggregate transaction count (7d/30d/season) | 📋 Phase D |
| Invite-a-vendor prefilled link | 📋 Phase B |
| Read-only schedule view | 📋 Phase D |
| Support card (KB + email) | 📋 Phase D |
| Weekly bookings list | 📋 Phase D |
| Booth occupancy view (full grid) | 📋 Phase D |
| Survey results card | 📋 Phase E |
| Share-button trigger | 📋 Phase E |

#### 14. Admin polish (already shipped Session 80)
- ✅ Fast-track vendor onboarding override (`b7f467e8`)
- ✅ Admin analytics dashboard rewrite (`e42db025`)
- ✅ Admin mobile grid 2-col (`9aaa7de5`)

### Resolved decisions (Session 81)

| Decision | Value |
|---|---|
| Booth auto-assign vs manual | **Path B (manual) for v1**; Path A deferred |
| Vendor=organizer block scope | **Vendor role only**; manager+organizer email overlap allowed |
| Opt-in statement count | **15 statements (seeded by mig 136)**; managers request additions via support |
| Survey delivery | **In-app + email** |
| Survey timing | **Evening of market purchase, or next morning if late event** |
| Manager-program public page timing | **Phase 1 — earlier is better** (already shipped at v0) |
| Festival/same-day transactions | **Defer** to a separate future build |
| Onboarding wizard "completion" | **Option A** — no DB column; computed from inventory/selections rows |
| Dual-role dashboard UX | **Each card appears only after the role is set up** |
| Phase 0 vendor=organizer narrowing | **No-op** — code already narrowed at `src/app/api/event-requests/route.ts:169-176` |

### Phased build sequencing

#### Phase 0 — Cleanup from Session 80
- ✅ Verified Session 81: vendor=organizer block already narrowed at `src/app/api/event-requests/route.ts:169-176`. No code change required.

#### Phase A — Manager onboarding wizard + structural pieces
- **A1 (current — files written, mig applied to Dev+Staging):**
  - ✅ Migration 135: `market_booth_placeholders` (off-platform occupancy)
  - ✅ Migration 136: `market_optin_statement_catalog` + `market_optin_selections` (+ 15 seed statements)
  - ✅ `src/lib/markets/placeholder-types.ts` (types + validator)
  - ✅ `src/lib/markets/optin-types.ts` (types + categories + render/validate/group helpers)
  - ✅ `src/lib/markets/onboarding-progress.ts` (server-side progress reader)
- **A2:** Booth-placeholders API + dashboard inline card (CRUD UI similar to existing booth inventory)
- **A3:** Opt-in API + dashboard inline card (manager picks statements + fills placeholders)
- **A4:** Wizard wrapper page + step components + dashboard "Setup checklist" card linking into the wizard
- **A5:** Permission boundary flow-integrity test + doc updates

#### Phase B — Co-branded vendor onboarding + booking flow (no payment)
- Migration: weekly_booth_rentals + vendor_market_agreement_acceptances tables
- Co-branded vendor signup at `?market=&ref=manager`
- Vendor weekly booking flow (week → size → price → opt-in checkboxes → "complete booking" placeholder)
- Manager dashboard "needs booth #" task list
- Manager assigns booth # → vendor notified
- Invite-a-vendor link (manager dashboard → prefilled URL)

#### Phase C — Stripe Connect + payment (critical-path territory)
- Manager "market" Connect account onboarding
- Booth-rental Stripe Checkout with 6.5% × 2 markup
- Payout flow + idempotency
- Electronic-signature record snapshot at payment confirmation

#### Phase D — Manager dashboard fill-out
- Aggregate transactions card (7d / 30d / season)
- Schedule view (read-only `market_schedules`)
- Support card (KB + email)
- Weekly bookings list (paid status, booth #, vendor)
- Booth occupancy view (full grid: occupied / available / off-platform)

#### Phase E — Surveys + share
- Migration: `market_surveys` table
- Post-market survey cron with evening-vs-next-morning logic
- Delivery: in-app + email
- Aggregate ratings + individual responses on manager dashboard
- Share button + templates on market profile

---

## The pivot in one sentence

The wedge into the existing farmers-market world is **weekly booth rentals**, not season-long memberships — those weekly vendors are the easiest entry point into a market manager's existing operation, and capturing them through the platform gives us booth-rental revenue + transactional revenue + manager engagement.

---

## How this builds on v1

| v1 plan element | Status in v2 |
|---|---|
| Manager dashboard (vendor list / booths / aggregate transactions / invite link / schedule view / support card) | **Kept**, extended with weekly bookings and surveys |
| Manager-to-market 1:1 in v1 | **Kept** |
| Auth: same human, different email — manager + event organizer were both separate from vendor | **REVISED:** manager + event organizer can SHARE an email (same person, two related roles); vendor must remain separate |
| Free for managers in v1, no pricing | **REVISED:** weekly booth rentals collect 6.5% markup on both sides — manager gets a Stripe Connect payout; manager is the "vendor" in the booth-rental transaction, weekly vendor is the "buyer" |
| Vendor financial data invisible to manager | **Kept** — non-negotiable |
| Aggregate transactions order-count-level only | **Kept** |
| 1:1 booth assignment by self-set or manager-set | **REVISED:** manager onboarding now captures total booth count + size mix, so system can auto-assign; off-platform-vendor toggle for managers tracking spots that aren't on platform yet |

---

## Big-picture architecture

```
                          ┌──────────────────────┐
                          │  MarketManager        │
                          │  (Stripe Connect:     │
                          │   "market" account)   │
                          └─────────▲────────────┘
                                    │ 6.5% markup (vendor side of booth rental)
                                    │
   Vendor (weekly) ──[booth rental fee]──┐
                                         │ 6.5% markup (buyer side of booth rental)
                                         ▼
                                   ┌─────────────┐
                                   │  Platform   │
                                   └─────────────┘
                                         ▲
                                         │ 6.5% markup (existing buyer side)
                                         │
   Buyer ──[product purchase]──┐         │
                               │         │
                          ┌────▼─────────┴───┐
                          │  Vendor          │
                          │  (Stripe Connect:│
                          │   "vendor" acct) │
                          └──────────────────┘
                          Note: same human can have BOTH a "market"
                          connect account (as manager) AND a "vendor"
                          connect account (as vendor) — must be
                          deliberately separate in UI
```

---

## Comprehensive feature outline

### A. Personas + auth

- **Three roles, two email scopes**
  - **Vendor** — must use a separate email (financial isolation; existing rule preserved)
  - **Market Manager** + **Event Organizer** — CAN share an email (same person, related roles)
- **Why the change:** the original isolation rule (Session 79 wrap, Item 2 of the lost work) was protective but blocked the very integration we now want. Per your answer #2, the financial flows for manager+organizer are similar enough that sharing an email is fine; only vendor needs to stay walled off.
- **Code implication:** the conflict check at `event-requests/route.ts:167-183` should NOT be removed entirely. It should be **narrowed** to: "block only if the email belongs to an approved VENDOR." Manager and organizer roles should not trigger the conflict.
- **UX implication:** if a user has both the manager AND organizer roles attached to the same email, they should see two cards on the buyer dashboard:
  - "My Markets" → manager dashboard
  - "My Events" → organizer dashboard
- **Stripe Connect**
  - Manager has a "market" Stripe Connect account, used for booth-rental payouts
  - Same person who is also a vendor has a SEPARATE "vendor" Stripe Connect account for product sales
  - Two visually distinct UI sections (Manager Settings vs Vendor Settings)

### B. Market manager onboarding

Captures the data needed for booth assignment + opt-in vendor agreement.

- **Step 1 — Market identity** (mostly already covered by existing market admin)
  - Market name, address, schedule, vertical (FM)
- **Step 2 — Booth inventory**
  - Total booth count (e.g., 50)
  - Size breakdown — manager enters `{ size_label, dimensions, count, weekly_price_cents }` rows
    - Example: `{ "10x10", "10ft × 10ft", 30, $25.00 }`, `{ "10x20", "10ft × 20ft", 20, $40.00 }`
  - All-same-size shortcut (skip the breakdown if uniform)
- **Step 3 — Existing on-platform vendor associations**
  - Manager picks vendors already on platform from a list
  - For each, assigns booth number (manager has off-platform knowledge)
- **Step 4 — Off-platform vendor placeholders**
  - Manager indicates booth N is taken by an off-platform vendor (just a checkbox + booth number, no vendor identity captured)
  - This lets the system know which booths are open vs. taken, even when only some vendors are on platform
- **Step 5 — Opt-in vendor agreement statements**
  - Manager picks from a curated menu of opt-in statements (see Section H)
  - Selected statements become the agreement that vendors must accept on co-branded onboarding
- **Step 6 — Stripe Connect** (manager → market account)
  - Standard Stripe Connect onboarding for the market entity
- **Step 7 — Confirm** + activate market manager status

### C. Manager dashboard (extends v1)

The v1 dashboard had: vendor list, aggregate transactions, invite link, schedule view, support card.
v2 adds:

- **Weekly booth bookings tab** — list of upcoming/recent weekly bookings, paid status, booth number, vendor name
- **Booth occupancy view** — visual or list showing every booth, occupied (by whom) / available / off-platform
- **Survey results card** — recent post-market vendor + buyer feedback (star + free-text), aggregate ratings
- **Share button** — share market profile or "vendors-this-week" template to manager's social channels

### D. Vendor weekly booking flow

The user-facing booking experience for a vendor selecting a weekly slot at a market.

- **Entry points:**
  - From manager-co-branded vendor signup link (referral)
  - From vendor dashboard "Book a market" button (existing vendor exploring new markets)
  - From a market profile page CTA
- **Flow (modeled on event organizer flow):**
  1. Vendor selects market
  2. Vendor selects week (calendar picker; checks availability against booth inventory)
  3. Vendor selects booth size (dropdown; price shown)
  4. System auto-assigns booth number (if possible) OR notifies manager to assign manually (if auto-assignment impractical for v1)
  5. Vendor reviews + accepts opt-in agreement (the statements manager pre-selected)
  6. Vendor pays via Stripe — markup applied per pricing model
  7. Confirmation, electronic signature recorded
- **Pricing scope for v1:** **weekly only** (no multi-week bundles). Per your answer "I'm inclined to think we start with just a weekly purchase product and then we grow from there."

### E. Auto-assigning booth numbers (the key technical decision)

Per your answer #3, this is high-value but possibly complex. Two paths:

- **Path A — Auto-assign in v1**
  - When manager onboards, capture total booths + per-size counts + initial assignments (manager's off-platform knowledge)
  - When vendor books a size-X booth, system picks the next available size-X booth number
  - Pro: zero manual work for manager on each booking
  - Con: complex to implement well; edge cases (manager wants to block a booth, vendor cancels and booth needs to be released, etc.)
- **Path B — Manager assigns manually after booking**
  - System tracks: total booths, size mix, occupied count by size, available count
  - When vendor books size-X, system records "size-X booth needed for vendor V on date D" but DOES NOT assign a number
  - Manager gets a notification + dashboard task: "Assign booth # for vendor V"
  - Pro: simpler to ship; manager retains control
  - Con: manager has a recurring small task

**Recommendation (in line with your hedge):** **Path B for v1, Path A for v2.** Ship the manual-assignment flow first, prove the workflow value, then automate once edge cases are mapped from real usage.

### F. Co-branded vendor onboarding

When a vendor lands via a manager's referral link, the signup page is co-branded.

- URL pattern: `/farmers_market/vendor-signup?market=<marketId>&ref=manager` (matches v1 plan; existing signup page reads `market` param)
- Header / hero on signup: "Onboarding for [Market Name] via Farmers Marketing"
- Logo: market logo + Farmers Marketing logo, side-by-side
- Pre-selected market in signup form
- Opt-in agreement section in onboarding flow (the statements manager picked)
- After signup, vendor lands on weekly booking flow (Section D) for that market

### G. Pricing + payment flow

Per your answer #1: **6.5% markup on both sides, consistent with existing model.**

- **Booth rental transaction:**
  - Vendor pays: `booth_price_cents × 1.065` (vendor side markup)
  - Manager receives: `booth_price_cents × 0.935` (after 6.5% manager-side markup)
  - Platform keeps: `booth_price_cents × 0.13` (sum of both sides' markup)
- **Existing product transactions:** unchanged — vendor still gets paid through their "vendor" Stripe Connect account
- **Stripe metadata:** booth-rental sessions tagged distinctly from product sessions so reconciliation is clean

### H. Customizable opt-in vendor agreement

Per your answer #5: draft a starter set of statements, synthesize from common farmers-market agreements.

- **System** stores a curated list of opt-in statements (~20-30 starter, expandable)
- **Manager onboarding** lets manager pick which statements apply to their market
- **Vendor onboarding** (via co-branded link) shows the manager-selected statements; vendor must check each
- **System produces** an "electronic agreement" PDF or record on completion: vendor name, market name, accepted statements, timestamp, payment confirmation reference
- **Categories of statements (starter draft to refine):**
  - Product/quality (e.g., "I will only sell items I produce or hand-craft myself")
  - Conduct (e.g., "I will be set up by [open time] and remain until [close time]")
  - Insurance/liability (e.g., "I have current liability insurance and will provide proof on request")
  - Fees/payment (e.g., "I understand booth fees are non-refundable except in case of market cancellation")
  - Compliance (e.g., "I will follow all local health department requirements for my product type")

### I. Same-day festival transactions

Per your answer #7: **DEFERRED — separate build.**

This is meaningful work and deserves its own plan once the v2 wedge is proven. Add to backlog with a note that it will be re-scoped after market manager v2 ships.

### J. Surveys + data collection

Per your answer #6: **star rating + free-text comment to start.**

- After a market day, push a survey notification to:
  - Vendors who attended that market
  - Buyers who picked up an order at that market
- Both surveys: 1-5 stars + free-text comment
- Manager dashboard shows aggregate ratings and individual responses (vendor responses; anonymized buyer responses)
- v1 scope: in-app notifications + email; SMS deferred
- Schema: `market_surveys` table with vendor_profile_id (nullable for buyer responses), market_id, market_date, star, comment, created_at

### K. Share button + templates

- Share button on `/farmers_market/markets/[id]` profile page
- Two share templates:
  1. **Generic profile share** (always available) — "Visit [Market Name] — local vendors, [day-of-week] [open-close]"
  2. **Market day share** (auto-generated on market days) — "[Market Name] is open today! Featuring [list of attending vendors]"
- Mechanism: Web Share API (existing `ShareButton` component already supports this) with platform-specific fallbacks for socials

### L. Vetting story (for marketing)

How our process is better than non-vetted markets:

- Business verification (Gate 1)
- Category-specific document verification (Gate 2 — e.g., MFP licenses for FT, certifications for FM)
- COI (Gate 3)
- Manager-defined opt-in agreement (now adds Gate 4 customization)

This is the pitch material for the manager-program landing page.

---

## Admin bugs surfaced (separate from market manager but mentioned in same message)

| Bug | Status |
|---|---|
| Admin mobile grid icons stacking 1-col instead of 2-col | **DONE** (commit `9aaa7de5` Session 80) |
| Admin lost ability to fast-track vendor onboarding | Needs the fast-track endpoint + button (Items 3+4 from Session 79 lost work) |
| "Politics in the add dashboard not working — no traction or dollar volume" — admin analytics dashboard showing blank | **NEW** — needs investigation; not in Session 79 lost work |

---

## Phasing (proposed)

### Phase 0 — Already-started fixes (Session 80)
- ✅ Admin mobile grid CSS (done, `9aaa7de5`)
- Fast-track admin override endpoint + button (Items 3+4)
- Narrow vendor=organizer block to vendor-only (the conflict check at `event-requests/route.ts:167-183` keeps the vendor protection but allows manager+organizer email overlap — Item 2 reframed)
- Investigate admin analytics dashboard "no traction or dollar volume"

### Phase 1 — Market manager core (per v1 plan)
- Schema migration (markets + market_vendors columns)
- Manager auth helper
- Buyer dashboard MarketManagerCard
- Manager dashboard skeleton
- Admin assignment UI

### Phase 2 — Booth inventory + onboarding
- Schema additions: booth sizes, prices, off-platform placeholders
- Market manager onboarding flow
- Booth occupancy view in dashboard

### Phase 3 — Weekly booking flow (the wedge)
- Vendor booking page (modeled on event flow)
- Booth assignment logic (Path B — manual-assignment in v1)
- Booth-rental Stripe Connect flow with 6.5% markup
- Co-branded vendor onboarding (referral link integration)
- Opt-in agreement system (curated statement list + manager selection + vendor acceptance + electronic record)

### Phase 4 — Manager engagement features
- Surveys (vendor + buyer, star + free-text)
- Share button + templates on market profile
- Survey results in manager dashboard

### Phase 5 — Public marketing
- Manager-program landing page (vetting story + CTA)
- Manager-to-vendor invite link prefilled URL

### Phase 6+ — Deferred
- Same-day festival transactions (separate build)
- Multi-week booth bundles
- Booth auto-assignment (Path A)
- Multi-market managers (N:M)
- FT park operator equivalent

---

## Open questions before kickoff

1. **Booth assignment path** — confirm Path B (manual assignment by manager) for v1?
2. **Vendor=organizer block scope** — confirm narrowed to "block only if email is an approved VENDOR" (manager+organizer overlap is allowed)?
3. **Opt-in statement breadth** — should the starter set be 10, 20, or 30 statements? More = more menu choices, more curation upfront. Recommend 18-22.
4. **Admin analytics "no traction" bug** — investigate now or backlog?
5. **Survey delivery** — in-app + email for v1, or just in-app to start?
6. **Survey timing** — push immediately after market close, or next-day? Recommend next-morning so vendors/buyers have processed the day.
7. **Manager-program public page** — Phase 5 timing or Phase 1? Recommend Phase 1 because it's the public-facing pitch we'll need to demo to friendly market managers.

---

## Validation plan (carryover from v1)

User (tsjr00) gathers feedback from real market managers (Amarillo or Canyon) before kickoff. Walk through Phases 1-3 surfaces and confirm priorities. If feedback shifts priorities, revisit this plan and update before building.

**Pitch framing for those conversations:** "We make it free for you to run your market through our platform — vendor vetting, booth tracking, post-market surveys, share tools — and we take a small cut of the booth rental fees and the transactions that happen at your market. Vendors get a smoother signup, you get less paperwork, and we keep the platform running."

---

## When this gets picked up

Read in order:
1. This file
2. `apps/web/.claude/market_manager_v1_plan.md` (still current for the manager dashboard skeleton — this v2 doc layers booth rentals + onboarding + opt-in statements + dual personas on top)
3. The event organizer code as reference: `src/app/[vertical]/events/...`, `src/app/api/events/[token]/...`, the buyer dashboard "My Events" card

The event organizer flow is still the closest analog. Key differences in v2:
- Manager creates a recurring market (not a one-time event); booking is per-week
- Booth size selection + price tier (events don't have this)
- Opt-in agreement system (events don't customize agreements)
