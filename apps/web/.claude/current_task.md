# Current Task: Market Box Integration into Buyer Orders
Started: 2026-02-07
Last Updated: 2026-02-07

## Goal
Unify market box purchases into the buyer orders list so buyers see both regular orders and market box purchases in one place.

## What Was Completed (Session 9)

### Market Box → Buyer Orders Integration (NOT YET COMMITTED)
- **`src/app/api/buyer/orders/route.ts`** — Added parallel `market_box_subscriptions` query, transforms into unified order shape with `type: 'market_box'` discriminator, merges with regular orders
- **`src/app/[vertical]/buyer/orders/page.tsx`** — Added `market_box` fields to Order interface, `renderMarketBox()` with teal badge + progress bar, `renderItem` dispatcher

### Status Mapping
| Subscription State | Pickup State | Mapped Status | Orders Section |
|---|---|---|---|
| active | Any pickup is `ready` | `ready` | Ready for Pickup |
| active | No ready pickups | `confirmed` | In Progress |
| completed | — | `fulfilled` | Completed |
| cancelled | — | `cancelled` | Cancelled |

### Key Design Decisions
- Market box `total_paid_cents` already includes buyer fee — NOT recalculated
- Order number generated as `MB-XXXXXX` from subscription UUID
- Clicking market box card → navigates to existing `/buyer/subscriptions/[id]` detail page
- Both queries run with `Promise.all` (no added latency)
- Market boxes populate `marketsMap` for the filter dropdown
- Status filter: applied at DB level for regular orders, JS level for market boxes

### Session 8 Completed Items
- Three-tier environment setup (dev/staging/production)
- Resend (email) integration → `service.ts` with HTML template
- Twilio (SMS) integration → `service.ts` with lazy-init client
- A2P 10DLC registration initiated (pending carrier approval)
- Branch cleanup (10 stale branches deleted)
- Supabase cost optimization (deleted 2 unused projects)

## Pending Items
- [ ] Commit market box integration changes
- [ ] Test on staging with user that has both regular orders and market boxes
- [ ] A2P 10DLC campaign approval (waiting on Twilio/carrier review)
- [ ] Test email notifications on staging
- [ ] Production data seeding (sign up, promote to platform_admin)

## Files Modified This Session
- `src/app/api/buyer/orders/route.ts` — Market box query + merge
- `src/app/[vertical]/buyer/orders/page.tsx` — Market box card rendering

## User Preferences
- Direct communication, verify before acting
- Budget-conscious but willing to invest strategically
- Ready for Pickup must stay at top of buyer dashboard
