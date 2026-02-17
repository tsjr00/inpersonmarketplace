# Current Task: Food Truck Terminology, Icons, Categories, Radius

Started: 2026-02-17
Status: COMPLETE — All 4 phases done, TypeScript clean

## What Was Done

Full parameterization of the food truck vertical: replaced all hardcoded farmers-market language, agriculture emojis, fixed radius options, and categories with vertical-aware `term()` calls.

### Phase 1: Config + Types + Categories (6 files)
- `types.ts` — Added 9 new TerminologyKey entries + `radiusOptions` to config interface
- `food-trucks.ts` — Added all new term values, changed "Regular Stop" → "Service Location", added `radiusOptions: [2, 5, 10, 25]`
- `farmers-market.ts` — Added matching FM defaults for all new keys
- `constants.ts` — Added `FOOD_TRUCK_CATEGORIES` (11 cuisine types)
- `terminology.ts` — Added `getRadiusOptions()` helper
- `index.ts` — Exported `getRadiusOptions`

### Phase 2: Parameterize Hardcoded Text (~15 files)
- `vendors/page.tsx` — h1 + subtitle use `term()`
- `VendorsWithLocation.tsx` — ~8 vendor instances, empty state emoji, loading text
- `BrowseToggle.tsx` — tab labels parameterized
- `browse/page.tsx` — subtitle, Market Box references, descriptions
- `dashboard/page.tsx` — Browse Products, vendor section, Market Box references
- `how-it-works/page.tsx` — vendor, booth, market day references
- `vendor/market-boxes/page.tsx` — Market Box headings and buttons
- `buyer/subscriptions/page.tsx` — Market Box references
- `MarketBoxDetailClient.tsx` — Market box, vendor emoji
- `features/page.tsx` — For Vendors section emoji
- `MarketsWithLocation.tsx` — empty state emoji and text
- `LocationEntry.tsx` — "local vendors near you"
- `RateOrderCard.tsx` — "local vendors"
- `ListingForm.tsx` — FOOD_TRUCK_CATEGORIES branch

### Phase 3: Emoji Updates (5 files)
- `AdminNav.tsx` — 🧺→`term('market_icon_emoji')`, 🧑‍🌾→`term('vendor_icon_emoji')`
- `TutorialModal.tsx` — 🧺→`term('market_icon_emoji')` on Find Markets slide
- `vendor/dashboard/page.tsx` — 🧺→`term('market_icon_emoji')`, "Market Boxes"→`term('market_boxes')`
- `markets/[id]/page.tsx` — 🧺→`term('market_icon_emoji')` in header
- `admin/page.tsx` — 🧺→`term('market_icon_emoji')`, 🧑‍🌾→`term('vendor_icon_emoji')`, "farmers markets"→`term('traditional_markets')`, "Market Boxes"→`term('market_boxes')`

### Phase 4: Per-Vertical Radius Options (6 files)
- `LocationSearchInline.tsx` — Added `radiusOptions` prop (default: [10, 25, 50, 100])
- `VendorsWithLocation.tsx` — Accepts + passes `radiusOptions`
- `MarketsWithLocation.tsx` — Accepts + passes `radiusOptions`
- `vendors/page.tsx` — Passes `getRadiusOptions(vertical)`, widened VALID_RADIUS_OPTIONS to [2,5,10,25,50,100]
- `markets/page.tsx` — Passes `getRadiusOptions(vertical)`, widened VALID_RADIUS_OPTIONS
- `buyer/location/route.ts` — Widened VALID_RADIUS_OPTIONS to superset [2,5,10,25,50,100]

## TypeScript: CLEAN (0 errors)

## Git State
- Branch: main
- NOT committed yet — all changes are local
- main is 4 commits ahead of origin/main (prior sessions)
