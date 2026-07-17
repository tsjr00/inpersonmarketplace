-- =============================================================================
-- Migration 195: order_ratings policies — tie the rating to a vendor ON the order (AUT-1)
-- =============================================================================
-- WHY (review slice 7, AUT-1): mig 20260123_002's INSERT policy verifies the
-- buyer owns the completed ORDER but never constrains vendor_profile_id — and
-- the UPDATE policy has no WITH CHECK at all. So via direct PostgREST:
--   * INSERT: a buyer with any one completed order could plant a rating on ANY
--     vendor (the update_vendor_rating_stats trigger then rewrites that
--     vendor's public average_rating / rating_count);
--   * UPDATE: a buyer could retarget an existing legitimate rating's
--     vendor_profile_id at a different vendor.
-- The API route now enforces the order_items tie (same commit); this migration
-- adds the same constraint at the policy layer as defense-in-depth, closing
-- the direct-PostgREST path.
--
-- Policy hygiene per rls-policy-workflow.md: DROP before CREATE; `(SELECT
-- auth.uid())` form; both policies for this table recreated in one migration.
-- SELECT ("Anyone can view ratings") and DELETE ("own ratings") policies are
-- correct and untouched. Existing rows are unaffected (policies gate new
-- writes only); legitimate ratings always satisfy the new EXISTS.
-- =============================================================================

-- INSERT: buyer owns the completed order AND the rated vendor is on the order.
DROP POLICY IF EXISTS "Buyers can create ratings for their orders" ON order_ratings;
CREATE POLICY "Buyers can create ratings for their orders"
  ON order_ratings FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = buyer_user_id
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_ratings.order_id
        AND o.buyer_user_id = (SELECT auth.uid())
        AND o.status = 'completed'
    )
    AND EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = order_ratings.order_id
        AND oi.vendor_profile_id = order_ratings.vendor_profile_id
    )
  );

-- UPDATE: same owner gate, plus WITH CHECK so the row can't be retargeted at a
-- vendor who isn't on the order (the original policy had no WITH CHECK).
DROP POLICY IF EXISTS "Buyers can update their own ratings" ON order_ratings;
CREATE POLICY "Buyers can update their own ratings"
  ON order_ratings FOR UPDATE
  USING ((SELECT auth.uid()) = buyer_user_id)
  WITH CHECK (
    (SELECT auth.uid()) = buyer_user_id
    AND EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = order_ratings.order_id
        AND oi.vendor_profile_id = order_ratings.vendor_profile_id
    )
  );

NOTIFY pgrst, 'reload schema';

-- Verification (run after applying):
--   SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename = 'order_ratings' ORDER BY policyname;
--   -- expect 4 policies; INSERT + UPDATE with_check both contain 'order_items'.
--
-- ROLLBACK: re-apply the two policies from 20260123_002_order_ratings.sql:63-88.
