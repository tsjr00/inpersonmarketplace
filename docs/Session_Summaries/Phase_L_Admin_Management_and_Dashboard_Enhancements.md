# Phase L: Admin Management & Dashboard Enhancements

## Session Date: January 20, 2026

## Overview
This session implemented a comprehensive admin management system and enhanced the buyer dashboard with prominent "Ready for Pickup" notifications.

---

## 1. Admin Management System

### New Database Schema (Migration: `20260120_009_admin_management.sql`)

**`is_chief_platform_admin`** - Added to `user_profiles` table
- Boolean flag for chief platform admin status
- Chief platform admin: tsjr00@gmail.com

**`vertical_admins`** - New table for vertical-specific admin assignments
- `user_id` - The admin user
- `vertical_id` - Which vertical they can manage
- `is_chief` - Chief vertical admins can manage other vertical admins
- `granted_by` - Who granted the access
- `granted_at` - When access was granted

**`admin_activity_log`** - Audit trail for admin actions
- Tracks all admin grants/revokes
- Records who performed actions and when

### Admin Hierarchy
```
Chief Platform Admin
    └── Can add/remove any platform admin
    └── Can add/remove any vertical admin (including chiefs)

Platform Admin
    └── Can add/remove non-chief platform admins
    └── Can add/remove vertical admins

Chief Vertical Admin
    └── Can add/remove non-chief vertical admins for their vertical

Vertical Admin
    └── Can manage content within their vertical only
```

### API Endpoints Created

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/admins` | GET | List all platform admins |
| `/api/admin/admins` | POST | Add new platform admin |
| `/api/admin/admins/[userId]` | DELETE | Remove platform admin |
| `/api/admin/verticals/[verticalId]/admins` | GET | List vertical admins |
| `/api/admin/verticals/[verticalId]/admins` | POST | Add vertical admin |
| `/api/admin/verticals/[verticalId]/admins/[adminId]` | DELETE | Remove vertical admin |

### UI Pages Created

- **`/admin/admins`** - Platform admin management
- **`/[vertical]/admin/admins`** - Vertical admin management

Both pages feature:
- List of current admins with role badges (Chief Admin / Admin)
- Add admin form with email input
- Option to make chief (platform admin only)
- Remove button with confirmation
- Info box explaining permissions

---

## 2. Buyer Dashboard Enhancement: Ready for Pickup

### Problem Solved
Buyers need to see at-a-glance which orders are ready for pickup, especially for multi-vendor orders where items may be ready at different times and locations.

### Solution
Added a prominent green "Ready for Pickup!" section at the top of the buyer dashboard.

### Features
- Shows up to 3 orders with items in "ready" status
- Groups items by vendor + pickup location
- Displays:
  - Order number
  - Item count ready
  - Vendor name (farm/business name)
  - Item titles
  - Pickup location with icon (🏪 market / 🏠 private pickup)
  - Pickup date
- Clickable cards link directly to order details
- "View all ready orders" link

### Multi-Vendor Order Handling
- Each `order_item` has its own `vendor_profile_id` and status
- Vendors confirm their items independently
- Buyers see exactly which items from which vendors are ready
- Different pickup locations are clearly distinguished

### Order Status Flow
```
pending/paid → confirmed → ready → fulfilled
                  ↑            ↑
            Vendor          Vendor
          acknowledges    marks ready
```

---

## 3. Bug Fixes

### Column Name Mismatch
Fixed `total_amount_cents` → `total_cents` across multiple files:
- `/api/buyer/orders/[id]/route.ts`
- `/api/vendor/orders/route.ts`
- `/[vertical]/checkout/success/page.tsx`

This was causing "Order not found" errors when viewing order details.

### Admin Role Check
Fixed API endpoints to accept both `'admin'` and `'platform_admin'` roles:
- Platform admins with `role = 'platform_admin'` were getting "Admin access required" errors
- Updated all 4 admin API endpoints

### React Key Warning
Fixed unique key warning in order detail page by using `Object.entries()` instead of `Object.values()` for market grouping.

---

## 4. UX Improvements

### Password Visibility Toggle
Added show/hide password toggle (eye icon) to:
- Login page - single password field
- Signup page - both password and confirm password fields

Users can click 👁 to reveal password, shows 🙈 when visible.

---

## 5. Files Modified/Created

### New Files
- `supabase/migrations/20260120_009_admin_management.sql`
- `apps/web/src/app/api/admin/admins/route.ts`
- `apps/web/src/app/api/admin/admins/[userId]/route.ts`
- `apps/web/src/app/api/admin/verticals/[verticalId]/admins/route.ts`
- `apps/web/src/app/api/admin/verticals/[verticalId]/admins/[adminId]/route.ts`
- `apps/web/src/app/admin/admins/page.tsx`
- `apps/web/src/app/[vertical]/admin/admins/page.tsx`

### Modified Files
- `apps/web/src/app/admin/page.tsx` - Added admin management quick action
- `apps/web/src/app/[vertical]/admin/page.tsx` - Added admin management card
- `apps/web/src/app/[vertical]/dashboard/page.tsx` - Ready for pickup section
- `apps/web/src/app/[vertical]/login/page.tsx` - Password visibility toggle
- `apps/web/src/app/[vertical]/signup/page.tsx` - Password visibility toggle
- `apps/web/src/app/api/buyer/orders/[id]/route.ts` - Fixed column name
- `apps/web/src/app/api/vendor/orders/route.ts` - Fixed column name
- `apps/web/src/app/[vertical]/checkout/success/page.tsx` - Fixed column name
- `apps/web/src/app/[vertical]/buyer/orders/[id]/page.tsx` - Fixed React key warning

---

## 6. Migrations to Run

```bash
# Run in order:
20260120_008_add_market_description.sql  # Adds description/website to markets
20260120_009_admin_management.sql        # Admin management schema
```

---

## 7. Testing Notes

- Test orders show on buyer side for the account that placed them
- Vendor orders require matching `vendor_profile_id` on order_items
- Ready for pickup section only shows items with status = 'ready' (vendor confirmed ready)
- Admin management requires running the migration first

---

## Next Steps / Pending Items

1. Test vendor order view with proper test data
2. Consider adding similar "needs attention" alert on vendor dashboard
3. Run migrations on staging environment
4. Test admin management workflow end-to-end
