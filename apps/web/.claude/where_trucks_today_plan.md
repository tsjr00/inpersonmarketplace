# Feature: Where Are Trucks Today?

Created: 2026-03-19 (Session 61)
Status: Planning — not started
Estimated effort: 1 session

## The Problem

In Amarillo (and most cities), buyers find food trucks by scrolling through a Facebook group. Vendors post daily — repetitive for them, inefficient for buyers. Our platform already has vendor schedules but doesn't surface them in a "what's happening today?" view.

## The Value

- **Buyers**: One tap to see every truck operating near them today, with location + hours. Replaces Facebook group scrolling.
- **Vendors**: Set schedule once, buyers find them automatically. No daily social media posting.
- **Platform**: High-traffic feature that drives daily engagement. "Where are trucks today?" is the #1 question food truck fans ask.

## What We Build

### 1. "Where Today" Page (`/food_trucks/where-today`)

**Input:**
- User location from cookie (or zip prompt if no location set)
- Distance filter (default 25mi, adjustable with radius pills — same as browse)
- Date toggle: Today / Tomorrow / This Week

**Output:**
- Grouped by day (if showing multiple days)
- Each entry shows:
  - Truck name (links to vendor profile)
  - Location name + address (tappable → opens maps)
  - Hours (start_time — end_time)
  - Profile image thumbnail (if available)
- Empty state: "No trucks scheduled near you today. Check back tomorrow!"

**Query logic:**
```sql
SELECT
  vms.day_of_week, vms.vendor_start_time, vms.vendor_end_time,
  m.name as location_name, m.address, m.city, m.state, m.latitude, m.longitude,
  vp.profile_data->>'business_name' as truck_name, vp.profile_image_url
FROM vendor_market_schedules vms
JOIN markets m ON m.id = vms.market_id
JOIN vendor_profiles vp ON vp.id = vms.vendor_profile_id
WHERE vms.day_of_week = EXTRACT(DOW FROM CURRENT_DATE)  -- or parameterized
  AND vms.active = true
  AND m.status = 'active'
  AND vp.status = 'approved'
  AND vp.vertical_id = 'food_trucks'
  -- Distance filter via Haversine or PostGIS
ORDER BY vms.vendor_start_time
```

**Existing code to reuse:**
- Location cookie reading: `LOCATION_COOKIE_NAME` from `src/lib/location/server.ts`
- Distance filtering: PostGIS `get_listings_within_radius` pattern or JS Haversine
- Radius pills: `BrowseLocationPrompt` / `LocationSearchInline`
- Maps link: `getMapsUrl()` from `src/lib/utils/maps-link.ts`

### 2. Dashboard Card (Buyer Dashboard)

**Location:** `src/app/[vertical]/dashboard/page.tsx` — new card in the existing grid

**Shows:**
- "Where are trucks today?" heading
- Count: "X trucks near you today"
- "See schedule →" link to the full page
- Only shows for food_trucks vertical

**Query:** Same as above but just COUNT, filtered by user's location from profile or cookie.

### 3. Landing Page CTA

**Location:** `src/components/landing/` — add a prominent button/section

**Text:** "Find Food Trucks Near You Right Now"
**Action:** Links to `/food_trucks/where-today`
**Placement:** Above the footer, or in the hero area as a secondary CTA

## Data Dependencies

All data already exists:
- `vendor_market_schedules` — day_of_week, start/end times, active flag
- `markets` — location name, address, lat/lng
- `vendor_profiles` — business name, profile image, status, vertical_id

No new tables or migrations needed.

## API Endpoint

`GET /api/trucks/where-today?lat=X&lng=Y&radius=25&date=today`

Returns:
```json
{
  "date": "2026-03-19",
  "day_of_week": "Wednesday",
  "trucks": [
    {
      "vendor_id": "...",
      "truck_name": "Smokestack BBQ",
      "profile_image_url": "...",
      "location_name": "Downtown Food Truck Park",
      "address": "123 Main St, Amarillo, TX",
      "start_time": "11:00",
      "end_time": "14:00",
      "distance_miles": 2.3
    }
  ],
  "total": 5
}
```

## FM Equivalent

For farmers_market vertical, the same feature works as "What markets are open today?" — shows markets with their schedules instead of individual trucks. Same query structure, different terminology via `term()`.

## Implementation Order

1. API endpoint (query + distance filter)
2. Page UI (list view, grouped by day)
3. Dashboard card (count + link)
4. Landing page CTA
5. FM equivalent (if desired)

## Why This Wins

The Facebook group model has one advantage: community feel. Everything else is worse — unstructured, requires daily vendor effort, no location filtering, no schedule reliability. This feature takes the one thing people go to the Facebook group for ("where are trucks today?") and does it better. If we nail this, it's the hook that gets both buyers and vendors onto the platform.
