-- Migration: Error Resolutions Tracking Table
-- Created: 2026-01-26
-- Purpose: Track fix attempts for errors and whether they actually worked
--
-- This table ensures:
--   1. We don't re-try fixes that already failed
--   2. We have verified solutions vs theoretical ones
--   3. Developers can see what was already attempted

-- ============================================================================
-- 1. CREATE ERROR_RESOLUTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_resolutions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Error identification
  error_code TEXT NOT NULL,                    -- e.g., 'ERR_RLS_001'
  trace_id TEXT,                               -- Links to specific error_logs entry if applicable

  -- Fix details
  attempted_fix TEXT NOT NULL,                 -- Description of what was tried
  migration_file TEXT,                         -- e.g., '20260126_007_cleanup_order_policies.sql'
  code_changes TEXT,                           -- Summary of code changes made

  -- Outcome tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed', 'partial')),
  failure_reason TEXT,                         -- Why it didn't work (if failed)
  partial_notes TEXT,                          -- What worked/didn't work (if partial)

  -- Verification
  verification_method TEXT,                    -- 'manual', 'query', 'api_test', 'automated'
  verification_query TEXT,                     -- SQL query used to verify (if applicable)
  verification_result TEXT,                    -- Actual result of verification
  verified_at TIMESTAMPTZ,                     -- When confirmed working/failed
  verified_by TEXT,                            -- Who/what verified

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT                              -- Developer/AI who attempted the fix
);

-- ============================================================================
-- 2. INDEXES FOR QUERYING
-- ============================================================================

-- Find all attempts for a specific error code
CREATE INDEX idx_error_resolutions_code ON error_resolutions(error_code);

-- Find verified solutions quickly
CREATE INDEX idx_error_resolutions_verified ON error_resolutions(error_code, status)
  WHERE status = 'verified';

-- Find failed attempts (to avoid re-trying)
CREATE INDEX idx_error_resolutions_failed ON error_resolutions(error_code, status)
  WHERE status = 'failed';

-- Find pending verifications
CREATE INDEX idx_error_resolutions_pending ON error_resolutions(status, created_at)
  WHERE status = 'pending';

-- Link to error_logs
CREATE INDEX idx_error_resolutions_trace ON error_resolutions(trace_id)
  WHERE trace_id IS NOT NULL;

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_error_resolutions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER error_resolutions_updated_at
  BEFORE UPDATE ON error_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION update_error_resolutions_updated_at();

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE error_resolutions ENABLE ROW LEVEL SECURITY;

-- Admins can read all resolutions
CREATE POLICY "error_resolutions_admin_select" ON error_resolutions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND 'admin' = ANY(roles))
  );

-- Admins can insert/update resolutions
CREATE POLICY "error_resolutions_admin_insert" ON error_resolutions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND 'admin' = ANY(roles))
  );

CREATE POLICY "error_resolutions_admin_update" ON error_resolutions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND 'admin' = ANY(roles))
  );

-- Service role can do everything (for automated logging)
GRANT ALL ON error_resolutions TO service_role;

-- ============================================================================
-- 5. VIEW: CURRENT BEST SOLUTIONS
-- ============================================================================

-- This view shows the most recent verified solution for each error code
CREATE OR REPLACE VIEW v_verified_solutions AS
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

-- ============================================================================
-- 6. VIEW: FAILED APPROACHES (DO NOT RETRY)
-- ============================================================================

-- This view shows all failed approaches for each error code
CREATE OR REPLACE VIEW v_failed_approaches AS
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
-- Done!
-- ============================================================================
