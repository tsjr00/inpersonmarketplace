-- Migration: Error Reports & Escalation System
-- Created: 2026-01-26
-- Purpose: Enable users to report errors, vertical admins to triage, and platform admins to resolve
--
-- Escalation Flow:
--   User → (reports error) → Vertical Admin → (escalates) → Platform Admin → (fixes) → Resolved
--
-- This supports multi-vertical operation where:
--   - Similar errors may occur across verticals (shared code/policies)
--   - Vertical admins triage errors for their vertical
--   - Platform admin has visibility across all verticals

-- ============================================================================
-- 1. ERROR_REPORTS TABLE - User-submitted error reports
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Error identification
  error_code TEXT,                             -- e.g., 'ERR_RLS_001' (from error response)
  trace_id TEXT,                               -- Links to error_logs entry

  -- Context
  vertical_id TEXT REFERENCES verticals(vertical_id),   -- Which vertical this occurred in (slug)
  page_url TEXT,                               -- URL where error occurred
  user_agent TEXT,                             -- Browser/device info

  -- Reporter info
  reported_by_user_id UUID REFERENCES auth.users(id),
  reporter_email TEXT,                         -- Captured in case user is logged out
  user_description TEXT,                       -- User's description of what they were doing

  -- Escalation tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'escalated', 'in_progress', 'resolved', 'duplicate', 'cannot_reproduce')),
  escalation_level TEXT NOT NULL DEFAULT 'vertical_admin'
    CHECK (escalation_level IN ('vertical_admin', 'platform_admin')),

  -- Assignment
  assigned_to_user_id UUID REFERENCES auth.users(id),  -- Admin handling this

  -- Resolution tracking
  resolution_id UUID REFERENCES error_resolutions(id), -- Links to the fix
  resolution_notes TEXT,                       -- Admin notes on resolution

  -- Vertical admin actions
  vertical_admin_notes TEXT,                   -- Notes from vertical admin
  escalated_at TIMESTAMPTZ,                    -- When escalated to platform admin
  escalated_by_user_id UUID REFERENCES auth.users(id),

  -- Platform admin actions
  platform_admin_notes TEXT,                   -- Notes from platform admin
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES auth.users(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Find reports by vertical (for vertical admin dashboard)
CREATE INDEX idx_error_reports_vertical ON error_reports(vertical_id, status, created_at DESC);

-- Find reports by error code (for pattern detection)
CREATE INDEX idx_error_reports_code ON error_reports(error_code, created_at DESC);

-- Find escalated reports (for platform admin)
CREATE INDEX idx_error_reports_escalated ON error_reports(escalation_level, status, created_at DESC)
  WHERE escalation_level = 'platform_admin';

-- Find pending reports
CREATE INDEX idx_error_reports_pending ON error_reports(status, created_at DESC)
  WHERE status = 'pending';

-- Link to error_logs
CREATE INDEX idx_error_reports_trace ON error_reports(trace_id)
  WHERE trace_id IS NOT NULL;

-- Link to resolutions
CREATE INDEX idx_error_reports_resolution ON error_reports(resolution_id)
  WHERE resolution_id IS NOT NULL;

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_error_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER error_reports_updated_at
  BEFORE UPDATE ON error_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_error_reports_updated_at();

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
CREATE POLICY "error_reports_user_insert" ON error_reports
  FOR INSERT WITH CHECK (
    -- Anyone can report an error (even if not logged in, reported_by_user_id can be null)
    true
  );

-- Users can see their own reports
CREATE POLICY "error_reports_user_select" ON error_reports
  FOR SELECT USING (
    reported_by_user_id = (SELECT auth.uid())
  );

-- Vertical admins can see reports for their vertical
CREATE POLICY "error_reports_vertical_admin_select" ON error_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.vertical_id = error_reports.vertical_id
      AND va.user_id = (SELECT auth.uid())
          )
  );

-- Vertical admins can update reports for their vertical
CREATE POLICY "error_reports_vertical_admin_update" ON error_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.vertical_id = error_reports.vertical_id
      AND va.user_id = (SELECT auth.uid())
          )
  );

-- Platform admins can see all reports
CREATE POLICY "error_reports_platform_admin_select" ON error_reports
  FOR SELECT USING (
    is_platform_admin()
  );

-- Platform admins can update all reports
CREATE POLICY "error_reports_platform_admin_update" ON error_reports
  FOR UPDATE USING (
    is_platform_admin()
  );

-- Service role can do everything
GRANT ALL ON error_reports TO service_role;

-- ============================================================================
-- 5. VIEWS FOR DASHBOARDS
-- ============================================================================

-- View: Pending reports for vertical admins
CREATE OR REPLACE VIEW v_vertical_admin_pending_reports AS
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

-- View: Escalated reports for platform admin
CREATE OR REPLACE VIEW v_platform_admin_escalated_reports AS
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

-- View: Error frequency by code (for pattern detection)
CREATE OR REPLACE VIEW v_error_frequency AS
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

-- ============================================================================
-- Done!
-- ============================================================================
