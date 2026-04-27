-- Migration 127: Update vendor_payouts_has_reference constraint to include
-- market_box_subscription_id as a valid reference column.
--
-- Background: vendor_payouts has market_box_subscription_id column for the
-- market-box subscription payout flow (helper at lib/stripe/market-box-payout.ts
-- inserts with only this reference set). The existing check constraint only
-- accepts order_item_id or market_box_pickup_id, causing all market box
-- subscription payout inserts to fail silently with ERR_PAYOUT_003.
--
-- Discovered while backfilling Order #FA-2026-34616411 on 2026-04-25:
-- vendor farmersmarketingapp+vegvendor1 was charged $106.65 for a biweekly
-- market box subscription, subscription was created, pickup completed, but
-- vendor_payouts had zero rows for the subscription because the helper's
-- INSERT silently violated the check constraint.
--
-- Fix: extend the constraint to accept market_box_subscription_id as a
-- valid reference. No data migration required — only constraint logic.

BEGIN;

ALTER TABLE public.vendor_payouts
  DROP CONSTRAINT IF EXISTS vendor_payouts_has_reference;

ALTER TABLE public.vendor_payouts
  ADD CONSTRAINT vendor_payouts_has_reference
  CHECK (
    order_item_id IS NOT NULL
    OR market_box_pickup_id IS NOT NULL
    OR market_box_subscription_id IS NOT NULL
  );

COMMIT;
