-- Migration: Fix SECURITY DEFINER views + enable RLS on spatial_ref_sys
-- Purpose: Resolve 9 Supabase security linter warnings
-- All 8 views: DROP + CREATE with security_invoker = true
-- 1 table: ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY

-- ============================================================
-- 1. market_vendor_counts
-- ============================================================
DROP VIEW IF EXISTS public.market_vendor_counts;
CREATE VIEW public.market_vendor_counts
  WITH (security_invoker = true)
AS
  SELECT lm.market_id, COUNT(DISTINCT l.vendor_profile_id) AS vendor_count
  FROM listing_markets lm
  JOIN listings l ON l.id = lm.listing_id
  WHERE l.status = 'published' AND l.deleted_at IS NULL
  GROUP BY lm.market_id;

-- ============================================================
-- 2. v_error_frequency
-- ============================================================
DROP VIEW IF EXISTS public.v_error_frequency;
CREATE VIEW public.v_error_frequency
  WITH (security_invoker = true)
AS
  SELECT
    error_code,
    COUNT(*) AS report_count,
    COUNT(DISTINCT vertical_id) AS affected_verticals,
    MAX(created_at) AS last_reported,
    MIN(created_at) AS first_reported,
    COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
    COUNT(*) FILTER (WHERE status IN ('pending','acknowledged','escalated','in_progress')) AS open_count
  FROM error_reports
  WHERE error_code IS NOT NULL
  GROUP BY error_code
  ORDER BY report_count DESC;

-- ============================================================
-- 3. active_markets
-- ============================================================
DROP VIEW IF EXISTS public.active_markets;
CREATE VIEW public.active_markets
  WITH (security_invoker = true)
AS
  SELECT * FROM markets
  WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW());

-- ============================================================
-- 4. v_verified_solutions
-- ============================================================
DROP VIEW IF EXISTS public.v_verified_solutions;
CREATE VIEW public.v_verified_solutions
  WITH (security_invoker = true)
AS
  SELECT DISTINCT ON (error_code)
    error_code, attempted_fix, migration_file,
    verification_method, verified_at, verified_by
  FROM error_resolutions
  WHERE status = 'verified'
  ORDER BY error_code, verified_at DESC;

-- ============================================================
-- 5. v_vertical_admin_pending_reports
-- ============================================================
DROP VIEW IF EXISTS public.v_vertical_admin_pending_reports;
CREATE VIEW public.v_vertical_admin_pending_reports
  WITH (security_invoker = true)
AS
  SELECT
    er.*,
    v.name_public AS vertical_name,
    v.vertical_id AS vertical_slug,
    el.message AS error_message,
    el.context AS error_context,
    el.breadcrumbs AS error_breadcrumbs
  FROM error_reports er
  LEFT JOIN verticals v ON v.vertical_id = er.vertical_id
  LEFT JOIN error_logs el ON el.trace_id = er.trace_id
  WHERE er.status IN ('pending','acknowledged')
    AND er.escalation_level = 'vertical_admin'
  ORDER BY er.created_at DESC;

-- ============================================================
-- 6. v_platform_admin_escalated_reports
-- ============================================================
DROP VIEW IF EXISTS public.v_platform_admin_escalated_reports;
CREATE VIEW public.v_platform_admin_escalated_reports
  WITH (security_invoker = true)
AS
  SELECT
    er.*,
    v.name_public AS vertical_name,
    v.vertical_id AS vertical_slug,
    el.message AS error_message,
    el.context AS error_context,
    el.breadcrumbs AS error_breadcrumbs,
    res.status AS resolution_status,
    res.attempted_fix AS resolution_fix
  FROM error_reports er
  LEFT JOIN verticals v ON v.vertical_id = er.vertical_id
  LEFT JOIN error_logs el ON el.trace_id = er.trace_id
  LEFT JOIN error_resolutions res ON res.id = er.resolution_id
  WHERE er.escalation_level = 'platform_admin'
    AND er.status NOT IN ('resolved','duplicate','cannot_reproduce')
  ORDER BY er.created_at DESC;

-- ============================================================
-- 7. v_failed_approaches
-- ============================================================
DROP VIEW IF EXISTS public.v_failed_approaches;
CREATE VIEW public.v_failed_approaches
  WITH (security_invoker = true)
AS
  SELECT
    error_code, attempted_fix, migration_file,
    failure_reason, created_at
  FROM error_resolutions
  WHERE status = 'failed'
  ORDER BY error_code, created_at DESC;

-- ============================================================
-- 8. vendor_referral_summary
-- ============================================================
DROP VIEW IF EXISTS public.vendor_referral_summary;
CREATE VIEW public.vendor_referral_summary
  WITH (security_invoker = true)
AS
  SELECT
    vp.id AS vendor_id,
    vp.referral_code,
    vp.referred_by_vendor_id,
    (SELECT COUNT(*) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status = 'pending') AS pending_count,
    (SELECT COUNT(*) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status = 'earned') AS earned_count,
    (SELECT COUNT(*) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status = 'applied') AS applied_count,
    (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status = 'earned') AS available_credits_cents,
    (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status IN ('earned','applied') AND earned_at >= DATE_TRUNC('year', NOW())) AS year_earned_cents,
    10000 AS annual_cap_cents,
    10000 - (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits WHERE referrer_vendor_id = vp.id AND status IN ('earned','applied') AND earned_at >= DATE_TRUNC('year', NOW())) AS remaining_cap_cents
  FROM vendor_profiles vp;

-- NOTE: spatial_ref_sys (PostGIS system table) also flagged by Supabase linter
-- but is owned by supabase_admin — cannot ALTER from migrations. Safe to ignore.
