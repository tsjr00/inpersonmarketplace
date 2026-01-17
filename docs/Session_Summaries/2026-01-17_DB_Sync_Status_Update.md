# Database Sync Status Update

**For:** Chet
**Date:** January 17, 2026
**Purpose:** Database environment synchronization status and recent work summary

---

## Current Database Status

### Environment Sync: COMPLETE

Both **Dev** and **Staging** environments are now fully synchronized as of January 17, 2026.

| Environment | Status | Last Synced |
|-------------|--------|-------------|
| Dev | ✅ Current | January 17, 2026 |
| Staging | ✅ Current | January 17, 2026 |
| Prod | ⏳ Pending | Needs Phase J + Phase R migrations |

---

## Migrations Applied (Dev & Staging)

### Phase J Migrations (January 16, 2026)
| Migration | Purpose |
|-----------|---------|
| `20260116_001_add_user_verticals.sql` | Tracks which verticals buyers have signed up with |
| `20260116_002_add_buyer_tier.sql` | Buyer premium membership system (free/premium) |
| `20260116_003_buyer_pickup_confirmation.sql` | Two-way handoff confirmation for orders |
| `20260116_004_order_cancellation_support.sql` | Cancellation tracking with refund support |
| `20260116_005_order_expiration.sql` | Order expiration based on pickup date |
| `20260116_006_market_box_foundation.sql` | Market Box subscription tables (offerings, subscriptions, pickups) |

### Phase R Migration (January 17, 2026)
| Migration | Purpose |
|-----------|---------|
| `20260117_001_add_home_market_id.sql` | Home market concept for standard vendor tier enforcement |

---

## Schema Changes Summary

### user_profiles (new columns)
- `verticals` - TEXT[] - Array of vertical IDs user has signed up with
- `buyer_tier` - TEXT - 'free' or 'premium' membership
- `buyer_tier_expires_at` - TIMESTAMPTZ - Premium expiration date
- `stripe_subscription_id` - TEXT - Stripe subscription tracking

### order_items (new columns)
- `buyer_confirmed_at` - TIMESTAMPTZ - Buyer pickup confirmation
- `cancelled_at` - TIMESTAMPTZ - Cancellation timestamp
- `cancelled_by` - TEXT - Who cancelled (buyer/vendor/system)
- `cancellation_reason` - TEXT - Reason for cancellation
- `refund_amount_cents` - INTEGER - Refund amount
- `pickup_date` - DATE - Expected pickup date
- `market_id` - UUID - Pickup market reference
- `expires_at` - TIMESTAMPTZ - Order expiration time

### vendor_profiles (new columns)
- `home_market_id` - UUID - Standard vendor's designated home market

### New Tables (Market Box System)
- `market_box_offerings` - Vendor's 4-week subscription box products
- `market_box_subscriptions` - Buyer's purchased subscriptions
- `market_box_pickups` - Weekly pickup tracking (4 per subscription)

---

## Phase R - Market Limits & Tier Enforcement (Completed)

### Tier Limits Now Enforced

| Feature | Standard | Premium |
|---------|----------|---------|
| Traditional Markets | 1 (home market only) | 4 |
| Private Pickup Locations | 1 | 5 |
| Total Market Boxes | 2 | 6 |
| Active Market Boxes | 1 | 4 |
| Product Listings | 5 | 10 |

### Key Features Implemented
1. **Home Market Concept** - Standard vendors limited to one traditional market
2. **Centralized Limit Enforcement** - All limits checked via `src/lib/vendor-limits.ts`
3. **Activation Bypass Fix** - Can't circumvent limits by deactivating/reactivating
4. **UI Indicators** - Home market shown with 🏠, restricted markets grayed out

### Files Created/Modified
- `src/lib/vendor-limits.ts` - Centralized tier limits utility (new)
- `src/app/api/vendor/home-market/route.ts` - Home market API (new)
- Multiple vendor pages updated for limit enforcement

---

## Production Migration Notes

When ready to deploy to Production, run migrations in this order:

1. Phase J migrations (20260116_001 through 20260116_006)
2. Phase R migration (20260117_001)

**Important:** The home market migration (20260117_001) references `market_box_offerings` table, so Phase J migrations must run first.

A combined staging migration file exists at: `supabase/STAGING_CATCHUP_2026-01-17.sql` (can be adapted for Prod)

---

## Verification Queries

Use these to verify schema matches between environments:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Check user_profiles columns
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'user_profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check order_items columns
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'order_items' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check vendor_profiles columns
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'vendor_profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check market box tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'market_box%';
```

---

## New Workflow: Migration Sync Process

Going forward, migrations will be applied to both Dev and Staging immediately:

1. Migration created and tested
2. Run on Dev → Confirm success
3. **Immediately run on Staging** → Confirm success
4. Continue with development work

This prevents environment drift and ensures both environments stay in sync.

---

*End of Status Update - January 17, 2026*
