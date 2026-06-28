# Claude Context: InPersonMarketplace

**Purpose:** Help future Claude sessions understand this project quickly and avoid repeating mistakes.

**Last Updated:** 2026-06-27 (Phase E remaining build SHIPPED to prod)

## Session highlights (2026-06-27) — full-app review + Phase E end-of-life shipped to PROD

- **Phase E season-prepay is now FULLY LIVE on prod** (`8f64c89a..426deff4`; migs 164→167 applied to all 3 envs). This session built + shipped the "end-of-life" half: vendor cancel-season, manager settlement, flow-integrity tests.
- **Full-app CODE-ONLY review** (`apps/web/.claude/fullapp_review_research.md`) — 7 parallel Explore agents mapped every subsystem from source (prior audits intentionally ignored), then Claude verified each candidate by reading the code. **Result: no new significant gaps.** Many agent-flagged "criticals" were false alarms (caught by reading: Phase 3.6 cron DOES notify; partner agreement IS prompted in onboarding; events DO auto-transition via cron Phase 14/15; attendee-paid orders DO carry market_id; MB skipped-completion handled by mig 123; wave reservations have a 10-min TTL; company-paid payouts recorded via mig 112). Money path, auth/RLS, pricing single-source all verified sound.
- **What shipped (Items 1–3 + refinements):** (1) vendor "Cancel my season" button + grouped season view on `vendor/bookings` (`CancelSeasonButton.tsx`); cancel route credit switched to the **managerReceives base basis**. (2) manager **season-end settlement** panel (`MarketSeasonSettlementCard.tsx` + `seasons/[seasonId]/settlement` route) — **off-platform-only v1**; per-day-prorated owed value shown. (3) 8 season flow-integrity contract tests. + no-cash-refund vendor copy + a persistence fix (cancel confirmation no longer auto-refreshes away).
- **Key locked decisions (also in `decisions.md`):** credits only from manager-cancellation OR whole-group vendor-cancel (single-week/no-show = nothing); **managerReceives base basis**; **base parity** (platform always keeps its fee, manager funds the offset, NO platform-fronted cash = "Option A"); **make-up-dates-first**; **clean season close, no rollover**; **vendor-cancel credit expires at season end**; **in-platform settlement credit DEFERRED** to the future season make-up/extend-a-season feature (where credits get runway + somewhere to spend); **manager-issued monetary refund** → backlog; **market-box no-cancellation = BY DESIGN** (farmers spend upfront cash on crops; refunds off-platform).
- **Next (future sessions):** season **make-up / extend-a-season** feature (unblocks in-platform settlement credit + redemption-on-make-up-days); **Item 4** credit redemption at booking + expiry enforcement (MONEY PATH, design-first); manager monetary refund; B2 off-platform-settlement E2E (needs a real ended season w/ cancellations to test).

## Session highlights (2026-06-26) — Phase E season prepay

- **Phase E (booth season/partial prepay) built + payment-safe + UX-polished, all on `origin/staging`, nothing on prod.** Verified working end-to-end on staging (manager creates+opens season → vendor "Reserve a whole season" → one Stripe charge → webhook flips group+children paid). Active handoff: `apps/web/.claude/current_task.md` top block.
- **New migrations 164→165→166→167** (market_seasons, booth_booking_groups, weekly_booth_rentals.group_id, markets.schedule_confirmed_at; book_season_atomic; booth_credits ledger; confirm_season_paid + cancel_season_group) — **applied Dev+Staging only, PROD PENDING** (apply in order with the Phase E push).
- **Comprehensive review** (`comprehensive_review_research.md`) found + fixed a Phase E payment-confirmation cluster (F1/F2/F3): the daily cron could cancel paid/in-flight season bookings, a webhook child-flip failure left group/children divergent, and a missed webhook was unrecoverable. Fix = atomic confirm/cancel RPCs (mig 167) + webhook uses `confirm_season_paid` (idempotent, throws→Stripe-retry) + cron Phase 18 reconciles pending groups against Stripe; Phase 16 now excludes grouped rentals.
- **Lessons / durable gotchas:** booth booking requires the MARKET's own Stripe Connect (`markets.stripe_charges_enabled=true`) — separate from vendor Stripe and from product ordering; season + vendor booking must be on the SAME market (ids can collide across env DBs); `isMarketManager` is dual-key (manager_user_id OR manager_email) + status='active'.
- **Remaining Phase E (next session):** vendor cancel-season button (S, backend exists), manager settlement panel (M), flow-integrity tests (S–M), credit redemption (L — money path, design-first), then the coordinated prod push. Sizes + kickoff decision in `current_task.md`.

## Session 89 highlights (2026-06-03)

- **Process diagnostic + cleanup — no code/schema/migration changes.** Diagnosed why sessions slowed; findings at `apps/web/.claude/session89_diagnostic_findings.md`. Root cause: ~27k tokens of rules + memory loaded every turn, much of it duplicated across rule files, `feedback_*.md` memories, and the MEMORY index.
- **Cuts executed:** pruned `settings.local.json` allowlist 251→58 entries (removed two embedded `service_role` keys — user to rotate); slimmed `git-and-deployment.md` Rule 7 (teaching mode) 58→7 lines; archived 23 now-codified feedback memories to `memory/archive/` + rewrote `MEMORY.md` index; added a query-driven-enumeration rule to `verification-discipline.md` Rule 4 and a low-risk-additive migration fast path to `migration-workflow.md`; archived 34 historical `session*.md` docs to `apps/web/.claude/archive/`.

