# Session Summary: January 19, 2026
## Market Listing Cutoff Feature & Market Profile Pages

---

## Overview

This session implemented two major features:
1. **Market Listing Cutoff** - Auto-close listings before market day to give vendors prep time
2. **Market Profile Pages** - Buyer-focused market discovery experience

---

## Feature 1: Market Listing Cutoff

### Problem
Vendors need time to harvest, pack, and prepare for market day. Orders placed too close to market time create logistical issues.

### Solution
Automatically stop accepting orders before market/pickup time:
- **Traditional Markets**: 18-hour cutoff before market start
- **Private Pickup**: 10-hour cutoff (vendors control timing, less prep needed)

### Database Changes
**Migration:** `supabase/migrations/20260119_002_market_listing_cutoff.sql`

New columns on `markets` table:
- `timezone` (TEXT) - IANA timezone for market location (default: America/Chicago)
- `cutoff_hours` (INTEGER) - Hours before market when orders close (18 for traditional, 10 for private)

New PostgreSQL functions:
- `get_next_market_datetime()` - Calculate next market occurrence from schedule
- `get_market_cutoff()` - Get cutoff timestamp for a market
- `is_listing_accepting_orders()` - Check if listing can accept orders (any market open)
- `get_listing_market_availability()` - Detailed per-market availability info

### API Changes

**New Endpoint:** `GET /api/listings/[id]/availability`
- Returns `is_accepting_orders`, `closing_soon`, `hours_until_cutoff`
- Per-market breakdown with open/closed status

**Modified:** `POST /api/checkout/session`
- Validates cutoff before creating order
- Returns friendly error with market date if closed

**Modified:** `GET/POST /api/cart/validate`
- Checks cutoff status for cart items
- Returns `hasCutoffIssues` flag

### UI Components

**New:** `CutoffStatusBanner.tsx` (buyer-facing)
- Shows per-market availability (open/closed/closing soon)
- Color-coded: green (open), yellow (closing soon), red (closed)
- Auto-refreshes every minute

**New:** `ListingCutoffStatus.tsx` (vendor-facing)
- Small status indicator on vendor listing cards
- Shows accepting/closing/closed status

**Modified:** `AddToCartButton.tsx`
- `ordersClosed` prop disables button when past cutoff
- Shows "Orders Closed" text when disabled

### Commits
- `03fadcc` - Add market listing cutoff feature with per-market availability
- `ab20853` - Fix migration: use market_type column instead of type

---

## Feature 2: Market Profile Pages & Markets Experience

### Problem
Users want to shop at one market per weekend. Need a way to discover markets and see which vendors will be there.

### Design Decisions
- **Traditional markets only** in markets list (private pickup excluded)
- **Private pickup** discovered via vendor profiles instead
- Market profile shows **vendor list** (not cards) with category tags
- Vendor names link to vendor profiles (not individual listings)

### Files Changed

**Markets List Page** (`/[vertical]/markets/page.tsx`)
- Shows only traditional markets (`.eq('market_type', 'traditional')`)
- Engaging card grid layout
- Responsive: 1 → 2 → 3 → 4 columns
- Removed type filter (was: traditional/private_pickup)

**Market Filters** (`MarketFilters.tsx`)
- Simplified: only search and city filters
- Uses design tokens for consistent styling

**Market Card** (`MarketCard.tsx`)
- Enhanced with prominent "Next Market" date/time display
- Shows vendor count, distance badge
- Uses `market_type` field (not `type`)

**Markets With Location** (`MarketsWithLocation.tsx`)
- Forces `type: 'traditional'` in nearby markets API call
- Responsive grid with CSS classes

**Market Profile Page** (`/[vertical]/markets/[id]/page.tsx`)
- Complete redesign following vendor profile pattern
- Header card: market name, badge, description, location, schedule, contact
- Meta info: vendor count, next market date
- Vendors section with category filter

**New:** `MarketVendorsList.tsx` (client component)
- Interactive vendor list with category filter dropdown
- Each row: vendor avatar, name (link), category tags
- Hover effects for clickable rows

**New API:** `GET /api/markets/[id]/vendors-with-listings`
- Returns vendors with published listings at this market
- Aggregates categories from their listings
- Returns `vendors[]` and `categories[]` for filtering

**Header Navigation** (`Header.tsx`)
- Added "Markets" link after "Browse Products"
- Both desktop and mobile navigation

**Vendor Profile** (`/[vertical]/vendor/[vendorId]/profile/page.tsx`)
- Added prominent private pickup callout box
- Shows when vendor has private pickup location
- Displays pickup address and description
- Yellow/amber styling to stand out

### Commits
- `c72ce9d` - Add market profile pages and enhance markets experience

---

## Key Files Reference

### Cutoff Feature
```
supabase/migrations/20260119_002_market_listing_cutoff.sql
apps/web/src/app/api/listings/[id]/availability/route.ts
apps/web/src/app/api/checkout/session/route.ts
apps/web/src/app/api/cart/validate/route.ts
apps/web/src/components/listings/CutoffStatusBanner.tsx
apps/web/src/components/listings/ListingPurchaseSection.tsx
apps/web/src/components/vendor/ListingCutoffStatus.tsx
apps/web/src/components/cart/AddToCartButton.tsx
```

### Market Pages
```
apps/web/src/app/[vertical]/markets/page.tsx
apps/web/src/app/[vertical]/markets/MarketFilters.tsx
apps/web/src/app/[vertical]/markets/[id]/page.tsx
apps/web/src/app/[vertical]/markets/[id]/MarketVendorsList.tsx
apps/web/src/app/api/markets/[id]/vendors-with-listings/route.ts
apps/web/src/components/markets/MarketCard.tsx
apps/web/src/components/markets/MarketsWithLocation.tsx
apps/web/src/components/layout/Header.tsx
apps/web/src/app/[vertical]/vendor/[vendorId]/profile/page.tsx
```

---

## Testing Notes

### Cutoff Feature
1. Create a listing at a traditional market with upcoming schedule
2. Verify cutoff banner shows on listing page
3. Test checkout blocking when past cutoff
4. Verify vendor dashboard shows cutoff status

### Market Pages
1. Navigate to `/[vertical]/markets` - should see card grid
2. Verify only traditional markets shown (no private pickup)
3. Click market card - opens profile with vendor list
4. Filter vendors by category
5. Click vendor name - goes to vendor profile
6. Check "Markets" link in header (desktop + mobile)
7. Visit vendor with private pickup - verify callout displays

---

## Database Migration Required

The cutoff feature requires running the migration on any environment:
```bash
supabase db push
```
Or apply `20260119_002_market_listing_cutoff.sql` via Supabase dashboard.

**Already applied to:** dev, staging

---

## Next Steps / Future Considerations

1. Add order status indicator to market cards (accepting/closed)
2. Consider showing cutoff countdown on market profile
3. Add market favorites/following for buyers
4. Email notifications before market cutoff
