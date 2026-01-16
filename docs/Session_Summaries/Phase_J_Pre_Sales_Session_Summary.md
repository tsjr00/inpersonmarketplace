# Phase J: Pre-Sales Order Flow Session Summary

**Date:** 2026-01-16
**Duration:** ~2 hours
**Branch:** main
**Status:** Complete

---

## Overview

Built the complete pre-sales order management system including buyer/vendor handoff confirmation, cancellation flows, and automatic order expiration.

---

## What Was Built

### J-1: Buyer Pickup Confirmation & Vendor Fulfillment

**Database Changes:**
- `buyer_confirmed_at` - timestamp when buyer confirms receipt
- `pickup_confirmed_at` - renamed from original field for clarity
- RLS policy for buyers to update their own order items

**API Endpoints:**
- `POST /api/buyer/orders/[id]/confirm` - Buyer confirms pickup receipt
- `POST /api/vendor/orders/[id]/fulfill` - Vendor marks item as fulfilled

**UI Components:**
- Prominent order numbers on buyer orders list
- Prominent order numbers on vendor OrderCard
- Vendor Pickup Mode page (`/[vertical]/vendor/pickup`) - mobile-friendly for market day

**Flow:**
1. Vendor marks item "Ready for Pickup"
2. Buyer picks up at market
3. Vendor marks "Fulfilled" (their half complete)
4. Buyer confirms receipt (their half complete)
5. Order item status → "completed" when both confirmed

---

### J-2: Cancellation Flow

**Database Changes:**
- `cancelled_at` - timestamp of cancellation
- `cancelled_by` - enum: 'buyer' | 'vendor' | 'system'
- `cancellation_reason` - text explanation
- `refund_amount_cents` - amount to refund

**API Endpoints:**
- `POST /api/buyer/orders/[id]/cancel` - Buyer cancels (only before vendor confirms)
- `POST /api/vendor/orders/[id]/reject` - Vendor rejects ("Can't Fulfill")

**Business Rules:**
- Buyers can only cancel items with status = 'pending'
- Vendors can reject any time before fulfillment
- Vendors must provide a reason
- Partial fulfillment supported (some items cancelled, others fulfilled)
- Order completes when all non-cancelled items are fulfilled

---

### J-3: Notification Infrastructure & Order Expiration

**Notification Service** (`src/lib/notifications/index.ts`):
- Stubbed service that logs to console (ready for email integration)
- Templates for 7 notification types:
  - `order_placed` - notify vendor
  - `order_confirmed` - notify buyer
  - `order_ready` - notify buyer
  - `order_fulfilled` - notify buyer
  - `order_cancelled_buyer` - notify vendor
  - `order_cancelled_vendor` - notify buyer
  - `order_expired` - notify buyer
- Helper functions for each notification type

**Database Changes:**
- `pickup_date` - expected pickup date at market
- `market_id` - FK to markets table for pickup location
- `expires_at` - calculated expiration timestamp
- Trigger auto-calculates `expires_at` from `pickup_date - 18 hours`
- Index for efficient expiration queries

**Cron Endpoint** (`/api/cron/expire-orders`):
- Finds expired items (past expires_at, status=pending, not cancelled)
- Marks as cancelled by 'system' with reason
- Updates order status if all items cancelled
- Sends buyer notification
- Protected by CRON_SECRET header

**Vercel Configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/expire-orders",
      "schedule": "0 6 * * *"
    }
  ]
}
```

**Passive Expiration Checks:**
- Added `expires_at` and `is_expired` to buyer orders list API
- Added `expires_at` and `is_expired` to buyer order detail API
- Added `expires_at` and `is_expired` to vendor orders API

---

## Migrations Created

| File | Purpose |
|------|---------|
| `20260116_003_buyer_pickup_confirmation.sql` | buyer_confirmed_at field + RLS |
| `20260116_004_order_cancellation_support.sql` | Cancellation tracking fields |
| `20260116_005_order_expiration.sql` | pickup_date, expires_at, trigger |

**Also applied (from earlier in session):**
| File | Purpose |
|------|---------|
| `20260116_001_add_user_verticals.sql` | Multi-vertical support for buyers |
| `20260116_002_add_buyer_tier.sql` | Buyer premium tier (free/premium) |

---

## Files Created/Modified

### New Files
- `src/lib/notifications/index.ts` - Notification service
- `src/app/api/cron/expire-orders/route.ts` - Expiration cron endpoint
- `src/app/api/buyer/orders/[id]/cancel/route.ts` - Buyer cancellation
- `src/app/api/buyer/orders/[id]/confirm/route.ts` - Buyer pickup confirm
- `src/app/api/vendor/orders/[id]/reject/route.ts` - Vendor rejection
- `src/app/[vertical]/vendor/pickup/page.tsx` - Vendor pickup mode UI
- `vercel.json` - Cron configuration

### Modified Files
- `src/app/api/buyer/orders/route.ts` - Added expiration fields
- `src/app/api/buyer/orders/[id]/route.ts` - Added expiration fields
- `src/app/api/vendor/orders/route.ts` - Added expiration fields
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` - Updated flow
- `supabase/migrations/MIGRATION_LOG.md` - Updated with new migrations

---

## Environment Setup Required

1. **Supabase:** Run all 5 migrations (20260116_001 through 005)
2. **Vercel:** Add `CRON_SECRET` environment variable
3. **Vercel:** Redeploy to activate cron job

---

## Testing Notes

- Build passes with no TypeScript errors
- Cron runs daily at 6am UTC
- Notifications currently log to console (swap in email service when ready)
- Expiration calculated as pickup_date 8am minus 18 hours (e.g., Saturday 8am pickup → Friday 2pm expiration)

---

## Known Limitations

1. **Email notifications stubbed** - Logs to console, needs Resend/SendGrid integration
2. **Stripe refunds not implemented** - TODO comment in cron endpoint
3. **QR codes skipped** - User decided not to implement for now
4. **pickup_date must be set at checkout** - Existing orders won't have expiration

---

## Next Steps (Future Sessions)

1. Integrate email service (Resend recommended)
2. Implement Stripe refund on cancellation/expiration
3. Add pickup_date selection to checkout flow
4. UI for displaying expiration warnings to vendors
5. Test full order lifecycle in production

---

## Session Notes

- Fixed enum issue: `order_item_status` only has 'pending', not 'paid' (payment status is on order level)
- Fixed missing column: `pickup_date` wasn't in original schema, added in expiration migration
- User confirmed expiration should be based on pickup/market date, not order date
- User confirmed QR codes don't add enough value to implement now
