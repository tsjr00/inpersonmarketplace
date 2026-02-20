# Claude Context: InPersonMarketplace

**Purpose:** Help future Claude sessions understand this project quickly and avoid repeating mistakes.

**Last Updated:** 2026-02-20 (Session 40)

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

**Two availability systems must agree:**
1. `/api/listings/[id]/availability` — RPC-based
2. `/api/listings/[id]/markets` — JS `processListingMarkets()` from `listing-availability.ts`

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

---

## Known Issues / Open Items

- **A2P 10DLC**: pending carrier approval for SMS
- **Production DB**: mostly empty — needs real signups
- **Email template brand color**: `notifications/service.ts` has hardcoded `#166534` in HTML — needs vertical-aware color
- **Food truck icon**: `FoodTruckIcon_BW.jpg` saved at `public/icons/`, not yet integrated into nav/branding
- **URL rewrite**: Remove redundant `/farmers_market/` from URLs on single-vertical domains
- **Remaining outlined buttons**: ~50 buttons still need converting to outlined style for FT
- **`skipped_dev` / `pending_stripe_setup` payout statuses**: FIXED — migration 035 added to enum, applied to all 3 envs
- **All branches synced**: main = origin/main = staging (as of Session 40)
- **Dev out of sync**: Migrations 039-041 on Staging+Prod. Dev needs these applied.
- **Events feature**: Phases 1-4 complete. Phase 5 (reminders/conversion) deferred. Needs testing on staging.

---

## Final Advice

1. **Read `apps/web/.claude/current_task.md` first** — it has active session state
2. **The database is truth** — not migration files, not code assumptions
3. **Both availability systems must agree** — RPC and JavaScript API
4. **Always pass `vertical`** — to `getTierLimits()`, `term()`, API calls, queries
5. **Staging first** — never push origin/main without user confirming staging works
6. **Check MEMORY.md** — auto-loaded into system prompt, has patterns and lessons
7. **Document what you learn** — update SCHEMA_SNAPSHOT.md, error_resolutions, this file
