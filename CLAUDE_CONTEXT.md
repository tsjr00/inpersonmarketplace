# Claude Context: InPersonMarketplace

**Purpose:** Help future Claude sessions understand this project quickly and avoid repeating mistakes.

**Last Updated:** 2026-02-03

---

## What This App Is

InPersonMarketplace is a **multi-vertical marketplace platform** for in-person transactions. Think of it as infrastructure that can power different types of local marketplaces:

- **Farmers Markets** (primary vertical, most developed)
- **Fireworks stands** (seasonal)
- **Other local commerce** (future)

### Core Value Proposition

1. **For Vendors:** Accept pre-orders online, know what to bring to market, get paid digitally
2. **For Buyers:** Browse local products, pre-order for pickup, discover vendors near them
3. **For Market Organizers:** Manage vendor applications, schedules, and market operations

### Key Differentiator

This is NOT a delivery app. Everything is **in-person pickup** at:
- Traditional farmers markets (fixed schedule, public location)
- Private pickup locations (vendor's farm, home, etc.)

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

### Project Structure
```
inpersonmarketplace/
├── apps/web/                 # Next.js application
│   ├── src/app/             # App router pages
│   │   ├── [vertical]/      # Dynamic vertical routes (farmers_market, fireworks)
│   │   ├── admin/           # Platform admin pages
│   │   └── api/             # API routes
│   ├── src/components/      # React components
│   ├── src/lib/             # Utilities, hooks, helpers
│   └── ...
├── supabase/
│   ├── migrations/          # Database migrations (SQL)
│   └── SCHEMA_SNAPSHOT.md   # Current DB schema (SOURCE OF TRUTH)
├── config/verticals/        # Vertical configurations (JSON)
├── docs/                    # Documentation
└── CLAUDE.md               # Rules for Claude (READ THIS FIRST)
```

### The Vertical System

The app is "vertical-agnostic" - configuration files define how each marketplace works:

```
config/verticals/farmers_market.json
config/verticals/fireworks.json
```

These control: listing fields, vendor fields, categories, colors, features, etc.

Routes use `[vertical]` dynamic segment:
- `/farmers_market/browse` → Farmers market browse page
- `/fireworks/browse` → Fireworks browse page

---

## Key Concepts You Must Understand

### 1. Markets vs Listings vs Orders

- **Market:** A location where vendors sell (traditional market OR private pickup)
- **Listing:** A product a vendor sells (linked to markets via `listing_markets`)
- **Order:** A buyer's purchase (contains `order_items` linked to listings)

### 2. Market Types

| Type | Description | Cutoff |
|------|-------------|--------|
| `traditional` | Fixed schedule public market (Saturday Farmers Market) | 18 hours before |
| `private_pickup` | Vendor's own location (their farm) | 10 hours before |

**Critical:** Both types MUST have schedules in `market_schedules` table. Without schedules, the cutoff system breaks.

### 3. Order Cutoff System

Vendors need prep time before market day. The system automatically closes orders:
- Traditional markets: 18 hours before market time
- Private pickups: 10 hours before pickup time

This is implemented via:
- RPC functions: `is_listing_accepting_orders()`, `get_listing_market_availability()`
- Two APIs that must agree: `/api/listings/[id]/availability` and `/api/listings/[id]/markets`

### 4. User Roles

```
buyer    - Can browse and purchase
vendor   - Can create listings, manage orders
admin    - Platform administration
verifier - Can verify vendor applications
```

Users can have multiple roles (stored as array in `user_profiles.roles`).

### 5. Stripe Integration

- Platform uses Stripe Connect
- Each vendor connects their own Stripe account
- Platform takes a fee on each transaction
- Stripe handles payouts to vendors

---

## Common Pitfalls & Lessons Learned

### 1. Database Schema - NEVER Trust Migration Files

**Problem:** Migration files on disk may not reflect actual database state.

**Solution:** Always reference `supabase/SCHEMA_SNAPSHOT.md` or query the actual database.

### 2. Column Naming Inconsistency

The `markets` table has a column called `market_type` (not `type`). This has caused bugs where code referenced the wrong column name.

**Lesson:** Verify column names from actual schema, not assumptions.

### 3. Markets Without Schedules

If a market has no entries in `market_schedules`, the cutoff system fails unpredictably:
- RPC functions return "orders open" (NULL cutoff = open)
- JavaScript API returns "orders closed" (no schedules = closed)
- Result: Grayed button with no explanation

**Solution:** Always require schedules when creating markets.

### 4. Two Availability Systems Must Agree

There are two separate systems checking if orders are open:
1. `/api/listings/[id]/availability` - Uses RPC functions
2. `/api/listings/[id]/markets` - Uses JavaScript calculation

If they disagree, UI breaks. After any changes to availability logic, verify both return consistent results.

### 5. RLS Policy Recursion

**Never** check `is_platform_admin()` in policies on `user_profiles` - causes infinite recursion.

**Solution:** Use SECURITY DEFINER helper functions or service_role grants.

### 6. Test Data Causes Real Problems

Inserted test data that doesn't follow rules (markets without schedules, etc.) will cause bugs that are hard to diagnose.

**Solution:** Always create test data through the actual UI flows, or ensure it follows all validation rules.

---

## How to Be Successful

### Before Starting Any Work

1. **Read `CLAUDE.md`** - Contains mandatory rules
2. **Read this file** - Understand the app context
3. **Check `supabase/SCHEMA_SNAPSHOT.md`** - Know the actual database structure
4. **Ask about recent changes** - User may have context from previous sessions

### When Working on Database/Schema

1. Query actual database, not migration files
2. Check `error_resolutions` table for similar past issues
3. After migrations succeed, update `SCHEMA_SNAPSHOT.md`
4. Always use `SET search_path = public` in functions

### When Working on Availability/Orders

1. Understand both availability checking systems
2. Test with markets that have schedules AND without
3. Verify CutoffStatusBanner and AddToCartButton agree

### When Working on New Features

1. Check which vertical(s) it applies to
2. Follow existing patterns in similar features
3. Use the error tracing system (`withErrorTracing`)
4. Add appropriate RLS policies

### When Debugging

1. Check browser Network tab for API responses
2. Ask user to run SQL queries to verify data state
3. Don't assume - verify with actual database
4. Document findings in `error_resolutions` table

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Mandatory rules - read first every session |
| `supabase/SCHEMA_SNAPSHOT.md` | Current database schema |
| `src/lib/supabase/server.ts` | Server-side Supabase client |
| `src/lib/supabase/client.ts` | Client-side Supabase client |
| `src/lib/auth/admin.ts` | Admin authentication helpers |
| `src/components/listings/CutoffStatusBanner.tsx` | Order cutoff UI |
| `src/components/cart/AddToCartButton.tsx` | Add to cart with market selection |
| `src/app/api/listings/[id]/availability/route.ts` | Availability API (RPC-based) |
| `src/app/api/listings/[id]/markets/route.ts` | Markets API (JS-based) |

---

## Current State (as of 2026-02-03)

### What's Working
- Vendor registration and profiles
- Listing creation and management
- Market/location management (admin)
- Order placement and checkout (Stripe)
- Order cutoff system (with schedules)
- Buyer browse and search
- Admin dashboards

### Recent Fixes
- Availability system: Fixed column name bug (`market_type` not `type`)
- Schedule requirement: Admin UI now shows schedules for ALL market types
- Safety net: `forceShowClosed` prop ensures explanation shows when orders closed

### Known Issues / TODO
- Vendors cannot edit their own private pickup locations from dashboard (access issue)
- Some Supabase security warnings remain (PostGIS in public schema)

---

## Communication Style the User Prefers

- **Be direct** - Don't over-explain or add unnecessary caveats
- **Verify before acting** - Check actual state, don't assume
- **Admit mistakes quickly** - If something breaks, diagnose and fix
- **Ask for clarification** - User prefers questions over wrong assumptions
- **Keep summaries concise** - User is technical and doesn't need hand-holding

---

## Final Advice

1. **The database is truth** - Not migration files, not code assumptions
2. **Both systems must agree** - Availability RPC and JavaScript API
3. **Markets need schedules** - No schedule = broken cutoff system
4. **Document what you learn** - Update SCHEMA_SNAPSHOT.md, error_resolutions, session summaries
5. **Test end-to-end** - User is close to launch, everything must work together
