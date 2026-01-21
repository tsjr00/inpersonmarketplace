-- ============================================================================
-- Migration: Admin Management System
-- Purpose: Track platform admins, vertical admins, and chief admin status
-- ============================================================================

-- Add chief platform admin flag to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_chief_platform_admin BOOLEAN DEFAULT FALSE;

-- Set the chief platform admin
UPDATE user_profiles
SET is_chief_platform_admin = TRUE
WHERE email = 'tsjr00@gmail.com';

-- Ensure chief admin has admin role
UPDATE user_profiles
SET
  role = 'admin',
  roles = CASE
    WHEN roles IS NULL THEN ARRAY['admin']::user_role[]
    WHEN NOT ('admin'::user_role = ANY(roles)) THEN roles || ARRAY['admin']::user_role[]
    ELSE roles
  END
WHERE email = 'tsjr00@gmail.com';

-- ============================================================================
-- Vertical Admins Table
-- Tracks which users are admins for which verticals, including chief status
-- ============================================================================

CREATE TABLE IF NOT EXISTS vertical_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE CASCADE,
  is_chief BOOLEAN DEFAULT FALSE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only be admin of a vertical once
  UNIQUE(user_id, vertical_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vertical_admins_user_id ON vertical_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_vertical_admins_vertical_id ON vertical_admins(vertical_id);

-- Comments
COMMENT ON TABLE vertical_admins IS 'Tracks vertical-specific admin assignments';
COMMENT ON COLUMN vertical_admins.is_chief IS 'Chief vertical admin can manage other admins for this vertical';
COMMENT ON COLUMN vertical_admins.granted_by IS 'User who granted this admin access';

-- ============================================================================
-- Admin Activity Log
-- Tracks admin promotions/demotions for audit purposes
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL, -- 'grant_platform_admin', 'revoke_platform_admin', 'grant_vertical_admin', 'revoke_vertical_admin', 'set_chief'
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  vertical_id TEXT REFERENCES verticals(vertical_id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_log_target ON admin_activity_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_performed_by ON admin_activity_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON admin_activity_log(created_at DESC);

COMMENT ON TABLE admin_activity_log IS 'Audit log for admin management actions';

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE vertical_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all vertical admins
CREATE POLICY "vertical_admins_platform_admin_select" ON vertical_admins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND (up.role = 'admin' OR 'admin'::user_role = ANY(up.roles))
    )
  );

-- Vertical admins can see admins for their verticals
CREATE POLICY "vertical_admins_vertical_admin_select" ON vertical_admins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.user_id = auth.uid()
      AND va.vertical_id = vertical_admins.vertical_id
    )
  );

-- Platform admins and chief vertical admins can insert
CREATE POLICY "vertical_admins_insert" ON vertical_admins
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Platform admin
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND (up.role = 'admin' OR 'admin'::user_role = ANY(up.roles))
    )
    OR
    -- Chief vertical admin for this vertical
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.user_id = auth.uid()
      AND va.vertical_id = vertical_admins.vertical_id
      AND va.is_chief = TRUE
    )
  );

-- Platform admins and chief vertical admins can delete
CREATE POLICY "vertical_admins_delete" ON vertical_admins
  FOR DELETE TO authenticated
  USING (
    -- Platform admin
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND (up.role = 'admin' OR 'admin'::user_role = ANY(up.roles))
    )
    OR
    -- Chief vertical admin for this vertical (but not themselves)
    (
      EXISTS (
        SELECT 1 FROM vertical_admins va
        WHERE va.user_id = auth.uid()
        AND va.vertical_id = vertical_admins.vertical_id
        AND va.is_chief = TRUE
      )
      AND vertical_admins.user_id != auth.uid()
    )
  );

-- Admin activity log - only platform admins can read
CREATE POLICY "admin_activity_log_select" ON admin_activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND (up.role = 'admin' OR 'admin'::user_role = ANY(up.roles))
    )
  );

-- Admin activity log - admins can insert
CREATE POLICY "admin_activity_log_insert" ON admin_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND (up.role = 'admin' OR 'admin'::user_role = ANY(up.roles))
    )
    OR
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.user_id = auth.uid()
    )
  );
