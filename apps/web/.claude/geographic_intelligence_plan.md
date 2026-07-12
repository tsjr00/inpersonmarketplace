# Geographic Intelligence — Location Insights for Vendors

Created: 2026-02-22 (Session 42)
Status: Planning — Phase 1 & 2 approved, building plan

## User Direction
"Start with phase 1 and 2. Tie them to basic & pro tiers. Make sure to build the UI."

---

## What We're Building

### Phase 1: Location Insights Dashboard (Basic Tier — Existing Data)

Pure read-only analytics from data we already collect. No schema changes. Vendor sees a "Location Insights" section on their dashboard or a dedicated insights page.

**Metrics (all derived from existing order_items + markets + orders tables):**

1. **Revenue by Location** — "Your top locations by sales volume this month"
   - Group `order_items` by `market_id`, join `markets` for name/address
   - Show: market name, total revenue, order count, time period

2. **Peak Days by Location** — "Saturdays generate 3x more orders than Wednesdays at Riverside Park"
   - Cross-reference `order_items.pickup_date` day-of-week with `market_id`
   - Show: day-of-week breakdown per market

3. **Average Order Size by Location** — "Downtown Market: $18.50 avg vs Oak Park: $12.30"
   - Per-market average from `order_items.unit_price_cents * quantity`
   - Tells vendor which spots have higher-spending customers

4. **Buyer Density Around Markets** — "142 registered buyers within 10 miles of Riverside Park"
   - Count `user_profiles` with `preferred_latitude/longitude` within radius of each market
   - Uses existing PostGIS or Haversine distance

5. **New vs Repeat Customers by Location** — "60% repeat at Market A, 20% at Market B"
   - Count distinct `orders.buyer_user_id` per market, flag first-time vs returning
   - Shows which locations build loyalty

**Tier gating:** Basic tier sees all 5 metrics for THEIR OWN locations only (backward-looking, their data).

---

### Phase 2: Forward-Looking Recommendations (Pro/Boss Tier)

Small schema addition + cross-vendor aggregate intelligence.

**New table: `buyer_search_log`**
- `id` UUID PK
- `zip_code` TEXT (rounded to ZIP centroid — anonymous)
- `vertical_id` TEXT FK
- `results_count` INTEGER (how many markets/vendors found)
- `search_type` TEXT ('markets' | 'vendors')
- `created_at` TIMESTAMPTZ
- NO user_id — intentionally anonymous for privacy

Populated by: adding a lightweight INSERT in `/api/markets/nearby` and `/api/vendors/nearby` responses. One row per search.

**Pro/Boss Insights:**

6. **Coverage Gap Detection** — "47 buyer searches in ZIP 61101 this week, 0 vendors present"
   - Aggregate `buyer_search_log` WHERE `results_count = 0` or low
   - Show vendors: "Here's where demand exists but nobody's serving"

7. **"Markets You're Missing" Recommendations** — "3 active markets within 15 miles that you're NOT attending, with X registered buyers nearby"
   - Cross-reference vendor's current `vendor_market_schedules` with all active markets in radius
   - Natural tier upgrade trigger: "You've hit your 3-location limit on Basic"

8. **Location Performance Score** — Composite 1-5 metric per market
   - Combines: order volume, unique buyers, avg ticket, repeat rate, buyer density
   - Could be nightly-computed (same pattern as quality checks) or on-demand
   - Vendors see star rating on each market card

9. **Category Demand by Area** — "BBQ is #1 searched in your area but only 1 truck serves it"
   - Requires search log + listing category data
   - Cross-vendor aggregate — this is platform-exclusive intelligence

10. **Optimal Schedule Suggestions** — "Tuesday evenings underserved at Riverside Park — 3 trucks Sat, 0 Tue"
    - Aggregate all vendor schedules + order volume by day-of-week per market
    - Show gaps where demand exists but no vendor is present

---

## Existing Data Assets (No Changes Needed)

### Tables with geographic data:
- `zip_codes` — 33k+ US ZIPs with lat/lng, population, county, timezone, region_code
- `vendor_location_cache` — pre-computed vendor positions, auto-refreshed via triggers
- `user_profiles` — preferred_latitude/longitude, location_source, location_text
- `vendor_profiles` — latitude, longitude, geocoding_failed
- `listings` — address, city, state, zip, latitude, longitude
- `markets` — address, city, state, zip, latitude, longitude
- `order_items` — market_id FK (links every sale to a location)
- `orders` — buyer_user_id, vertical_id, created_at

