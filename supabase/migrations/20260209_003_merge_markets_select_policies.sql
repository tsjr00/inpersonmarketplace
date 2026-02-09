-- Merge two duplicate permissive SELECT policies on markets table.
--
-- markets_select:        approved+active OR vendor owns it
-- markets_public_select: approved+active OR vendor owns it OR buyer order history
--                        OR platform admin OR vertical admin
--
-- markets_public_select is a complete superset of markets_select.
-- We keep the comprehensive logic, drop both, and recreate as one policy.
-- This is a pure performance optimization — no behavioral change.

DROP POLICY IF EXISTS "markets_select" ON public.markets;
DROP POLICY IF EXISTS "markets_public_select" ON public.markets;

CREATE POLICY "markets_select" ON public.markets
  FOR SELECT TO public
  USING (
    -- Public: approved and active markets
    ((approval_status = 'approved'::market_approval_status) AND (active = true))
    -- Vendor: owns this market
    OR (submitted_by_vendor_id IN (SELECT user_vendor_profile_ids()))
    -- Buyer: has orders at this market (direct market_id on order_items)
    OR (id IN (
      SELECT oi.market_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid())
        AND oi.market_id IS NOT NULL
    ))
    -- Buyer: has orders for listings at this market (via listing_markets)
    OR (id IN (
      SELECT lm.market_id
      FROM listing_markets lm
      JOIN order_items oi ON oi.listing_id = lm.listing_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid())
    ))
    -- Admin: platform admin
    OR (SELECT is_platform_admin())
    -- Admin: vertical admin for this market's vertical
    OR is_vertical_admin(vertical_id)
  );
