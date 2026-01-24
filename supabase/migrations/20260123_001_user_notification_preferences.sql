-- Add notification preferences and deleted_at to user_profiles
-- Part of settings page enhancements

-- Add notification_preferences column (JSONB for flexibility)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "email_order_updates": true,
  "email_marketing": false,
  "sms_order_updates": false,
  "sms_marketing": false
}'::jsonb;

-- Add deleted_at for soft delete support
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add index on deleted_at for querying active users
CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at
ON user_profiles(deleted_at)
WHERE deleted_at IS NULL;

-- Comment for documentation
COMMENT ON COLUMN user_profiles.notification_preferences IS 'User notification preferences for email and SMS';
COMMENT ON COLUMN user_profiles.deleted_at IS 'Soft delete timestamp - null means active account';