## Session 87-88 highlights (2026-06-01 → 2026-06-03)

- **Session 88:** Market-manager lockout **Phase 1A** shipped to staging — mig 154 (`market_manager_history` table + `markets.manager_status` column), `[marketId]/layout.tsx` guard, access-removed/suspended pages, `src/lib/markets/manager-auth.ts`. Prod intentionally held to bundle with Phase 1B. Plans authored: `manager_export_and_lockout_plan.md`, `session88_prod_readiness_audit.md`, `docs/staging_test_checklist.md`. Commits `6ae50a3d`, `68638348`.
- **Session 87:** Security hardening — mig 149 revoked anon `EXECUTE` on 18 financial/write RPCs; mig 150 moved storage writes to service client + dropped wide-open policies; mig 151 made `vendor-documents` private + added signed-URL endpoint. COI grandfather-row fix. Bookkeeping: 13 migs moved to `applied/`. Commits `fddbc75b`, `57b0c2e0`, `522de706`, `4fc2356f`, `5f4f9dd1`.
- **Sessions 85-86:** Code audit research (`apps/web/.claude/archive/session85_code_audit_research.md`); mig 151 prod rollback recorded (`8caf174c`). See `git log` for detail.

## Session 84 highlights (2026-05-22 → 2026-05-23)

- **v1 is feature-complete on staging.** 37 commits ahead of Prod, 10 migrations (138–147) pending Prod application.
- **Phase E (post-market surveys) shipped end-to-end (mig 147)** — schema + cron + vendor flow + buyer flow + manager/admin results card. Cron runs hourly, fires per-market based on close time (18:00 same-day or 08:00 next-day). Custom HTML email with market logo if uploaded. Buyer one-click email unsubscribe.
- **Booth-# uniqueness + tier capacity guards (mig 146)** — DB trigger `check_booth_number_uniqueness()` mounted on all 3 occupant tables (market_vendors, placeholders, weekly_booth_rentals); raises BOOTH_CONFLICT (P0005). App-layer pre-flight in vendor-booth + booth-placeholders routes. RPC `book_weekly_booth_atomic` updated to exclude on-platform vendor booth numbers from auto-assignment.
- **Booth-tier + onboarding acks (mig 145)** — `market_vendors.inventory_id` required; `OnboardingSkipAckCheckbox` for "I have no existing X yet" on the vendors + placeholders wizard steps; required_total grew from 2 to 4.
- **New `BoothOccupancyGrid` dashboard component** — per-tier cards titled "Tier N: \<size_label\>" with this-week occupant pills (placeholder + on-platform + paid-this-week badges). Date inline with heading.
- **Public intake page polish round 2** — multi-market manager support, founder-voice marketing copy rewrite, required street address + ZIP with auto-geocode, fuzzy duplicate detection (normalized name + city), Stripe Connect locked until admin approval.
- **Polish bundle** — refund policy notice re-added on booking form, booth label drift auto-clear with UI banner, 4 of 6 schedule-active reader gaps fixed (R29/R30 deferred — PostgREST count limitation), share button market-day awareness (3 templates including top-3-vendor list).
- **Test data cleanup** — 5 test markets + ~70 test users wiped from Dev + Staging (29 users remaining on staging = 21 keep-list + 8 demo seeds). Cleaned via iterative SQL cleanup with FK discovery via pg_catalog.
- **3 new feedback memory files:** work-cadence-role-split (authorized batch → execute all without re-asking), test-instructions-specificity (URL + card title + widget), preserve-pasted-content (quote back user pastes that arrive via system-reminder wrapper).

## Session 83 highlights (2026-05-19)

- **Phase C feature-complete on staging.** Stripe-only booth rentals; $0.15 vendor-side flat fee; atomic booking + optin RPCs (migs 142 + 143); three payment-lifecycle notifications; vendor "My Bookings" page; manager-editable schedule.
- **New rule: Schema Intent Gate** (`apps/web/.claude/rules/verification-discipline.md` Rule 5). Before any DELETE or replace-all CRUD, check for (1) soft-delete columns, (2) cascade FKs, (3) pattern-reuse-without-diff. Incident: built schedule editor with delete-and-replace despite the `active` column + cascade FK both being visible; user caught it. Rebuilt with soft-delete pattern.
- **Locked design decisions** added to `decisions.md`: Schema Intent Gate; market schedule = soft-delete via `active` flag; booth rental math = base + 6.5% + $0.15; booth rentals are Stripe-only (no offline fallback); schedule changes require manager acknowledgment dialog; booking form shows one all-inclusive price.
- **23 commits ahead of Prod** after this session. Migrations 138–143 ready to apply to Prod when user approves.

---

## What This App Is

InPersonMarketplace is a **multi-vertical marketplace platform** for in-person transactions. Each vertical is a separate branded marketplace sharing the same codebase:

| Vertical | Slug | Domain | Status |
|----------|------|--------|--------|
| **Food Trucks** | `food_trucks` | foodtruckn.app | **Primary focus** — shipping first |
| **Farmers Markets** | `farmers_market` | farmersmarketing.app | Beta testing in parallel |
| **Fireworks** | `fire_works` | fireworksstand.com | Seasonal, minimal work |

### Core Value Proposition

1. **For Vendors:** Accept pre-orders online, manage inventory, get paid digitally
2. **For Buyers:** Browse local products, pre-order for pickup, discover vendors near them
3. **For Market Organizers:** Manage vendor applications, schedules, and market operations

