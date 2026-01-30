-- Migration: Fix market_box_pickups RLS for trigger inserts
-- Created: 2026-01-30
-- Issue: Trigger create_market_box_pickups() runs as session user, blocked by RLS

-- Option 1: Make the trigger function SECURITY DEFINER
-- This allows the trigger to bypass RLS when creating pickups
-- The function already has proper validation (only runs on subscription insert)

CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pickup_date DATE;
  num_weeks INTEGER;
BEGIN
  -- Use term_weeks if available, default to 4
  num_weeks := COALESCE(NEW.term_weeks, 4);

  FOR i IN 1..num_weeks LOOP
    pickup_date := NEW.start_date + ((i - 1) * 7);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status)
    VALUES (NEW.id, i, pickup_date, 'scheduled');
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also grant service_role full access for API operations
GRANT ALL ON market_box_pickups TO service_role;

-- Add comment explaining the security model
COMMENT ON FUNCTION create_market_box_pickups IS 'SECURITY DEFINER: Creates pickup records when subscription is created. Bypasses RLS since pickups should only be created by system triggers.';
