-- Add verticals column to user_profiles
-- This tracks which verticals a buyer has signed up with
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS verticals TEXT[] DEFAULT '{}';

-- Add index for querying by vertical
CREATE INDEX IF NOT EXISTS idx_user_profiles_verticals ON user_profiles USING GIN (verticals);

-- Comment for documentation
COMMENT ON COLUMN user_profiles.verticals IS 'Array of vertical IDs the user has signed up with (e.g., farmers_market, fireworks)';

-- Migrate existing users: associate all current users with farmers_market
-- since that is the currently active vertical
UPDATE user_profiles
SET verticals = ARRAY['farmers_market']
WHERE verticals IS NULL OR verticals = '{}';

-- Update the user profile creation trigger to include the vertical from signup
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  signup_vertical TEXT;
BEGIN
  -- Get the preferred_vertical from user metadata (set during signup)
  signup_vertical := NEW.raw_user_meta_data->>'preferred_vertical';

  INSERT INTO public.user_profiles (
    user_id,
    email,
    display_name,
    verticals,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN signup_vertical IS NOT NULL AND signup_vertical != ''
      THEN ARRAY[signup_vertical]
      ELSE ARRAY['farmers_market']  -- Default to farmers_market
    END,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;