### Key Differentiator

This is NOT a delivery app. Everything is **in-person pickup** at markets/parks/locations.

---

## Architecture Overview

### Tech Stack
- **Frontend:** Next.js 14 (App Router), React, TypeScript
- **Backend:** Next.js API routes + Supabase
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth
- **Payments:** Stripe Connect (vendors have own Stripe accounts)
- **Storage:** Supabase Storage (images)
- **Hosting:** Vercel
- **Email:** Resend (`mail.farmersmarketing.app`)
- **SMS:** Twilio (A2P 10DLC pending carrier approval)
- **Push:** Web Push API with VAPID keys
- **PWA:** Progressive Web App with service worker, installable from browser

### Project Structure
```
inpersonmarketplace/
├── apps/web/                 # Next.js application
│   ├── src/app/             # App router pages
│   │   ├── [vertical]/      # Dynamic vertical routes
│   │   ├── admin/           # Platform admin pages
│   │   └── api/             # API routes
│   ├── src/components/      # React components
│   ├── src/lib/             # Utilities, hooks, helpers
│   │   ├── vertical/        # Terminology system + vertical configs
│   │   ├── branding/        # Per-vertical branding (colors, logos, meta)
│   │   ├── notifications/   # 4-channel notification system
│   │   ├── stripe/          # Stripe Connect helpers
│   │   ├── design-tokens.ts # CSS var-based theming per vertical
│   │   ├── pricing.ts       # Fee calculations (single source of truth)
│   │   ├── vendor-limits.ts # Tier limits per vertical
│   │   └── constants.ts     # Re-exports pricing + tier badge configs
│   └── public/              # Static assets, logos, icons
├── supabase/
│   ├── migrations/          # Database migrations (SQL)
│   ├── migrations/applied/  # Confirmed applied to Dev + Staging
│   ├── SCHEMA_SNAPSHOT.md   # Current DB schema (SOURCE OF TRUTH)
│   ├── REFRESH_SCHEMA.sql   # SQL to regenerate schema snapshot
│   └── MIGRATION_LOG.md     # Migration tracking log
├── CLAUDE.md                # Rules for Claude (READ THIS FIRST)
└── CLAUDE_CONTEXT.md        # This file
```

---

## Multi-Vertical System

### Terminology System (`term()`)

`src/lib/vertical/index.ts` exports `term(vertical, key)` which maps generic keys to vertical-specific strings:

| Key | Farmers Market | Food Trucks |
|-----|---------------|-------------|
| `market` | Market | Location |
| `markets` | Markets | Locations |
| `vendor` | Vendor | Vendor |
| `market_box` | Market Box | Chef Box |
| `market_boxes` | Market Boxes | Chef Boxes |
| `market_icon_emoji` | 🛒 | 🚚 |

**Gotcha:** `term()` falls back to `farmers_market` for unknown verticals. Do NOT use for branding fallbacks — use lookup objects instead.

### Design Token Theming

`src/lib/design-tokens.ts` provides a CSS variable-based theming system:

- **`colors`** export uses `var(--color-primary, #8BC34A)` references — FM defaults as fallback
- **`getVerticalColors(vertical)`** returns actual hex palettes (for landing pages, hex+alpha cases)
- **`getVerticalCSSVars(vertical)`** returns CSS var overrides as inline style object
- **`[vertical]/layout.tsx`** injects CSS vars on a wrapper div, covering the full viewport

