-- Migration: Seed error_resolutions with RLS fix learnings from 2026-01-30
-- Purpose: Document what worked and what didn't for future reference

-- ============================================================================
-- RLS RECURSION FIXES
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_RLS_001',
   'RLS policy recursion: is_platform_admin() on user_profiles causes infinite loop',
   '20260130_005_fix_all_rls_recursion.sql',
   'Remove is_platform_admin() calls from user_profiles policies. Use service_role grants for admin operations instead.',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_RLS_002',
   'RLS policy recursion: Nested queries on RLS-protected tables',
   '20260130_005_fix_all_rls_recursion.sql',
   'Use SECURITY DEFINER helper functions (user_vendor_profile_ids(), can_access_subscription()) to bypass RLS in policy checks.',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_RLS_003',
   'Multiple permissive policies on SELECT: Using FOR ALL + FOR SELECT creates duplicates',
   '20260130_008_fix_remaining_warnings.sql',
   'Never use FOR ALL with FOR SELECT on same table. Split FOR ALL into separate FOR INSERT, FOR UPDATE, FOR DELETE policies.',
   'verified',
   NULL,
   'manual',
   'Claude');

-- ============================================================================
-- SCHEMA/COLUMN ISSUES
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_SCHEMA_001',
   'Column vendor_profile_id does not exist on orders table',
   '20260130_007_comprehensive_rls_cleanup.sql',
   'orders table has no vendor_profile_id. Use subquery: id IN (SELECT order_id FROM order_items WHERE vendor_profile_id IN (...))',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_SCHEMA_002',
   'Column vendor_profile_id does not exist on vendor_referral_credits',
   '20260130_007_comprehensive_rls_cleanup.sql',
   'vendor_referral_credits uses referrer_vendor_id and referred_vendor_id, not vendor_profile_id',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_SCHEMA_003',
   'Column order_id does not exist on fulfillments table',
   '20260130_006_fix_remaining_rls_warnings.sql',
   'fulfillments table uses transaction_id referencing transactions table, not order_id',
   'verified',
   NULL,
   'manual',
   'Claude');

-- ============================================================================
-- PERFORMANCE FIXES
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_PERF_001',
   'auth_rls_initplan warning: auth.uid() re-evaluated for each row',
   '20260130_007_comprehensive_rls_cleanup.sql',
   'Always use (SELECT auth.uid()) instead of auth.uid() in RLS policies for performance',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_PERF_002',
   'Multiple permissive policies warning',
   '20260130_009_fix_vendor_referral_credits_duplicate.sql',
   'Check for duplicate policies with same name pattern. Old migrations may have created policies that newer ones recreate under different names.',
   'verified',
   NULL,
   'manual',
   'Claude');

-- ============================================================================
-- SECURITY FIXES
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_SEC_001',
   'Function search path mutable warning',
   '20260130_008_fix_remaining_warnings.sql',
   'Add SET search_path = public to all SECURITY DEFINER functions',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_SEC_002',
   'RLS policy always true for INSERT - notifications table',
   '20260130_008_fix_remaining_warnings.sql',
   'Removed notifications_insert policy. Only service_role should create notifications.',
   'verified',
   NULL,
   'manual',
   'Claude');

-- ============================================================================
-- FAILED APPROACHES (Important to document what NOT to do)
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_RLS_FAIL_001',
   'Attempted: Incremental policy fixes across multiple migrations',
   'Multiple migrations 001-006',
   'Created separate small migrations to fix individual issues',
   'failed',
   'Each incremental fix introduced new issues. Policies were created with different names causing duplicates. Should have done comprehensive audit first.',
   'manual',
   'Claude'),

  ('ERR_RLS_FAIL_002',
   'Attempted: Using is_platform_admin() in policies on tables that is_platform_admin() queries',
   '20260130_003_fix_market_box_rls_recursion.sql',
   'Added is_platform_admin() to market_box_subscriptions policy',
   'failed',
   'is_platform_admin() queries user_profiles which has RLS, creating recursion. Must use SECURITY DEFINER helpers or service_role instead.',
   'manual',
   'Claude');

-- ============================================================================
-- PROCESS LEARNINGS
-- ============================================================================

INSERT INTO error_resolutions (error_code, attempted_fix, migration_file, code_changes, status, failure_reason, verification_method, created_by)
VALUES
  ('ERR_PROCESS_001',
   'Before ANY RLS changes: Audit all existing policies first',
   NULL,
   'Run: grep -h "CREATE POLICY" supabase/migrations/*.sql | sort | uniq -c | sort -rn -- to find duplicates before creating new policies',
   'verified',
   NULL,
   'manual',
   'Claude'),

  ('ERR_PROCESS_002',
   'Always DROP POLICY IF EXISTS before CREATE POLICY',
   NULL,
   'Every CREATE POLICY must have corresponding DROP POLICY IF EXISTS for all possible names the policy might have',
   'verified',
   NULL,
   'manual',
   'Claude');
