# Plan: Per-Vertical Buyer Premium Configuration

Created: 2026-02-17
Status: PROPOSED (not yet implemented)

## Problem

The buyer premium system (2-hour early access window, premium badge, upgrade UI) was built for the farmers market vertical. For food trucks:
- The compressed time frame makes a 2-hour premium window unreasonable
- We don't want barriers to onboarding food truck shoppers
- Premium upgrade UI should be hidden for food trucks
- But the code must be preserved for future verticals that may want premium features

## Current State: 30 Files Impacted

### Database (triggers fire for ALL verticals — no vertical check)
- `set_listing_premium_window()` — BEFORE INSERT/UPDATE trigger on `listings`
- `set_market_box_premium_window()` — BEFORE INSERT/UPDATE trigger on `market_box_offerings`
- `platform_settings.premium_window_minutes` = 120 (global, not per-vertical)
- `user_profiles.buyer_tier` — platform-wide (no vertical_id column)
- Columns: `listings.premium_window_ends_at`, `market_box_offerings.premium_window_ends_at`

### UI Components (things users see)
- `src/components/listings/ListingPurchaseSection.tsx` — "Premium Early-Bird Access" banner replaces Add to Cart
- `src/app/[vertical]/buyer/upgrade/page.tsx` — Full upgrade/paywall page ($9.99/mo, $81.50/yr)
- `src/app/[vertical]/settings/BuyerTierManager.tsx` — Premium status + upgrade CTA + cancel modal
- `src/app/[vertical]/subscription/success/page.tsx` — Post-checkout confirmation (shared vendor+buyer)

### Pages with Premium Logic
- `src/app/[vertical]/browse/page.tsx` — Filters out premium-windowed listings for non-premium buyers, shows banner with count + upgrade link
- `src/app/[vertical]/listing/[listingId]/page.tsx` — Checks buyer_tier, computes isPremiumRestricted, passes to ListingPurchaseSection
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — Premium window banners on listing cards and market box cards
- `src/app/[vertical]/dashboard/page.tsx` — "Premium" badge next to username + upgrade promo card at bottom
- `src/app/[vertical]/vendor/market-boxes/page.tsx` — Copy references "premium buyers"
- `src/app/[vertical]/vendor/market-boxes/new/page.tsx` — Copy references "premium buyers"

### API Routes
- `src/app/api/buyer/subscription/status/route.ts` — GET buyer tier status (no vertical param)
- `src/app/api/buyer/tier/downgrade/route.ts` — POST cancel premium (no vertical param)
- `src/app/api/subscriptions/checkout/route.ts` — POST create Stripe checkout (accepts vertical for URLs)
- `src/app/api/subscriptions/verify/route.ts` — GET verify Stripe session

### Library/Config
- `src/lib/stripe/config.ts` — `SUBSCRIPTION_PRICES.buyer.monthly/annual` (global, not per-vertical)
- `src/lib/stripe/webhooks.ts` — Handles buyer tier upgrade/downgrade from Stripe events (no vertical logic)

### Admin
- `src/app/[vertical]/admin/page.tsx` — Premium buyer count (NOT filtered by vertical — platform-wide)
- `src/app/[vertical]/admin/users/UsersTable.tsx` — Buyer tier column + filter
- `src/app/[vertical]/admin/users/UsersTableClient.tsx` — Same
- `src/app/admin/users/UsersTableClient.tsx` — Global admin buyer tier display
- `src/app/admin/users/page.tsx` — Global admin buyer tier fetch

## Bugs Found During Scan
1. **Price hardcoded as strings** in upgrade page + BuyerTierManager ($9.99, $81.50) — should use SUBSCRIPTION_PRICES
2. **Admin premium buyer count not vertical-filtered** — shows global count regardless of vertical
3. **Settings page field name mismatch** — passes `buyer_tier_expires_at` but column is `tier_expires_at`
4. **Market box premium trigger still has capacity-increase regression** — migration 009 fixed listings but NOT market boxes

## Proposed Solution: Vertical Config Flag

### Config Addition (in vertical TypeScript configs)

```typescript
// In VerticalTerminologyConfig or new VerticalFeatureConfig
premium: {
  buyer_premium_enabled: boolean,        // false for food_trucks, true for farmers_market
  premium_window_minutes: number | null, // 120 for FM, null/0 for food_trucks
  show_upgrade_ui: boolean,              // false for food_trucks, true for farmers_market
}
```

### Implementation Tiers

#### Tier 1: DB Triggers (prevent premium window from being set)
- Modify `set_listing_premium_window()` to check `NEW.vertical_id` against vertical config
- Modify `set_market_box_premium_window()` same way
- If vertical has `premium_window_minutes = 0` or null, skip setting window
- Also fix market box capacity-increase regression while we're in there
- **Migration required**

#### Tier 2: UI Hiding (6-8 files)
- Add helper: `isBuyerPremiumEnabled(vertical)` or use vertical config
- Hide upgrade cards, premium badges, premium banners when config says disabled
- Files to modify:
  - `dashboard/page.tsx` — hide upgrade promo card + premium badge
  - `browse/page.tsx` — skip premium window filtering + hide banner
  - `listing/[listingId]/page.tsx` — skip isPremiumRestricted check
  - `vendor/[vendorId]/profile/page.tsx` — skip premium window banners
  - `ListingPurchaseSection.tsx` — never show premium block
  - `buyer/upgrade/page.tsx` — redirect away or show "not available" message
  - `settings/BuyerTierManager.tsx` — hide premium section
  - `vendor/market-boxes/page.tsx` + `new/page.tsx` — update copy

#### Tier 3: No Changes Needed (API/Stripe)
- Checkout, verify, downgrade, webhook routes stay as-is
- They won't be called for food truck buyers since UI won't expose them
- If someone hits API directly, Stripe price IDs still need to exist (harmless)
- Admin pages can stay — premium count just shows 0 for food trucks

### Why This Approach
- **No code deletion** — FM premium works exactly as before
- **Future-proof** — new verticals can enable premium with different window durations
- **Single config source** — one place to toggle premium per vertical
- **Minimal risk** — DB trigger change is only logic change; rest is UI visibility
- **Clean** — no if/else spaghetti; config-driven behavior

### Decision Points for User
1. Should `buyer_tier` remain platform-wide (premium on FM = premium on FT)? Or per-vertical?
   - Current: platform-wide. Recommendation: keep platform-wide for now, revisit later.
2. Should the upgrade page show a "not available for this vertical" message or just redirect?
3. Should we fix the 4 bugs found during the scan as part of this work or separately?
