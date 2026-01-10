# RLS Performance Fixes - Manual SQL Migration

**Date:** January 7, 2026  
**Issues:** 63 performance warnings  
**Run in:** Supabase SQL Editor (Staging first, then Dev)

---

## Overview

**Two issue types:**
1. `auth_rls_initplan` - Auth functions re-evaluated per row (19 issues)
2. `multiple_permissive_policies` - Duplicate policies cause extra evaluations (44 issues)

**Strategy:**
- Drop all existing policies on affected tables
- Recreate with optimized versions using `(select auth.uid())`
- Consolidate multiple SELECT policies into single policies with OR logic

---

## IMPORTANT: Run in Order

1. Run Part 1 (Drop all policies)
2. Run Part 2 (Recreate optimized policies)
3. Verify in Supabase Linter

---

## Part 1: Drop Existing Policies

```sql
-- =============================================================================
-- Part 1: Drop all existing RLS policies on affected tables
-- =============================================================================

-- user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;

-- organizations
DROP POLICY IF EXISTS "Owners can view own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can view all organizations" ON public.organizations;

-- vendor_profiles
DROP POLICY IF EXISTS "Users can create vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can view own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can update own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Public can view approved vendors" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can view all vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can update vendor profiles" ON public.vendor_profiles;

-- transactions
DROP POLICY IF EXISTS "Buyers can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can create transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can view their transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;

-- fulfillments
DROP POLICY IF EXISTS "Participants can view fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can manage fulfillments" ON public.fulfillments;

-- notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can create notifications" ON public.notifications;

-- listings
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view active listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;

-- listing_images
DROP POLICY IF EXISTS "Public can view published listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Vendors can manage listing images" ON public.listing_images;

-- vendor_verifications
DROP POLICY IF EXISTS "Vendors can view own verifications" ON public.vendor_verifications;
DROP POLICY IF EXISTS "Verifiers can view all verifications" ON public.vendor_verifications;

-- verticals
DROP POLICY IF EXISTS "Public can read active verticals" ON public.verticals;
DROP POLICY IF EXISTS "Admins can manage verticals" ON public.verticals;

SELECT 'Part 1 complete - all policies dropped' as status;
```

---

## Part 2: Recreate Optimized Policies

