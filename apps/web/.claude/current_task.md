# Current Task: Event Shopping Page — Cart Validation Blocked
Started: 2026-03-30

## Status: BLOCKED — validate_cart_item_schedule rejects event dates

### The Problem
The event shopping page (`/events/[token]/shop`) is built and working — vendors and listings display correctly. But when a buyer clicks "Add to Cart", the cart API calls `validate_cart_item_schedule(listing_id, schedule_id, pickup_date)` which returns FALSE for event dates.

The function generates valid pickup dates based on `market_schedules.day_of_week` and cutoff rules designed for recurring weekly markets. Events are one-time dates that don't follow the recurring pattern. The function needs to handle `market_type = 'event'` differently.

### What's Been Verified
- Event shop page renders vendors + listings correctly
- Auth works (user is logged in)
- `listing_markets` rows exist for event listings (SQL backfilled + code inserts on vendor accept)
- Cart API receives correct data: `marketId`, `scheduleId`, `pickupDate` (2026-04-11)
- `validate_cart_item_schedule('ee300000-0301-4000-8000-000000000001', 'c8a55720-fc01-42b7-b546-d520622f6392', '2026-04-11')` returns FALSE
- Market schedule exists: id=c8a55720, market_id=6e328bc0, day_of_week=6, start=17:00, end=20:00, active=true
- Event date April 11, 2026 IS a Saturday (day_of_week=6), so the day matches

### Next Step
Read and understand `validate_cart_item_schedule` function in the database. It likely:
1. Calls or mirrors `get_available_pickup_dates` logic
2. Checks if pickup_date is within the market's valid date range
3. May have a max-days-ahead limit that excludes the event date
4. May not handle event markets at all

The fix will be in the SQL function, not in app code. Need to check:
```sql
SELECT prosrc FROM pg_proc WHERE proname = 'validate_cart_item_schedule';
```

### Files Changed This Session (Session 65 continued into 66)
- `apps/web/src/app/events/[token]/shop/page.tsx` — NEW: event shopping page
- `apps/web/src/app/api/events/[token]/shop/route.ts` — NEW: shop data API
- `apps/web/src/middleware.ts` — added 'events' to non-vertical prefixes
- `apps/web/src/app/api/vendor/events/[marketId]/respond/route.ts` — inserts listing_markets on accept
- `apps/web/src/app/api/vendor/events/[marketId]/cancel/route.ts` — deletes listing_markets on cancel
- `apps/web/src/app/api/admin/events/[id]/route.ts` — deletes listing_markets on event completed
- Plus ~30 other files from Session 65 work (see session65_summary.md)

### Key Data for Testing
- Event token: `chef-prep-caapg2`
- Market ID: `6e328bc0-2704-49b9-a790-6984a26b1a6d`
- Schedule ID: `c8a55720-fc01-42b7-b546-d520622f6392`
- Event date: 2026-04-11
- Test listing: `ee300000-0301-4000-8000-000000000001` (Sample Sourdough Loaf)
- Accepted vendors: ee000000-0003 (Sweet Bee Bakery), ee000000-0001 (Green Acres Farm)
- Shop page URL: https://farmersmarketing.app/events/chef-prep-caapg2/shop

### Backlog Additions from This Session
- Event organizer "My Events" dashboard card
- Event communications remaining FM language (3a, Phase 11, Phase 12)
- 3b threshold logic re-evaluation
- Admin onboarding auto-complete (Option A)
- "Back to event" navigation from checkout
- Event shopping page: success message not showing on add-to-cart
