-- Migration: Fix Supabase security linter warnings
-- Created: 2026-01-29
-- Purpose: Address SECURITY DEFINER view warnings and RLS disabled table warnings

-- ============================================================================
-- 1. FIX SECURITY DEFINER VIEWS
-- Recreate views with explicit security_invoker = on
-- ============================================================================

-- Drop and recreate v_vertical_admin_pending_reports with SECURITY INVOKER
DROP VIEW IF EXISTS v_vertical_admin_pending_reports;
CREATE VIEW v_vertical_admin_pending_reports
WITH (security_invoker = on) AS
SELECT
  er.*,
  v.name_public as vertical_name,
  v.vertical_id as vertical_slug,
  el.message as error_message,
  el.context as error_context,
  el.breadcrumbs as error_breadcrumbs
FROM error_reports er
LEFT JOIN verticals v ON v.vertical_id = er.vertical_id
LEFT JOIN error_logs el ON el.trace_id = er.trace_id
WHERE er.status IN ('pending', 'acknowledged')
  AND er.escalation_level = 'vertical_admin'
ORDER BY er.created_at DESC;

-- Drop and recreate v_platform_admin_escalated_reports with SECURITY INVOKER
DROP VIEW IF EXISTS v_platform_admin_escalated_reports;
CREATE VIEW v_platform_admin_escalated_reports
WITH (security_invoker = on) AS
SELECT
  er.*,
  v.name_public as vertical_name,
  v.vertical_id as vertical_slug,
  el.message as error_message,
  el.context as error_context,
  el.breadcrumbs as error_breadcrumbs,
  res.status as resolution_status,
  res.attempted_fix as resolution_fix
FROM error_reports er
LEFT JOIN verticals v ON v.vertical_id = er.vertical_id
LEFT JOIN error_logs el ON el.trace_id = er.trace_id
LEFT JOIN error_resolutions res ON res.id = er.resolution_id
WHERE er.escalation_level = 'platform_admin'
  AND er.status NOT IN ('resolved', 'duplicate', 'cannot_reproduce')
ORDER BY er.created_at DESC;

-- Drop and recreate v_error_frequency with SECURITY INVOKER
DROP VIEW IF EXISTS v_error_frequency;
CREATE VIEW v_error_frequency
WITH (security_invoker = on) AS
SELECT
  error_code,
  COUNT(*) as report_count,
  COUNT(DISTINCT vertical_id) as affected_verticals,
  MAX(created_at) as last_reported,
  MIN(created_at) as first_reported,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE status IN ('pending', 'acknowledged', 'escalated', 'in_progress')) as open_count
FROM error_reports
WHERE error_code IS NOT NULL
GROUP BY error_code
ORDER BY report_count DESC;

-- Drop and recreate v_verified_solutions with SECURITY INVOKER
DROP VIEW IF EXISTS v_verified_solutions;
CREATE VIEW v_verified_solutions
WITH (security_invoker = on) AS
SELECT DISTINCT ON (error_code)
  error_code,
  attempted_fix,
  migration_file,
  verification_method,
  verified_at,
  verified_by
FROM error_resolutions
WHERE status = 'verified'
ORDER BY error_code, verified_at DESC;

-- Drop and recreate v_failed_approaches with SECURITY INVOKER
DROP VIEW IF EXISTS v_failed_approaches;
CREATE VIEW v_failed_approaches
WITH (security_invoker = on) AS
SELECT
  error_code,
  attempted_fix,
  migration_file,
  failure_reason,
  created_at
FROM error_resolutions
WHERE status = 'failed'
ORDER BY error_code, created_at DESC;

-- ============================================================================
-- 2. ENABLE RLS ON platform_settings
-- ============================================================================

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "platform_settings_read" ON platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin_write" ON platform_settings;

-- Platform settings is read-only for most users, writable by admins
-- Anyone can read platform settings (needed for premium window duration)
CREATE POLICY "platform_settings_read" ON platform_settings
  FOR SELECT USING (true);

-- Only platform admins can modify settings
CREATE POLICY "platform_settings_admin_write" ON platform_settings
  FOR ALL USING (is_platform_admin());

-- Service role can do everything
GRANT ALL ON platform_settings TO service_role;

-- ============================================================================
-- 3. HANDLE spatial_ref_sys (PostGIS system table)
-- This is a PostGIS system table - we revoke direct API access
-- ============================================================================

-- Revoke public access from PostgREST (anon/authenticated roles)
REVOKE ALL ON spatial_ref_sys FROM anon, authenticated;

-- Keep postgres and service_role access for internal operations
GRANT SELECT ON spatial_ref_sys TO service_role;

-- ============================================================================
-- Done!
-- ============================================================================