### PostGIS functions:
- `get_markets_within_radius(user_lat, user_lng, radius_meters, vertical_filter, market_type_filter)`
- `get_vendors_within_radius(user_lat, user_lng, radius_meters, vertical_filter)`
- `get_zip_coordinates(zip_code)`
- `get_nearby_zip_codes(user_lat, user_lng, limit_count)`

### Key API routes:
- `/api/markets/nearby` — market proximity search
- `/api/vendors/nearby` — vendor proximity search
- `/api/buyer/location` — buyer location management

---

## Tier Gating Strategy

| Insight | Basic ($10) | Pro ($30) | Boss ($50) |
|---------|-------------|-----------|------------|
| Revenue by location | ✅ Own data | ✅ | ✅ |
| Peak days by location | ✅ Own data | ✅ | ✅ |
| Avg order size by location | ✅ Own data | ✅ | ✅ |
| Buyer density near markets | ❌ | ✅ | ✅ |
| New vs repeat by location | ❌ | ✅ | ✅ |
| Coverage gap detection | ❌ | ✅ | ✅ |
| Markets you're missing | ❌ | ✅ | ✅ |
| Location performance score | ❌ | ✅ | ✅ |
| Category demand by area | ❌ | ❌ | ✅ |
| Optimal schedule suggestions | ❌ | ❌ | ✅ |

**Upgrade hook:** Basic vendors see blurred/locked cards with "Upgrade to Pro to unlock" CTAs. They know the data EXISTS — they just can't see it. Natural upsell.

---

## Architecture Notes

### Pattern: Same as Quality Checks
- API route for data: `/api/vendor/location-insights`
- Vendor page: `/[vertical]/vendor/insights` (or tab on dashboard)
- Tier check in API: return limited data for basic, full data for pro/boss
- Admin doesn't need a separate view (this is vendor-facing)

### Key files to reference:
- `src/lib/vendor-limits.ts` — `getTierLimits()`, `isPremiumTier()` for tier checks
- `src/lib/quality-checks.ts` — pattern for batch data processing
- `src/app/[vertical]/vendor/dashboard/page.tsx` — where to add insights card/link
- `src/app/[vertical]/admin/reports/page.tsx` — tab pattern reference
- `src/lib/design-tokens.ts` — statusColors, colors for data visualization
- `src/lib/pricing.ts` — fee calculations if we need to show net revenue

### Buyer search logging:
- Lightweight INSERT in `/api/markets/nearby` and `/api/vendors/nearby`
- Anonymous (ZIP only, no user_id)
- New migration for `buyer_search_log` table
- Minimal performance impact — one async insert per search

---

## Future Phases (Not Building Now)

### Phase 3: Nightly Batch Intelligence
- Location Performance Score (composite metric, nightly refresh like quality checks)
- Weather correlation logging (one free API call per market per day)
- `market_performance_scores` table + cron job

### Phase 4: Partner Data
- Foot traffic data (SafeGraph/Placer.ai) — expensive, later
- Local event calendars (Eventbrite/Meetup APIs) — aspirational
- Stripe revenue benchmarks — already integrated, just need to surface

---

## Implementation Checklist (Phase 1 & 2)

### Migration (1 file)
- [ ] `buyer_search_log` table + indexes + RLS

### API Routes (1-2 files)
- [ ] `/api/vendor/location-insights` — GET with tier-gated response
- [ ] Modify `/api/markets/nearby` + `/api/vendors/nearby` to log searches

### Frontend (2-3 files)
- [ ] Insights page: `/[vertical]/vendor/insights/page.tsx`
- [ ] Dashboard card/banner linking to insights
- [ ] Tier upgrade prompts for locked insights

### Lib (1 file)
- [ ] `src/lib/location-insights.ts` — query functions for each metric

### Notifications
- [ ] Consider: weekly digest notification with top insight? (deferred — discuss later)

### Modified files
- [ ] `src/lib/notifications/types.ts` — if adding weekly digest
- [ ] `src/app/[vertical]/vendor/dashboard/page.tsx` — add insights card
- [ ] `vercel.json` — if adding a nightly cron for score computation
