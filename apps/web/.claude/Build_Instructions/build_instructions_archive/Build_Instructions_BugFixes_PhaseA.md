# Build Instructions - Testing Bug Fixes Phase A

**Date:** January 10, 2026  
**Priority:** Critical - Blocking core vendor functionality  
**Estimated Time:** 2-3 hours

---

## Overview

Testing revealed 3 critical issues blocking vendor operations:
1. Cannot create new listings (RLS policy error)
2. Cannot edit existing listings (empty error)
3. Orders page fails to load

---

## Pre-Work: Diagnostic Queries

Before fixing, run these in **Dev database** to understand current state:

### Check Listings RLS Policies
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'listings'
ORDER BY cmd, policyname;
```

### Check if listings_select policy includes vendor's own listings
```sql
-- The SELECT policy we created earlier may be missing vendor access to their own unpublished listings
SELECT policyname, qual FROM pg_policies 
WHERE tablename = 'listings' AND cmd = 'SELECT';
```

### Check Orders Table RLS
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY cmd, policyname;
```

### Test Vendor Access
```sql
-- Get a test vendor's info
SELECT 
  vp.id as vendor_profile_id,
  vp.user_id,
  up.email
FROM vendor_profiles vp
JOIN user_profiles up ON vp.user_id = up.user_id
WHERE vp.status = 'approved'
LIMIT 1;
```

---

## Part 1: Fix Listings RLS Policies

### Problem
Vendor cannot INSERT new listings - gets RLS policy violation.

### Root Cause
The INSERT policy likely doesn't properly validate that the vendor_profile_id belongs to the authenticated user.

### Solution

**Run in Dev database, then Staging:**

```sql
-- =============================================================================
-- Fix Listings RLS Policies
-- =============================================================================

-- Drop existing listings policies
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view active listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;

-- SELECT: Vendors see own (any status) + Public sees published from approved vendors + Admins see all
CREATE POLICY "listings_select" ON public.listings
FOR SELECT USING (
  -- Vendor sees their own listings (any status)
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
  )
  OR 
  -- Public sees published listings from approved vendors
  (
    status = 'published' 
    AND deleted_at IS NULL
    AND vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE status = 'approved'
    )
  )
  OR 
  -- Admins see all
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_id = (SELECT auth.uid()) 
    AND role = 'admin'
  )
);

-- INSERT: Vendor can create listings for their own vendor_profile_id
CREATE POLICY "listings_insert" ON public.listings
FOR INSERT WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
    AND status = 'approved'
  )
);

-- UPDATE: Vendor can update their own listings
CREATE POLICY "listings_update" ON public.listings
FOR UPDATE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
  )
) WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
  )
);

-- DELETE: Vendor can delete (soft delete) their own listings
CREATE POLICY "listings_delete" ON public.listings
FOR DELETE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
  )
);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'listings' ORDER BY cmd;
```

**Expected output:**
| policyname | cmd |
|------------|-----|
| listings_delete | DELETE |
| listings_insert | INSERT |
| listings_select | SELECT |
| listings_update | UPDATE |

---

## Part 2: Fix Listing Form API Error

### Problem
Edit listing shows empty error object: `Listing error: {}`

### Root Cause
The API is returning an error without a message property, or the error is being swallowed.

### Solution

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Find the handleSubmit function and update error handling:

```typescript
// Find this section (around line 98-102):
if (result.error) {
  console.error('Listing error:', result.error)
  setError(result.error.message)
  setLoading(false)
  return
}

// Replace with:
if (result.error) {
  console.error('Listing error:', JSON.stringify(result.error, null, 2))
  const errorMessage = result.error.message || result.error.details || 'Failed to save listing. Please try again.'
  setError(errorMessage)
  setLoading(false)
  return
}
```

**Also check the API route that handles listing updates.**

**File:** `src/app/api/vendor/listings/route.ts` (or similar)

Ensure errors return proper message:

```typescript
// Find PUT/PATCH handler and ensure it returns errors properly:
if (error) {
  return NextResponse.json(
    { error: { message: error.message || 'Failed to update listing' } },
    { status: 400 }
  )
}
```

---

## Part 3: Fix Orders Page

### Problem
Orders page shows "Failed to load orders"

### Root Cause
Either RLS policy blocking access OR the query is failing.

### Solution - Part A: Check/Fix Orders RLS

**Run in Dev database, then Staging:**

