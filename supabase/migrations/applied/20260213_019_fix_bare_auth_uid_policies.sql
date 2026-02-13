-- Migration 019: Fix bare auth.uid() in RLS policies → (SELECT auth.uid())
--
-- Bare auth.uid() is evaluated per-row, while (SELECT auth.uid()) is evaluated
-- once and cached for the entire query. This is a significant performance
-- improvement for tables with many rows.
--
-- Only 3 policies in the live database still use bare auth.uid():

-- 1. vendor_fee_balance
DROP POLICY IF EXISTS "vendor_fee_balance_select" ON public.vendor_fee_balance;
CREATE POLICY "vendor_fee_balance_select" ON public.vendor_fee_balance
  FOR SELECT USING (
    vendor_profile_id IN (
      SELECT vendor_profiles.id FROM vendor_profiles
      WHERE vendor_profiles.user_id = (SELECT auth.uid())
    )
  );

-- 2. vendor_fee_ledger
DROP POLICY IF EXISTS "vendor_fee_ledger_select" ON public.vendor_fee_ledger;
CREATE POLICY "vendor_fee_ledger_select" ON public.vendor_fee_ledger
  FOR SELECT USING (
    vendor_profile_id IN (
      SELECT vendor_profiles.id FROM vendor_profiles
      WHERE vendor_profiles.user_id = (SELECT auth.uid())
    )
  );

-- 3. zip_codes (admin access)
DROP POLICY IF EXISTS "zip_codes_admin_all" ON public.zip_codes;
CREATE POLICY "zip_codes_admin_all" ON public.zip_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );
