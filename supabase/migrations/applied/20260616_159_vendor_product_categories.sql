-- Migration 159: Vendor product categories (Phase 1 — selling-exclusivity gate)
--
-- Vendors self-declare a production category at first interest. Categories
-- 1 (homemade/handmade/homegrown) + 2 (hand-finished/personalized) may SELL.
-- Categories 3 (personal-design + machine/mass-produced) + 4 (retail/resale/
-- pre-owned) may NOT sell — booth rental stays open to all.
--
-- Phase 1 mechanism (decided 2026-06-15): cat 3/4 are weeded out at the signup
-- qualifying step and NEVER create a vendor profile (an existing buyer just
-- stays a buyer). So every profile that exists is sell_eligible=true; this
-- column + the publish/market-box/event backstop gates are defense-in-depth and
-- forward-prep for Option B (lite cat-3/4 accounts, Phase 3).
--
-- Additive. DEFAULT TRUE grandfathers all existing vendors (no retro-classify).

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS production_category TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS sell_eligible BOOLEAN NOT NULL DEFAULT TRUE;

-- Element-level validity: every declared category must be one of '1'..'4'.
-- (NULL allowed for grandfathered/pre-159 rows.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_profiles_production_category_valid'
  ) THEN
    ALTER TABLE vendor_profiles
      ADD CONSTRAINT vendor_profiles_production_category_valid
      CHECK (production_category IS NULL OR production_category <@ ARRAY['1','2','3','4']);
  END IF;
END $$;

COMMENT ON COLUMN vendor_profiles.production_category IS
  'Self-declared production categories: 1=homemade/handmade/homegrown, 2=hand-finished/personalized, 3=design+machine/mass-produced, 4=retail/resale/pre-owned. Phase 1 stores only 1/2 (cat 3/4 weeded out pre-signup).';
COMMENT ON COLUMN vendor_profiles.sell_eligible IS
  'Derived: true iff all declared production_category in {1,2}. DEFAULT TRUE grandfathers existing vendors. Gates listing publish + market-box create + event selling.';

-- ROLLBACK:
-- ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_production_category_valid;
-- ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS sell_eligible;
-- ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS production_category;

NOTIFY pgrst, 'reload schema';
