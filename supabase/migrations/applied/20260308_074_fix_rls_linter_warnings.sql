-- Migration 074: Fix Supabase linter RLS warnings
-- 1. Tighten error_reports INSERT policy (was WITH CHECK true)
-- 2. Add admin-only SELECT policies to 4 tables with RLS but no policies

-- ============================================================================
-- 1. Fix error_reports INSERT policy
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "error_reports_user_insert" ON public.error_reports;

-- Recreate with tighter check: if logged in, can only attribute to self
CREATE POLICY "error_reports_user_insert" ON public.error_reports
  FOR INSERT WITH CHECK (
    reported_by_user_id IS NULL
    OR reported_by_user_id = (SELECT auth.uid())
  );

-- ============================================================================
-- 2. Add admin-only SELECT policies to tables flagged by linter
-- ============================================================================

-- admin_activity_log: service client writes, admin reads
CREATE POLICY "admin_activity_log_admin_select" ON public.admin_activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
  );

-- audit_log: service client writes, admin reads
CREATE POLICY "audit_log_admin_select" ON public.audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
  );

-- error_resolutions: service client writes, admin reads
CREATE POLICY "error_resolutions_admin_select" ON public.error_resolutions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
  );

-- vertical_admins: service client writes, admin reads
CREATE POLICY "vertical_admins_admin_select" ON public.vertical_admins
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
