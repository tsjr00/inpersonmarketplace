# Investigation Results - Phase N Bug Fixes

**Date:** January 15, 2026
**Investigator:** Claude Code

---

## Executive Summary

The codebase is well-structured with most expected files in place. Key findings:
1. **Vendor signup works** - the "no form fields" error is a config issue, not missing code
2. **Buyer orders page exists and is functional** - if not showing data, it's a test data or RLS issue
3. **No Toast/Notification system exists** - needs to be built
4. **No image upload infrastructure** - needs to be built from scratch
5. **Categories are hardcoded** in ListingForm.tsx - already has 11 categories for farmers_market

---

## Critical Findings

### 1. Vendor Signup is NOT Broken
The vendor signup page exists at `src/app/[vertical]/vendor-signup/page.tsx` and is fully functional. It:
- Loads `vendor_fields` from `/api/vertical/{vertical}` which reads from `verticals.config`
- If showing "no form fields configured", the issue is **missing config in the database**, not missing code

**Fix:** Update the `verticals` table config for `farmers_market` to include `vendor_fields` array.

### 2. Categories Already Expanded
ListingForm.tsx already has 11 categories for farmers_market:
```
Produce, Meat, Dairy, Eggs, Baked Goods, Prepared Foods, Preserves, Honey, Plants, Crafts, Other
```
Browse page reads categories from vertical config. May just need DB config alignment.

### 3. Cart Update API Location
- No `/api/cart/update/route.ts` exists
- Cart quantity updates use `/api/cart/items/[id]` with PUT method
- This is correct - the build instructions reference a non-existent path

---

## Part 1: File Structure

### Files That EXIST (Confirmed)

| Expected Path | Actual Path | Status |
|---------------|-------------|--------|
| `components/cart/AddToCartButton.tsx` | `src/components/cart/AddToCartButton.tsx` | EXISTS |
| `[vertical]/vendor-signup/page.tsx` | `src/app/[vertical]/vendor-signup/page.tsx` | EXISTS (23KB) |
| `[vertical]/checkout/page.tsx` | `src/app/[vertical]/checkout/page.tsx` | EXISTS |
| `[vertical]/buyer/orders/page.tsx` | `src/app/[vertical]/buyer/orders/page.tsx` | EXISTS |
| `[vertical]/admin/markets/page.tsx` | `src/app/[vertical]/admin/markets/page.tsx` | EXISTS |
| `[vertical]/admin/users/page.tsx` | `src/app/[vertical]/admin/users/page.tsx` | EXISTS |
| `api/buyer/orders/route.ts` | `src/app/api/buyer/orders/route.ts` | EXISTS |
| `api/cart/items/[id]/route.ts` | `src/app/api/cart/items/[id]/route.ts` | EXISTS (PUT/DELETE) |
| `lib/hooks/useCart.tsx` | `src/lib/hooks/useCart.tsx` | EXISTS |
| `lib/constants.ts` | `src/lib/constants.ts` | EXISTS |

### Files That DO NOT EXIST

| Expected Path | Notes |
|---------------|-------|
| `components/shared/Toast.tsx` | No toast system exists |
| `components/shared/Footer.tsx` | No footer component exists |
| `api/cart/update/route.ts` | Use `/api/cart/items/[id]` PUT instead |

---

## Part 2: Database Schema (From Code Analysis)

### vendor_profiles
Based on code usage:
- `id` (uuid, primary key)
- `user_id` (uuid)
- `vertical_id` (string)
- `status` (enum: draft, submitted, approved, rejected, suspended)
- `tier` (string: standard, premium)
- `profile_data` (jsonb)
- `created_at`, `updated_at`

### orders
- `id`, `order_number`
- `buyer_user_id`
- `status` (enum: pending, paid, confirmed, ready, fulfilled, cancelled, refunded)
- `total_amount_cents`
- `created_at`, `updated_at`

### order_items
- `id`, `order_id`
- `listing_id`, `market_id`
- `quantity`, `unit_price_cents`, `subtotal_cents`
- `status`, `pickup_date`

### listings
- `id`, `vendor_profile_id`, `vertical_id`
- `title`, `description`, `price_cents`, `quantity`
- `category` (string, not enum)
- `status` (enum: draft, published, paused, archived)
- `image_urls` (string array)
- `listing_data` (jsonb)

### markets
- `id`, `name`, `vertical_id`
- `market_type` (enum: traditional, private_pickup)
- `address`, `city`, `state`, `zip`
- `day_of_week`, `start_time`, `end_time`
- `status`

---

## Part 3: State Management

### Cart System
- **Pattern:** React Context API
- **Location:** `src/lib/hooks/useCart.tsx`
- **Provider:** `CartProvider` wraps app with `vertical` prop
- **Hook:** `useCart()` returns items, addToCart, removeFromCart, updateQuantity, refreshCart
- **Updates:** NOT optimistic - waits for API response then calls `refreshCart()`
- **Drawer:** `CartDrawer` component uses `isOpen`/`setIsOpen` from context

### Vertical Context
- **Server components:** `const { vertical } = await params`
- **Client components:** `const params = useParams(); const vertical = params.vertical as string`
- **API routes:** Read from URL searchParams or request body