**Food Truck color hierarchy (Brand Kit v2):**
- `#ff5757` (medium red) — headers, links, brand primary
- `#ff3131` (bright red) — hover states, CTAs, emphasis
- `#545454` (charcoal) — sub-headers, labels
- `#1a1a1a` (near-black) — paragraph text
- `#737373` (medium grey) — captions, hints, secondary buttons
- `#ffffff` — page backgrounds (white, not cream)
- Semantic: green (#73d8a1) success, yellow (#ffe38f) warning, red (#ff3131) danger

**Button style:** Outlined (transparent bg, colored border) — red `#ff5757` for primary, grey `#737373` for secondary. NOT filled.

### Branding

`src/lib/branding/defaults.ts` has per-vertical branding (domain, brand_name, tagline, logo_path, colors, meta). Used by landing pages and email templates. Falls back through: DB `verticals.config.branding` → `defaultBranding[verticalId]` → hardcoded.

### Vertical Configs

`src/lib/vertical/configs/` has per-vertical config files (e.g., `food-trucks.ts`, `farmers-market.ts`) defining terminology mappings, content, and feature flags.

### Cross-Vertical Isolation Patterns

- **Server pages:** `.eq('vertical_id', vertical)` on ALL queries
- **API routes:** Accept `vertical` query param (GET) or body field (POST)
- **Client pages:** Pass `vertical` from `useParams()` to API calls
- **Market box subscriptions:** Filter via `offering:market_box_offerings!inner` + `.eq('offering.vertical_id', vertical)`

---

## Key Concepts

### 1. Markets vs Listings vs Orders

- **Market:** A location where vendors sell (traditional market OR private pickup)
- **Listing:** A product a vendor sells (linked to markets via `listing_markets`)
- **Order:** A buyer's purchase (contains `order_items` linked to listings)

### 2. Market Types

| Type | FM Term | FT Term | Cutoff |
|------|---------|---------|--------|
| `traditional` | Market | Park/Location | FM: 18hr, FT: 0hr |
| `private_pickup` | Private Pickup | Private Pickup | 10hr |

**Critical:** Both types MUST have schedules in `market_schedules` table.

### 3. Order Cutoff System

Implemented via RPC function `get_available_pickup_dates()` which JOINs listings → vendor_market_schedules. For FT, requires an attendance record. Uses vendor-specific times via COALESCE.

**Single availability system (M4 consolidation complete):**
- `/api/listings/[id]/availability` — calls `get_available_pickup_dates()` RPC
- JS utility `listing-availability.ts` deleted — was dead code with zero callers
- Badge logic extracted to `src/lib/utils/availability-status.ts`

### 4. User Roles

```
buyer    - Can browse and purchase
vendor   - Can create listings, manage orders
admin    - Platform administration
verifier - Can verify vendor applications
```

### 5. Stripe Integration

- Platform uses Stripe Connect — each vendor connects their own Stripe account
- Revenue: 6.5% buyer fee + 6.5% vendor fee + $0.15 service fee per order
- Fee logic lives in `src/lib/pricing.ts` — single source of truth
- Tips (FT only): percentage-based, preset buttons + custom. Stripe processing on tip deducted from tip itself.
- `tip_percentage` + `tip_amount` + `tip_on_platform_fee_cents` columns on orders table
- Tip calculated on displayed subtotal (per-item rounding), vendor gets tip on food cost only
- Platform fee tip portion tracked in `tip_on_platform_fee_cents` (not shown to customer)

### 6. Vendor Tier System

Defined in `src/lib/vendor-limits.ts`. **Tiers differ by vertical:**

**Farmers Market:**
| Feature | Standard (Free) | Premium |
|---------|-----------------|---------|
| Traditional Markets | 1 | 4 |
| Private Pickups | 1 | 5 |
| Product Listings | 5 | 15 |
| Market Boxes | 2 (1 active) | 6 (4 active) |

**Food Trucks:**
| Feature | Free | Basic ($10/mo) | Pro ($30/mo) | Boss ($50/mo) |
|---------|------|----------------|--------------|----------------|
| Locations | 1 | 3 | 6 | 10 |
| Menu Items | 3 | 10 | 25 | 50 |
| Chef Boxes | 0 | 2 | 5 | 10 |

Use `getTierLimits(tier, vertical)` — always pass vertical. Use `isPremiumTier(tier, vertical)` to check premium status (FT: pro/boss, FM: premium).

### 7. Market Box / Chef Box Subscriptions

4-week recurring subscription bundles. Buyers pay once upfront, pick up weekly.

- **FM term:** Market Box. **FT term:** Chef Box (via `term()`)
- **Key tables:** `market_box_offerings` (has `box_type` column for FT), `market_box_subscriptions`, `market_box_pickups`
- **FT box types:** weekly_dinner, family_kit, mystery_box, meal_prep, office_lunch
- **Pickup lifecycle:** `scheduled` → `ready` → `picked_up`
- **Business rule:** Stripe-only (no external payments)

### 8. Vendor Onboarding (3-Gate System)

All three gates must pass before vendor can publish listings:
1. **Category Verification** — Upload per-category documents, admin reviews
2. **Certificate of Insurance (COI)** — Upload liability insurance proof, admin reviews
3. **Prohibited Items Acknowledgment** — Accept platform policy

### 9. Vendor Attendance / Schedule System (FT-specific)

`vendor_market_schedules` table tracks which vendors attend which markets:
- `vendor_start_time` / `vendor_end_time` (TIME, nullable) — vendor-specific operating hours
- FT requires attendance record for pickup availability
- Schedule API: GET/PATCH at `/api/vendor/schedule`
- Auto-created when vendor suggests a market or adds a listing
- Attendance prompt: yellow banner on vendor markets page for markets without records

### 10. Notification System (4 Channels)

19 notification types in `src/lib/notifications/types.ts`. Orchestrated by `service.ts`.

- **In-app:** Always sent (writes to `notifications` table)
- **Push:** Web Push API — free, real-time
- **SMS:** Twilio — fallback when push not enabled
- **Email:** Resend — for standard/info urgency

**Key rules:**
- `sendNotification()` never throws — safe to await without try/catch
- MUST await (Vercel terminates after response)
- `vertical` goes in options param (4th arg), NOT in templateData
- When push_enabled, SMS auto-skipped

### 11. Pickup Mode (Vendor Fulfillment)

Mobile-optimized at `src/app/[vertical]/vendor/pickup/page.tsx`. Smart polling, mutual confirmation, shows regular orders + market box pickups.

### 12. Error Tracking

- `withErrorTracing(route, method, handler)` wraps all API routes
- `crumb.*` breadcrumbs + `traced.*` structured errors
- Rate limiting on all routes: `admin` (30/min), `submit` (10/min), `auth` (5/min), `api` (60/min), `deletion` (3/hr), `webhook` (100/min)
- `error_resolutions` table tracks fix attempts — MUST query before fixing any error

---

## Common Pitfalls & Lessons Learned

### Database
1. **Never trust migration files** — use `supabase/SCHEMA_SNAPSHOT.md` or query actual DB
2. **Schema snapshot is mandatory after EVERY migration type** — triggers, functions, config changes, not just columns
3. **PostgREST schema cache** — after adding columns, run `NOTIFY pgrst, 'reload schema'`
4. **Before changing column types** — query ALL functions, triggers, views that reference it
5. **Before WHERE clauses in migrations** — query actual data to confirm filter matches
6. **Supabase `.rpc()` returns PostgrestFilterBuilder** — errors in response, not thrown

### Stripe & Payments
7. **Idempotency keys must be DETERMINISTIC** — never use `Date.now()`
8. **Double payout prevention** — check `vendor_payouts` before initiating transfer
9. **Flat fee proration** — $0.15 is per ORDER, prorate per item with `Math.round(fee / totalItemsInOrder)`
10. **Stripe payouts check ordering** — business logic → Stripe check → DB write → transfer

### Server & Timezone
11. **Vercel runs UTC** — all server-side date comparisons need timezone awareness
12. **Never hardcode timezone** — use client-side formatting or pass from client
13. **HTML time input vs DB TIME** — `<input type="time">` sends "HH:MM", DB returns "HH:MM:SS". Always normalize before comparing.

### RLS & Security
14. **Never check `is_platform_admin()` in policies on `user_profiles`** — causes recursion
15. **Use SECURITY DEFINER functions** with `SET search_path = public`

### Multi-Vertical
16. **`term()` falls back to FM** — don't use for branding, use lookup objects
17. **`verticals` table** — `id` (UUID) vs `vertical_id` (TEXT slug) — FKs use `vertical_id`
18. **CSS var theming** — body uses FM defaults from `:root`. Layout wrapper applies per-vertical overrides. Pages inherit from wrapper.

### User Preferences
19. **Never hardcode values without asking** — timezone, locale, fees, limits
20. **Explain changes BEFORE making them**
21. **Always present options** before architectural/design decisions
22. **User doesn't like structured Q&A tool** — weave questions into narrative

---

## Environments

| Environment | Branch | URL | Supabase |
|-------------|--------|-----|----------|
| Dev | `main` (local) | localhost:3002 | Dev (`vawpvi...`) |
| Staging | `staging` | Vercel Preview | Staging (`vfknvs...`) |
| Production | `main` (origin) | farmersmarketing.app | Prod (`vfuckt...`) |

- All 3 tiers fully separated and confirmed working (Session 27)
- User tests on Staging, not Dev
- Production DB is mostly empty — needs real signups or seed data

### Deployment Workflow — STAGING FIRST
1. Commit locally on `main`
2. Merge main → `staging`, push staging
3. Wait for Vercel preview deployment
4. User tests on staging URL
5. Only after user confirms → push `main` to origin

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Mandatory rules — read first every session |
| `supabase/SCHEMA_SNAPSHOT.md` | Current database schema (source of truth) |
| `supabase/REFRESH_SCHEMA.sql` | SQL to regenerate schema snapshot |
| `apps/web/.claude/current_task.md` | Active session state |
| `src/lib/design-tokens.ts` | CSS var theming + vertical color palettes |
| `src/lib/branding/defaults.ts` | Per-vertical branding (domain, logo, colors, meta) |
| `src/lib/vertical/index.ts` | `term()` terminology system |
| `src/lib/pricing.ts` | Fee calculations — single source of truth |
| `src/lib/vendor-limits.ts` | Tier limits per vertical |
| `src/lib/constants.ts` | Re-exports pricing + tier badge configs |
| `src/lib/notifications/service.ts` | Notification orchestrator (4 channels) |
| `src/lib/notifications/types.ts` | 19 notification type definitions |
| `src/lib/errors.ts` | `withErrorTracing`, `crumb.*`, `traced.*` |
| `src/lib/rate-limit.ts` | Rate limiting with presets |
| `src/lib/stripe/connect.ts` | Stripe Connect helpers |
| `src/lib/utils/image-resize.ts` | Upload image compression |
| `src/lib/supabase/server.ts` | Server-side Supabase client |
| `src/lib/supabase/client.ts` | Client-side Supabase client |
| `src/lib/auth/admin.ts` | Admin authentication helpers |
| `src/app/[vertical]/layout.tsx` | Vertical layout — injects CSS var overrides |
| `src/app/[vertical]/vendor/pickup/page.tsx` | Pickup Mode (mobile fulfillment) |
| `src/app/[vertical]/dashboard/page.tsx` | User dashboard |
| `src/app/[vertical]/vendor/dashboard/page.tsx` | Vendor dashboard |
| `src/components/landing/` | Landing page components (use `getVerticalColors()`) |

---

## Applied Migrations (All 3 Environments)

Migrations 001–041 applied to Dev, Staging, and Production. All in `supabase/migrations/applied/`. Key ones:

| Migration | Description |
|-----------|-------------|
| 001 | Initial schema (user_profiles, listings, orders, markets) |
| 007 | Deterministic Stripe idempotency keys |
| 008 | Market box tables |
| 012 | 3-gate vendor onboarding |
| 014 | Vertical terminology system + food_trucks vertical |
| 017-020 | Audit critical/high fixes (payout safety, admin auth, rate limits) |
| 021-023 | Grandfather verifications, Stripe subscription ID, cart vertical fix |
| 026 | Per-vertical buyer premium + market box regression fix |
| 032 | Vendor attendance (start/end times on vendor_market_schedules) |
| 034 | Vendor favorites table |
| 035 (box_type) | box_type column on market_box_offerings |
| 035 (enum) | payout_status enum: skipped_dev + pending_stripe_setup |
| 037 | Market box payout support, vendor_payouts.order_item_id nullable |
| 038 | Listing status enum fix: 'active' → 'published' in trigger |
| 039-040 | Events: market_type='event', event date columns, availability function rewrite |
| 041 | Tip platform fee tracking: tip_on_platform_fee_cents on orders |
| 104 | Event form considerations: children_present, is_themed, theme_description, has_competing_vendors, estimated_spend_per_attendee_cents, preferred_vendor_categories on catering_requests |
| 105 | Event date range fix: `get_available_pickup_dates()` UNION for event dates beyond 8-day window |
| 106 | Event vendor order caps: `event_max_orders_total` + `event_max_orders_per_wave` on market_vendors |

---

## Session History (Sessions 21–39)

| Session | Date | Key Work |
|---------|------|----------|
| 21 | 02-17 | Food truck vertical started — terminology system |
| 22 | 02-17 | Terminology system complete, migration 014 |
| 23 | 02-17 | Cross-vertical isolation, rate limiting, analytics SQL |
| 24 | 02-13 | 47-item audit, C1-C9 critical fixes |
| 25 | 02-13 | H1-H11 high-priority fixes, migrations 017-020 |
| 26 | 02-13 | Bug fixes, environment misconfiguration discovered |
| 27 | 02-13 | Production deployment, 3-tier env separation confirmed |
| 28 | 02-17 | Food truck pivot planning, revenue model, tier decisions |
| 29 | 02-17 | Quantity/measurement, landing page, schema snapshot regenerated |
| 30 | 02-17 | Per-vertical buyer premium, brand color sweep, FT onboarding, FT tier system |
| 31 | 02-18 | FT attendance data flow — vendor schedules, pickup date function rewrite |
| 32 | 02-18 | Chef Boxes (market boxes for FT) — 9 commits, migration 035 |
| 33 | 02-19 | Findings fixes (terminology across 19 files), FT brand kit v2 (red headers, white bg, outlined buttons), vendor favorites, background fix |
| 35 | 02-19 | Full codebase audit: C1-C5 critical, H1-H11 high, M1-M15 medium, L1-L12 low. Migration 035 (payout enum). statusColors tokens. Batch notifications. |
| 37 | 02-19 | Comprehensive 63-item audit. Tiers 1-5 fixes (financial, UX, terminology, security, infra). Migration 037. |
| 38 | 02-20 | Vitest 34 tests, enum fix (migration 038), FT seed data, events 5-phase plan |
| 39 | 02-21 | **Events feature Phases 1-4 COMPLETE**. market_type='event' on markets. Migrations 039+040 (Staging). 37 files, event detail page, admin create, vendor suggest. |
| 40 | 02-20 | **Post-demo 8-item plan + tip rounding fix**. ConfirmDialog (replaces browser popups), buyer status banners, full address links, events in availability, markets filters, lat/lng suggestions, input validation, PickupScheduleGrid branding. Tip fix: displaySubtotal per-item rounding, tip on displayed subtotal, platform fee tip tracking (migration 041). All pushed to prod+staging. |
| 62 | 03-20 | **Massive session: independent audit + 28 commits**. 58-finding audit, 20+ bug fixes (refund math, tier names, inventory logic, active orders count), external payment safety net (buyer cancel + vendor non-payment), vendor resolve-issue UI + admin order issues page, notification deep-linking, all notification titles i18n'd (36 titles EN+ES), Event Phase 1 complete (per-event vendor menus, lifecycle statuses), Event Phase 3/4 (feedback form, prep reminders, settlement, revenue estimate). Migrations 085a/b, 093, 094. Prod zip_codes seeded. |
| 63 | 03-22→27 | **Multi-day session: 15 commits, 4 migrations (100-103)**. Unified docs & certifications (combined gate docs + profile certs). Two-phase vendor tutorials (Getting Approved + Your Dashboard). Complete self-service event system: event-type-aware viability scoring (3 models), admin lifecycle stepper, auto-approve → auto-match → auto-invite pipeline, organizer selection page with terms + QR code + marketing kit, vendor conflict detection, backup vendor escalation, cancellation flow, message relay, contact sharing opt-in. In-form vendor search/select widget. Instant organizer notification on response threshold. Prod push window rule (9PM-7AM CT). Stripe webhook 307 fix (Vercel domain primary). Vercel Auth on staging. See `.claude/session63_summary.md` for full details. |
| 65 | 03-29 | **Production testing session: 21 commits, 1 migration (104)**. Admin panel RLS bug (9 pages). FM event readiness validation. COI upload on edit profile. Trial system disabled (feature flag). Event form: 6 new consideration fields + category multi-select. Viability scoring: FM synonyms, deal-breakers, warnings, differentiated scores, FM-neutral language. Admin events: per-vendor scoring UI, re-run auto match, skip reasons, service level badge. Vendor event invite: anonymization, FM language, event context. Communications rewrite: organizer email per-vertical, vendor invite per-vertical. Cron Phase 13: vendor gap alert at 24hr. Migration 006 applied to prod. See `.claude/session65_summary.md`. |
| 66 | 03-30 | **Event cart fix + architecture refactor, 7 commits, 2 migrations (105-106)**. Fixed `get_available_pickup_dates()` 8-day window excluding event dates (migration 105). Moved event pages under `[vertical]` layout for CartProvider access — shop page rewritten to use `useCart()`. Added vendor order capacity caps (migration 106): FM total cap, FT wave-aware cap with profile defaults. Event lifecycle automation: cron Phases 14-15 auto-transition ready→active→review. Unfulfilled order check on completed. Cross-sell suppressed for events. "Continue Shopping" hidden for event cart. **INCIDENT: Cart API broken in prod** — cap enforcement added to `cart/items/route.ts` without explicit file-level approval. Immediate revert. New rule: `critical-path-files.md` — 13 protected files with mechanical gate. |
| 71 | 04-11→12 | **Events system overhaul, 18 commits, 6 migrations (116-121).** Pushed Session 70's 348 commits to prod. Fixed broken EventFeedbackForm (was 400-ing since Session 62) — new two-section form with vendor ratings + event-general ratings via new `event_ratings` table. 4 new admin pages: Error Logs + Event Ratings for both platform + vertical admin. E2E audit of all event payment flows (attendee-paid, company-paid, hybrid, waves). 27-item TODO list created, 22 resolved across 7 clusters. Key fixes: buyer notifications on event cancel, company-paid fee structure (was $0 platform revenue), per-attendee spending cap enforced server-side, wave reservation timeout (10-min expiry), cross-event cart isolation, auto-invite vendors on approval, organizer emails on all status transitions, cleanup trigger for cancelled events, organizer RLS for attendee data. Hybrid payment hidden (dead end). Fee structure decision: standard 6.5%+$0.15 always applies + per-vendor flat fee by engagement tier. 5 items deferred: automated vendor payouts (T1-4), Stripe wave enforcement (T2-2), walk-up UI (T2-4), timezone (T5-6), hybrid implementation (T0-1). See `events_comprehensive_todo.md`. |
| 70 | 04-10→11 | **Live cleanup + audit, 11 commits, no migrations. NOT pushed to prod.** Shared `getVendorProfileForVertical` utility + 30-route ERR_VENDOR_001 sweep. `getTraditionalMarketUsage` rewritten to query `listing_markets` junction (was querying non-existent `listings.market_id`, silently returning 0 → tier cap unenforced). Per-tier traditional market cap enforced: free=3 / pro=5 / boss=8, via new `POST /api/vendor/listings/[listingId]/markets`. Market detail page "0 vendors" bug fixed by extracting vendors-with-listings to `src/lib/markets/` and bypassing the Vercel-Auth-blocked self-fetch (`1d695beb`). Protocol 8 added (Error Log Review at every kickoff). Playwright `actionTimeout` 10→30s. **INCIDENT (investigation, not code):** spent 4 rounds speculating about market-page bug root cause — filter mismatch, RLS, deleted_at, edge cache — all disproved. The fix (`1d695beb`) was already shipped; symptom was staging deploy propagation lag. Lesson: read direct page output before hypothesizing. See `feedback_verify_output_before_hypothesizing.md`. |
| 74 | 04-24→26 | **Market box biweekly hardening + "find the money" + post-audit sweep, 22+ commits, 4 migrations (124-127). 43 commits ahead of prod.** **Phase 1 (market box):** added biweekly cadence (migration 124), Option A duration semantics (migration 125), unified tier limits in DB trigger (migration 126). 3 batches of buyer + vendor display fixes (Batches 1-3+5) covering all CRIT/HIGH items from `market_box_audit_v2.md`. **Phase 2 (find the money):** prod incident — vendor `farmersmarketingapp+vegvendor1` charged $106.65 for biweekly market box, subscription created, pickup completed, but `vendor_payouts` empty. Bug chain: webhook missing `processMarketBoxPayout` call → fixed → still no-op because helper inside `if (!existingPayment)` guard skipped on resend → restructured webhook to move market box block out of guard → still failed because `vendor_payouts_has_reference` CHECK constraint missing `market_box_subscription_id` (constraint pre-dated the column) → migration 127 fixed constraint. Vendor finally paid via Stripe webhook resend. **Phase 3 (attack the backlog):** closed 4 of 5 Priority 0 items. Found and fixed silent prod bug in event cancellation — `events/[token]/cancel/route.ts` and `admin/events/[id]/route.ts` were querying `from('orders').eq('market_id', X)` but `orders.market_id` doesn't exist (4 phantom column references); fix uses `order_items.market_id` (real column) per design doc T0-2. Vendor analytics overview/trends/customers now include market box subscriptions (top-products + tax-summary deferred for design). `processMarketBoxPayout` catch-all now uses `logError` (was console-only — made the constraint bug invisible). FT vertical audit + 2 polish fixes. Webhook anti-pattern audit confirmed no other handlers have the bug shape. **NEW RULE:** "Mechanical Gate — Cannot Be Overridden" added to CLAUDE.md under Database Schema Reference — before any SQL with column names, must Read SCHEMA_SNAPSHOT.md OR run `information_schema.columns` discovery; snapshot can be wrong (proven this session — claimed 4 columns on orders that don't exist), escalate to `information_schema` if snapshot fails. **Schema snapshot has 4 phantom columns on `orders`** (vendor_payout_cents, buyer_fee_cents, service_fee_cents, market_id) — backlog item to regenerate. See `apps/web/.claude/current_task.md` for full session record. |

