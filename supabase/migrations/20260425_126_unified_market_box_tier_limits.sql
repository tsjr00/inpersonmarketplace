-- ============================================================================
-- Migration 126: Unified market box tier limits
-- ============================================================================
-- Replaces the pre-unification tier table inside enforce_market_box_tier_limit
-- with the unified limits defined in vendor-limits.ts:
--
--   pro  → 6 market boxes
--   boss → 10 market boxes
--   everything else (free, standard, premium, featured, basic) → 3
--
-- Migration 064 introduced this trigger with FM/FT-specific limits and old
-- tier names. Migration 089 unified the app-layer tier system but did not
-- update this trigger, leaving the DB enforcing 2 for 'standard' while the
-- app's getTierLimits() said 3. Vendors saw "2 of 3 used" in the UI but the
-- DB blocked the third with "Market box limit reached: 2 of 2".
--
-- After this migration: app and DB agree.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_market_box_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_current_count INTEGER;
  v_max_active INTEGER;
BEGIN
  -- Only enforce when activating an offering
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if already active (no change)
  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Get vendor tier (vertical no longer affects the limit — unified tiers)
  SELECT tier INTO v_tier
  FROM vendor_profiles
  WHERE id = NEW.vendor_profile_id;

  -- Unified tier limits — matches vendor-limits.ts TIER_LIMITS:
  --   pro  → 6, boss → 10, everything else (free, standard, premium,
  --   featured, basic, unknown) → 3
  CASE COALESCE(LOWER(v_tier), 'free')
    WHEN 'boss' THEN v_max_active := 10;
    WHEN 'pro' THEN v_max_active := 6;
    ELSE v_max_active := 3;
  END CASE;

  -- Count current active offerings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM market_box_offerings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND active = TRUE
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_active THEN
    RAISE EXCEPTION 'Market box limit reached: % of % active offerings for your tier. Upgrade to add more.',
      v_current_count, v_max_active;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger registration is idempotent — drop and recreate to ensure latest
-- function definition is bound.
DROP TRIGGER IF EXISTS enforce_market_box_limit_trigger ON market_box_offerings;
CREATE TRIGGER enforce_market_box_limit_trigger
  BEFORE INSERT OR UPDATE ON market_box_offerings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_market_box_tier_limit();

COMMENT ON FUNCTION enforce_market_box_tier_limit IS 'Enforces unified per-tier limits on active market box offerings (pro=6, boss=10, free/standard/premium/featured/basic=3). Matches vendor-limits.ts TIER_LIMITS.';

-- Defensive: function signature unchanged but reload PostgREST cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END MIGRATION 126
-- ============================================================================
