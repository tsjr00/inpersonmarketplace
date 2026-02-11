-- Migration: Add market box support to cart_items
-- Date: 2026-02-11
-- Purpose: Extend cart_items to hold both regular listing items and market box offerings,
--          enabling unified checkout for mixed carts.
--
-- Changes:
--   1. Add item_type discriminator column (default 'listing' for backwards compat)
--   2. Add offering_id FK to market_box_offerings
--   3. Add term_weeks and start_date for market box items
--   4. Make listing_id nullable (market box items don't have a listing)
--   5. Add CHECK constraint ensuring correct fields per type
--   6. Add unique index preventing duplicate market box offerings per cart
--   7. Update get_cart_summary() to handle market box items

-- Step 1: Add new columns
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'listing',
  ADD COLUMN IF NOT EXISTS offering_id UUID REFERENCES public.market_box_offerings(id),
  ADD COLUMN IF NOT EXISTS term_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS start_date DATE;

-- Step 2: Add CHECK on item_type values
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_item_type_check
    CHECK (item_type IN ('listing', 'market_box'));

-- Step 3: Add CHECK on term_weeks values (only 4 or 8 allowed)
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_term_weeks_check
    CHECK (term_weeks IS NULL OR term_weeks IN (4, 8));

-- Step 4: Make listing_id nullable
-- (existing rows all have listing_id set, so this is safe)
ALTER TABLE public.cart_items
  ALTER COLUMN listing_id DROP NOT NULL;

-- Step 5: Add type-specific constraint
-- Listing items must have listing_id; market box items must have offering_id + term_weeks
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_type_fields_check
    CHECK (
      (item_type = 'listing' AND listing_id IS NOT NULL) OR
      (item_type = 'market_box' AND offering_id IS NOT NULL AND term_weeks IS NOT NULL)
    );

-- Step 6: Unique constraint — one market box offering per cart
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_market_box_unique
  ON public.cart_items(cart_id, offering_id) WHERE item_type = 'market_box';

-- Step 7: Index on offering_id for lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_offering_id
  ON public.cart_items(offering_id) WHERE offering_id IS NOT NULL;

-- Step 8: Replace get_cart_summary to handle both item types
-- Must DROP first because the return type (OUT parameters) is changing
DROP FUNCTION IF EXISTS public.get_cart_summary(UUID);
CREATE OR REPLACE FUNCTION public.get_cart_summary(p_cart_id UUID)
RETURNS TABLE(total_items BIGINT, total_cents BIGINT, vendor_count BIGINT) AS $$
  SELECT
    COALESCE(SUM(
      CASE
        WHEN ci.item_type = 'listing' THEN ci.quantity
        ELSE 1  -- market box always qty 1
      END
    ), 0) AS total_items,
    COALESCE(SUM(
      CASE
        WHEN ci.item_type = 'listing' THEN l.price_cents * ci.quantity
        WHEN ci.item_type = 'market_box' THEN
          CASE
            WHEN ci.term_weeks = 8 THEN COALESCE(mbo.price_8week_cents, mbo.price_4week_cents)
            ELSE mbo.price_4week_cents
          END
        ELSE 0
      END
    ), 0) AS total_cents,
    COUNT(DISTINCT
      CASE
        WHEN ci.item_type = 'listing' THEN l.vendor_profile_id
        WHEN ci.item_type = 'market_box' THEN mbo.vendor_profile_id
      END
    ) AS vendor_count
  FROM public.cart_items ci
  LEFT JOIN public.listings l ON ci.listing_id = l.id AND ci.item_type = 'listing'
  LEFT JOIN public.market_box_offerings mbo ON ci.offering_id = mbo.id AND ci.item_type = 'market_box'
  WHERE ci.cart_id = p_cart_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