---

## Known Issues / Open Items

- **A2P 10DLC**: pending carrier approval for SMS
- **Production DB**: seed data + test accounts only — real vendor onboarding in progress
- **Email template brand color**: `notifications/service.ts` has hardcoded `#166534` in HTML — needs vertical-aware color
- **Food truck icon**: `FoodTruckIcon_BW.jpg` saved at `public/icons/`, not yet integrated into nav/branding
- **URL rewrite**: Remove redundant `/farmers_market/` from URLs on single-vertical domains
- **Remaining outlined buttons**: ~50 buttons still need converting to outlined style for FT
- **Trial system**: Disabled via `TRIAL_SYSTEM_ENABLED = false` in `vendor-limits.ts`. One-line re-enable.
- **Event 3b threshold**: Instant results email fires too early (1 of 3 vendors). Needs re-evaluation.
- **Event organizer dashboard**: "My Events" card EXISTS on buyer dashboard (auto-linked via email). Session 71 extended: View Event Page link for review/completed statuses, inline access code display, organizer emails on all status transitions. Still needs: dedicated organizer management page separate from dashboard card.
- **Event communications**: 3a admin notif, Phase 11 prep reminder, Phase 12 48hr results still have FT language.
- **Event order cap enforcement**: Reimplemented via `GET /api/events/[token]/validate-order-cap` (Session 71). ShopClient should call before checkout. Cart isolation also added to prevent cross-event item mixing. Per-attendee spending cap enforced server-side in `create_company_paid_order` RPC.
- **Event shop URL changed**: Now at `/{vertical}/events/{token}/shop` (was `/events/{token}/shop`). Old links 404.
- **Critical-path files rule**: `.claude/rules/critical-path-files.md` — 13 protected files. Cart, checkout, payments, pricing never modified without explicit file-level approval.
- **Auth session conflict**: Incognito + regular Chrome on same domain can conflict. Use different browsers for multi-role testing.
- **`skipped_dev` / `pending_stripe_setup` payout statuses**: FIXED — migration 035 added to enum, applied to all 3 envs
- **All branches synced**: main = origin/main = staging (as of Session 40)
- **Dev out of sync**: Migrations 039-041 on Staging+Prod. Dev needs these applied. Also 105 failed on dev (missing event columns — migration 039 never applied to dev).
- **Events feature**: Shopping flow working end-to-end on prod (Session 66). Lifecycle auto-transitions via cron. Vendor capacity caps designed + columns added, enforcement pending reimplementation.
- **3 vendor routes single() — FIXED** (verified Session 90): `api/vendor/cover-image/route.ts:21`, `api/vendor/stripe/onboard/route.ts:28`, `api/vendor/stripe/status/route.ts:26` now all use `getVendorProfileForVertical` (the `?vertical=` aware helper). The Session 70 "not fixed" note was stale.
- **Dead endpoint `/api/analytics/vitals`**: FIXED Session 70 — env-var gated, 404 noise silenced.
- **Session 70 commits pushed to prod**: DONE Session 71 — ERR_VENDOR_001 confirmed stopped.
- **Hybrid event payment model**: Hidden from event form (Session 71). Entire checkout/order flow is a dead end — config works but no split-payment logic exists. Needs dedicated design session to implement.
- **Event deferred items (Session 71)**: T1-4 automated vendor payouts, T2-2 wave enforcement at Stripe checkout (critical-path file), T2-4 walk-up UI, T5-6 timezone awareness, T0-1 hybrid implementation. See `events_comprehensive_todo.md`.
- **18 Session 71 commits on staging NOT on prod**: User wants to test staging before pushing. All 6 migrations (116-121) already applied to prod DB — just code push pending.
- **43 commits ahead of prod after Session 74 (incl. 4 pending migrations 124-127)**: market box biweekly hardening, "find the money" payout fixes, post-audit Priority 0 sweep, event cancel bug fix, vendor analytics overview/trends/customers fixes. Apply migrations to Prod FIRST in order (124 → 125 → 126 → 127), then push code.
- **Schema snapshot has 4 phantom `orders` columns**: `vendor_payout_cents`, `buyer_fee_cents`, `service_fee_cents`, `market_id` listed in snapshot but don't exist on live staging. Discovered Session 74. Backlog item to regenerate via `REFRESH_SCHEMA.sql`. The new Mechanical Gate (CLAUDE.md) covers it in the meantime via `information_schema.columns` escalation.
- **CLAUDE.md NEW RULE — "Mechanical Gate — Cannot Be Overridden"** under Database Schema Reference: before any SQL with column names, immediately preceding tool call must be Read of SCHEMA_SNAPSHOT.md OR `information_schema.columns` discovery. If snapshot fails or is marked stale, escalate to `information_schema` — snapshot is best-effort, only `information_schema` is authoritative for live env. Added because Session 74 burned 30 min on snapshot lies.
- **Market box payout flow now resend-safe**: `webhooks.ts handleCheckoutComplete` restructured Session 74 to move market box block out of `if (!existingPayment)` guard; `processMarketBoxPayout` helper has its own idempotency check. Stripe event resend is the safe backfill mechanism for missing market box payouts.
- **Event cancellation buyer-notify + order-cancel was silently broken** (Session 74 fix). Both `events/[token]/cancel/route.ts` and `admin/events/[id]/route.ts` were querying `from('orders').eq('market_id', X)` — phantom column. SELECT returned null, code skipped buyer-notify + order-cancel block entirely. Now uses `order_items.market_id` (real column) per design doc T0-2 pattern.
- **`processMarketBoxPayout` catch-all now uses `logError`**: was console-only, made the constraint bug from migration 127 invisible. Now uses ERR_PAYOUT_004. Other 5 silent return points in the helper still don't log (backlog Priority 1).

---

## Final Advice

1. **Read `apps/web/.claude/current_task.md` first** — it has active session state
2. **The database is truth** — not migration files, not code assumptions
3. **Both availability systems must agree** — RPC and JavaScript API
4. **Always pass `vertical`** — to `getTierLimits()`, `term()`, API calls, queries
5. **Staging first** — never push origin/main without user confirming staging works
6. **Check MEMORY.md** — auto-loaded into system prompt, has patterns and lessons
7. **Document what you learn** — update SCHEMA_SNAPSHOT.md, error_resolutions, this file
