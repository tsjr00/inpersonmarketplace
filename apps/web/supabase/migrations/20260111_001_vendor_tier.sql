-- Add vendor tier column for subscription-based limits
-- Standard tier: 5 listings per market, 1 traditional market
-- Premium tier: 10 listings per market, 3 traditional markets

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.vendor_profiles
    ADD COLUMN tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'premium'));
  END IF;
END $$;

-- Create index for tier lookups
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_tier ON public.vendor_profiles(tier);