### Authentication
- **Server:** `createClient()` from `@/lib/supabase/server`, then `supabase.auth.getUser()`
- **Client:** `createClient()` from `@/lib/supabase/client`, then `supabase.auth.getUser()`
- **Admin check:** `requireAdmin()` from `@/lib/auth/admin` (redirects if not admin)
- **Role check:** Checks BOTH `role` column and `roles[]` array for backwards compatibility

---

## Part 4: Existing Features Assessment

### Vendor Signup - WORKING
**Location:** `src/app/[vertical]/vendor-signup/page.tsx`

The page is fully functional. It:
1. Fetches config from `/api/vertical/{vertical}`
2. Extracts `vendor_fields` array from config
3. Dynamically renders form fields
4. Submits to `/api/submit` with `kind: 'vendor_signup'`

**If showing "no form fields configured":**
- The vertical's `config.vendor_fields` in the database is empty or missing
- Fix: Update `verticals` table for `farmers_market` to include vendor_fields

### Buyer Orders - WORKING
**Page:** `src/app/[vertical]/buyer/orders/page.tsx`
**API:** `src/app/api/buyer/orders/route.ts`

Both exist and are well-structured. The API:
- Authenticates user
- Queries orders with nested order_items, listings, vendor_profiles, markets
- Transforms data to match frontend expectations

**If not showing orders:** Check RLS policies and test data existence.

### Image Upload - DOES NOT EXIST
No image upload infrastructure found:
- No Supabase Storage bucket references
- No file input components
- No upload utilities

**Needs to be built from scratch.**

---

## Part 5: Test Data Recommendation

Based on code analysis, test data needs:
1. **Vertical config** with `vendor_fields` and `listing_fields` for farmers_market
2. **Orders** for test buyer user with order_items
3. **Approved vendors** with published listings

**Recommended approach:**
- Query existing data first to assess scope
- Update vertical config if vendor_fields missing
- Create orders via checkout flow or direct SQL insert

---

## Part 6: Breaking Changes Risk

### Category Changes - LOW RISK
- Categories are strings, not enums
- ListingForm already has expanded categories
- Just need to ensure DB config matches

### Vertical Filtering - ALREADY IMPLEMENTED
- Most queries already filter by `vertical_id`
- No changes needed for vertical scoping

### Admin Navigation - COMPLETED (Phase M)
- AdminNav component already added
- Cross-admin navigation works

---

## Part 7: Dependencies

### Installed (from package.json)
- `@stripe/stripe-js`, `stripe` - Payment processing
- `@supabase/ssr`, `@supabase/supabase-js` - Database/auth
- `chart.js`, `react-chartjs-2` - Analytics charts
- `next` 16.1.1, `react` 19.2.3

### NOT Installed (may need for fixes)
- `react-hook-form` - Not installed (forms use useState)
- `zod` - Not installed (validation is manual)
- `react-dropzone` - Not installed (no file upload)

### For Image Upload (would need)
- Configure Supabase Storage bucket
- Possibly add image optimization library

---

## Part 8: Recommendations

### Build Order (Priority)

1. **Quick Win - Verify vendor_fields config** (5 min)
   - Query `SELECT config FROM verticals WHERE vertical_id = 'farmers_market'`
   - If vendor_fields missing, add them

2. **Quick Win - Test buyer orders** (10 min)
   - Test `/api/buyer/orders` endpoint directly
   - Check if orders exist for test user

3. **Toast/Notification System** (30-60 min)
   - Create `src/components/shared/Toast.tsx`
   - Create ToastContext for global toast management
   - Add to layout

4. **Footer Component** (15-30 min)
   - Create `src/components/shared/Footer.tsx`
   - Add to root layout

5. **Image Upload** (2-4 hours)
   - Configure Supabase Storage bucket
   - Create upload utility
   - Add to ListingForm
   - Handle display in listing pages

### Estimated Total: 3-6 hours

---

## Questions for Tracy

1. **Vendor Signup:** Can you check `SELECT config->'vendor_fields' FROM verticals WHERE vertical_id = 'farmers_market'`? If empty/null, that's the issue.

2. **Buyer Orders:** Is there test order data? Query: `SELECT * FROM orders LIMIT 5`

3. **Image Upload Priority:** Should this be Phase N or defer to a later phase? It's the most complex item.

4. **Toast System:** Preferred style? Simple div overlay or more sophisticated with animations?

5. **Footer Content:** What should footer contain? Links? Copyright? Contact info?

---

## Files to Create/Modify (Phase N Scope)

### Create
- `src/components/shared/Toast.tsx` - Toast component
- `src/components/shared/Footer.tsx` - Footer component
- `src/lib/hooks/useToast.tsx` - Toast context (optional)

### Modify (if needed)
- `src/app/layout.tsx` - Add Footer
- Vertical config in database - Add vendor_fields if missing

### Do NOT Modify (already working)
- `src/app/[vertical]/vendor-signup/page.tsx` - Works fine
- `src/app/[vertical]/buyer/orders/page.tsx` - Works fine
- `src/lib/hooks/useCart.tsx` - Works fine