```sql
-- =============================================================================
-- Fix Orders RLS Policies
-- =============================================================================

-- First check what exists
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'orders';

-- Drop and recreate with proper policies
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "Vendors can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;

-- SELECT: Vendors see orders for their listings + Buyers see their orders + Admins see all
CREATE POLICY "orders_select" ON public.orders
FOR SELECT USING (
  -- Buyer sees their own orders
  buyer_user_id = (SELECT auth.uid())
  OR
  -- Vendor sees orders containing their items
  id IN (
    SELECT DISTINCT oi.order_id 
    FROM public.order_items oi
    JOIN public.listings l ON oi.listing_id = l.id
    WHERE l.vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  OR
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_id = (SELECT auth.uid()) 
    AND role = 'admin'
  )
);

-- INSERT: Authenticated buyers can create orders
CREATE POLICY "orders_insert" ON public.orders
FOR INSERT WITH CHECK (
  buyer_user_id = (SELECT auth.uid())
);

-- UPDATE: Buyer can update own pending orders + Vendor can update status
CREATE POLICY "orders_update" ON public.orders
FOR UPDATE USING (
  buyer_user_id = (SELECT auth.uid())
  OR
  id IN (
    SELECT DISTINCT oi.order_id 
    FROM public.order_items oi
    JOIN public.listings l ON oi.listing_id = l.id
    WHERE l.vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
    )
  )
);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders' ORDER BY cmd;
```

### Solution - Part B: Check Order Items RLS

```sql
-- =============================================================================
-- Fix Order Items RLS Policies
-- =============================================================================

-- Check existing
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'order_items';

-- Drop and recreate
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

-- SELECT: Same access as parent order
CREATE POLICY "order_items_select" ON public.order_items
FOR SELECT USING (
  -- Buyer's order items
  order_id IN (
    SELECT id FROM public.orders WHERE buyer_user_id = (SELECT auth.uid())
  )
  OR
  -- Vendor's sold items
  listing_id IN (
    SELECT id FROM public.listings 
    WHERE vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  OR
  -- Admin
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_id = (SELECT auth.uid()) 
    AND role = 'admin'
  )
);

-- INSERT: Via order creation
CREATE POLICY "order_items_insert" ON public.order_items
FOR INSERT WITH CHECK (
  order_id IN (
    SELECT id FROM public.orders WHERE buyer_user_id = (SELECT auth.uid())
  )
);

-- UPDATE: Vendor can update item status
CREATE POLICY "order_items_update" ON public.order_items
FOR UPDATE USING (
  listing_id IN (
    SELECT id FROM public.listings 
    WHERE vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
    )
  )
);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'order_items' ORDER BY cmd;
```

### Solution - Part C: Fix Orders API

**File:** `src/app/[vertical]/vendor/dashboard/orders/page.tsx` (or similar)

Check for proper error handling and that the query matches RLS expectations:

```typescript
// The query should join through order_items to get vendor's orders
// Example query structure:
const { data: orders, error } = await supabase
  .from('order_items')
  .select(`
    *,
    order:orders(*),
    listing:listings(*)
  `)
  .eq('listing.vendor_profile_id', vendorProfileId)
  
// If error, log it properly:
if (error) {
  console.error('Orders fetch error:', JSON.stringify(error, null, 2))
}
```

---

## Part 4: Testing Checklist

After applying fixes:

### Test 1: Create Listing
1. Log in as StandardVendor+tsjr00@gmail.com
2. Go to /farmers_market/vendor/listings
3. Click "Create New Listing"
4. Fill form and submit
5. ✅ Should create successfully

### Test 2: Edit Listing
1. From listings page, click edit on existing listing
2. Change price or description
3. Save
4. ✅ Should save without error

### Test 3: View Orders
1. Go to /farmers_market/vendor/dashboard/orders
2. ✅ Should load (even if empty - no error)

---

## Commit Strategy

```bash
# After Part 1 (RLS fixes)
git add -A
git commit -m "Fix listings and orders RLS policies for vendor access"

# After Parts 2-3 (API fixes)
git add -A
git commit -m "Fix listing form and orders page error handling"

# Push
git push origin main
```

---

## Session Summary Template

After completing, create session summary:

```markdown
# Session Summary - Bug Fixes Phase A

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Fixed listings INSERT RLS policy
- [ ] Fixed listings UPDATE RLS policy  
- [ ] Fixed orders/order_items RLS policies
- [ ] Improved error handling in ListingForm
- [ ] Fixed orders page query

## Database Changes
- Applied to: Dev ✅ | Staging ✅

## Testing Results
- Create listing: ✅/❌
- Edit listing: ✅/❌
- Orders page: ✅/❌

## Notes
[Any issues encountered]
```