```sql
-- =============================================================================
-- Part 2: Recreate RLS policies with performance optimizations
-- =============================================================================
-- Key optimizations:
-- 1. Use (select auth.uid()) instead of auth.uid() to prevent per-row evaluation
-- 2. Consolidate multiple SELECT policies into single policy with OR conditions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_profiles
-- -----------------------------------------------------------------------------

-- SELECT: Users own profile OR admins see all (consolidated)
CREATE POLICY "user_profiles_select" ON public.user_profiles
FOR SELECT USING (
  user_id = (select auth.uid())
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- INSERT: Users can insert own profile
CREATE POLICY "user_profiles_insert" ON public.user_profiles
FOR INSERT WITH CHECK (
  user_id = (select auth.uid())
);

-- UPDATE: Users can update own profile
CREATE POLICY "user_profiles_update" ON public.user_profiles
FOR UPDATE USING (
  user_id = (select auth.uid())
);

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------

-- SELECT: Owners see own OR admins see all (consolidated)
CREATE POLICY "organizations_select" ON public.organizations
FOR SELECT USING (
  owner_id = (select auth.uid())
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- INSERT: Authenticated users can create
CREATE POLICY "organizations_insert" ON public.organizations
FOR INSERT WITH CHECK (
  (select auth.uid()) IS NOT NULL
);

-- UPDATE: Owners can update own
CREATE POLICY "organizations_update" ON public.organizations
FOR UPDATE USING (
  owner_id = (select auth.uid())
);

-- -----------------------------------------------------------------------------
-- vendor_profiles
-- -----------------------------------------------------------------------------

-- SELECT: Own profile OR approved (public) OR admin (consolidated)
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
FOR SELECT USING (
  user_id = (select auth.uid())
  OR 
  status = 'approved'
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- INSERT: Authenticated users can create vendor profiles
CREATE POLICY "vendor_profiles_insert" ON public.vendor_profiles
FOR INSERT WITH CHECK (
  user_id = (select auth.uid())
);

-- UPDATE: Own profile OR admin (consolidated)
CREATE POLICY "vendor_profiles_update" ON public.vendor_profiles
FOR UPDATE USING (
  user_id = (select auth.uid())
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------

-- SELECT: Buyer OR vendor OR admin (consolidated)
CREATE POLICY "transactions_select" ON public.transactions
FOR SELECT USING (
  buyer_id = (select auth.uid())
  OR 
  vendor_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- INSERT: Authenticated users (buyers) can create
CREATE POLICY "transactions_insert" ON public.transactions
FOR INSERT WITH CHECK (
  buyer_id = (select auth.uid())
);

-- UPDATE: Buyer OR vendor can update (consolidated)
CREATE POLICY "transactions_update" ON public.transactions
FOR UPDATE USING (
  buyer_id = (select auth.uid())
  OR 
  vendor_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- fulfillments
-- -----------------------------------------------------------------------------

-- SELECT: Participant (buyer or vendor) (consolidated)
CREATE POLICY "fulfillments_select" ON public.fulfillments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = fulfillments.transaction_id
    AND (
      t.buyer_id = (select auth.uid())
      OR 
      t.vendor_id IN (
        SELECT id FROM public.vendor_profiles 
        WHERE user_id = (select auth.uid())
      )
    )
  )
);

-- INSERT/UPDATE/DELETE: Vendors can manage
CREATE POLICY "fulfillments_manage" ON public.fulfillments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = fulfillments.transaction_id
    AND t.vendor_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (select auth.uid())
    )
  )
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

-- SELECT: Users view own
CREATE POLICY "notifications_select" ON public.notifications
FOR SELECT USING (
  user_id = (select auth.uid())
);

-- INSERT: Service role or own (consolidated)
CREATE POLICY "notifications_insert" ON public.notifications
FOR INSERT WITH CHECK (
  user_id = (select auth.uid())
);

-- Also allow service_role
CREATE POLICY "notifications_service_insert" ON public.notifications
FOR INSERT TO service_role
WITH CHECK (true);

-- UPDATE: Users update own
CREATE POLICY "notifications_update" ON public.notifications
FOR UPDATE USING (
  user_id = (select auth.uid())
);

-- -----------------------------------------------------------------------------
-- listings
-- -----------------------------------------------------------------------------

-- SELECT: Own OR published OR admin (consolidated)
CREATE POLICY "listings_select" ON public.listings
FOR SELECT USING (
  -- Vendor sees own
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
  OR 
  -- Public sees published from approved vendors
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
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- INSERT: Vendors can create
CREATE POLICY "listings_insert" ON public.listings
FOR INSERT WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
);

-- UPDATE: Vendors can update own
CREATE POLICY "listings_update" ON public.listings
FOR UPDATE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
);

-- DELETE: Vendors can delete own (soft delete)
CREATE POLICY "listings_delete" ON public.listings
FOR DELETE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- listing_images
-- -----------------------------------------------------------------------------

-- SELECT: Published OR vendor owns (consolidated)
CREATE POLICY "listing_images_select" ON public.listing_images
FOR SELECT USING (
  -- Vendor owns the listing
  listing_id IN (
    SELECT id FROM public.listings l
    WHERE l.vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (select auth.uid())
    )
  )
  OR 
  -- Public can see images for published listings
  listing_id IN (
    SELECT id FROM public.listings 
    WHERE status = 'published' 
    AND deleted_at IS NULL
  )
);

-- INSERT/UPDATE/DELETE: Vendors manage own
CREATE POLICY "listing_images_manage" ON public.listing_images
FOR ALL USING (
  listing_id IN (
    SELECT id FROM public.listings l
    WHERE l.vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (select auth.uid())
    )
  )
);

-- -----------------------------------------------------------------------------
-- vendor_verifications
-- -----------------------------------------------------------------------------

-- SELECT: Own OR verifier (consolidated)
CREATE POLICY "vendor_verifications_select" ON public.vendor_verifications
FOR SELECT USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (select auth.uid())
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'verifier'
  )
);

-- -----------------------------------------------------------------------------
-- verticals
-- -----------------------------------------------------------------------------

-- SELECT: Active (public) OR admin manages (consolidated)
CREATE POLICY "verticals_select" ON public.verticals
FOR SELECT USING (
  is_active = true
  OR 
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

-- UPDATE/INSERT/DELETE: Admins only
CREATE POLICY "verticals_admin_manage" ON public.verticals
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up 
    WHERE up.user_id = (select auth.uid()) 
    AND up.role = 'admin'
  )
);

SELECT 'Part 2 complete - all optimized policies created' as status;
```

---

## Part 3: Verification

After running Parts 1 & 2:

1. Go to Supabase → Database → Linter
2. Refresh the page
3. Performance issues should drop from 63 to near 0

**If any remain**, check which table/policy and adjust.

---

## Rollback (If Needed)

If something breaks, you'll need to manually recreate the original policies. Consider exporting current policies before running this migration:

```sql
-- Export current policies (run BEFORE migration)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

## Apply Order

1. **Staging first** - Run Parts 1 & 2
2. **Test app functionality** - Login, browse, vendor actions
3. **If working** - Apply to Dev
4. **Check Linter** - Verify issues resolved
