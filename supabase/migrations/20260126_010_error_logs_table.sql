-- Migration: Create Error Logs Table
-- Created: 2026-01-26
-- Purpose: Store error traces for analysis and debugging

-- ============================================================================
-- ERROR_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  breadcrumbs JSONB DEFAULT '[]',
  user_id UUID REFERENCES auth.users(id),
  route TEXT,
  method TEXT,
  pg_code TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_error_logs_code ON error_logs(error_code);
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_user ON error_logs(user_id);
CREATE INDEX idx_error_logs_route ON error_logs(route);
CREATE INDEX idx_error_logs_pg_code ON error_logs(pg_code);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read error logs
CREATE POLICY "error_logs_admin_select" ON error_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = (select auth.uid())
      AND 'admin' = ANY(roles)
    )
  );

-- Service role can insert (API routes use service client for logging)
-- No INSERT policy needed - service role bypasses RLS

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE error_logs IS 'Stores traced errors for debugging and analysis. Errors include context, breadcrumbs, and PostgreSQL error codes.';
COMMENT ON COLUMN error_logs.trace_id IS 'Unique identifier for correlating logs with API responses';
COMMENT ON COLUMN error_logs.error_code IS 'Application error code (e.g., ERR_RLS_001)';
COMMENT ON COLUMN error_logs.context IS 'Additional context: table, operation, IDs, etc.';
COMMENT ON COLUMN error_logs.breadcrumbs IS 'Execution trail leading to the error';
COMMENT ON COLUMN error_logs.pg_code IS 'PostgreSQL error code when applicable (e.g., 42P17)';
