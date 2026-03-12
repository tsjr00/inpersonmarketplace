-- Migration 078: Session 52 Audit Fixes (batch 1)
-- Addresses: C-1, C-2, H-8, M-7, M-13 from Session 51 audit
--
-- C-1: atomic_decrement_inventory rewrite — RAISE EXCEPTION on oversell
-- C-2: Add can_vendor_publish() check to listing tier trigger
-- H-8: Create atomic_restore_inventory() RPC
-- M-7: Fix is_platform_admin() to check 'platform_admin' role
-- M-13: Add cancellation_fee_cents column to order_items

-- ============================================================
-- C-1: Rewrite atomic_decrement_inventory to reject overselling
-- Business rule MP-R8: "quantity never goes negative"
-- Old behavior: GREATEST(0, qty-n) — silently clamps to zero
-- New behavior: RAISE EXCEPTION when quantity < requested
-- Also: Sets listing to 'draft' when inventory hits 0
-- ============================================================

CREATE OR REPLACE FUNCTION atomic_decrement_inventory(
  p_listing_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE(new_quantity INTEGER) AS $$
DECLARE
  v_current_qty INTEGER;
  v_new_qty INTEGER;
  v_vendor_user_id UUID;
BEGIN
  -- Lock the row and get current quantity
  SELECT quantity INTO v_current_qty
  FROM listings
  WHERE id = p_listing_id
    AND quantity IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found or has unlimited inventory'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient inventory: % available, % requested',
      v_current_qty, p_quantity
      USING ERRCODE = 'P0003';
  END IF;

  v_new_qty := v_current_qty - p_quantity;

  -- Update inventory
  UPDATE listings
  SET quantity = v_new_qty,
      updated_at = NOW()
  WHERE id = p_listing_id;

  -- If inventory hits zero, set listing to draft and notify vendor
  IF v_new_qty = 0 THEN
    UPDATE listings
    SET status = 'draft',
        updated_at = NOW()
    WHERE id = p_listing_id;

    -- Get vendor user_id for notification (handled by app code after RPC returns 0)
  END IF;

  RETURN QUERY SELECT v_new_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION atomic_decrement_inventory(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION atomic_decrement_inventory IS
  'Atomically decrements listing inventory. RAISES EXCEPTION if insufficient stock. Sets listing to draft when inventory reaches zero.';

-- ============================================================
-- C-2: Add can_vendor_publish() check to listing tier trigger
-- Prevents unapproved vendors from publishing via direct DB write
-- can_vendor_publish() already exists (migration 012)
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_listing_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_vertical TEXT;
  v_current_count INTEGER;
  v_max_listings INTEGER;
  v_can_publish BOOLEAN;
BEGIN
  -- Only enforce on status change to 'published' (allows creating drafts freely)
  IF NEW.status != 'published' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if status didn't change (already published, just editing)
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- Get vendor tier and vertical
  SELECT tier, vertical_id INTO v_tier, v_vertical
  FROM vendor_profiles
  WHERE id = NEW.vendor_profile_id;

  -- C-2 FIX: Check vendor onboarding gates before allowing publish
  SELECT can_vendor_publish(NEW.vendor_profile_id, COALESCE(NEW.category, 'Unknown'))
  INTO v_can_publish;

  IF v_can_publish IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot publish: vendor onboarding incomplete. Complete business verification, category authorization, and insurance before publishing.';
  END IF;

  -- Determine max listings based on vertical + tier
  IF v_vertical = 'food_trucks' THEN
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'boss' THEN v_max_listings := 45;
      WHEN 'pro' THEN v_max_listings := 20;
      WHEN 'basic' THEN v_max_listings := 10;
      ELSE v_max_listings := 5; -- free
    END CASE;
  ELSE
    -- Farmers market / other
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'featured' THEN v_max_listings := 30;
      WHEN 'premium' THEN v_max_listings := 20;
      WHEN 'standard' THEN v_max_listings := 10;
      ELSE v_max_listings := 5; -- free
    END CASE;
  END IF;

  -- Count current published listings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'published'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_listings THEN
    RAISE EXCEPTION 'Listing limit reached: % of % active listings for your tier. Upgrade to add more.',
      v_current_count, v_max_listings;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger already exists from migration 036, function is replaced in-place

-- ============================================================
-- H-8: Create atomic_restore_inventory() RPC
-- Mirrors atomic_decrement_inventory pattern for safe restoration
-- Replaces read-then-update pattern in inventory.ts
-- ============================================================

CREATE OR REPLACE FUNCTION atomic_restore_inventory(
  p_listing_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE(new_quantity INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE listings
  SET quantity = quantity + p_quantity,
      updated_at = NOW()
  WHERE id = p_listing_id
    AND quantity IS NOT NULL
  RETURNING quantity AS new_quantity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION atomic_restore_inventory(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION atomic_restore_inventory IS
  'Atomically restores listing inventory after cancellation/expiration. Returns new quantity.';

-- ============================================================
-- M-7: Fix is_platform_admin() to check admin role in both columns
-- 'platform_admin' does not exist in user_role enum — only check 'admin'
-- roles column is user_role[] (enum array), so same constraint applies
-- ============================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = (SELECT auth.uid())
    AND (
      role = 'admin'
      OR 'admin' = ANY(roles)
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_platform_admin() IS
  'Returns true if current user is a platform-wide admin. Checks admin role in both role column and roles array.';

-- ============================================================
-- M-13: Add cancellation_fee_cents column to order_items
-- Currently calculated at cancellation time but not persisted
-- Needed for financial auditing
-- ============================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cancellation_fee_cents INTEGER;

COMMENT ON COLUMN order_items.cancellation_fee_cents IS
  'Total cancellation fee charged to buyer (buyer_share + vendor_share). Set at cancellation time alongside refund_amount_cents.';

-- ============================================================
-- Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
