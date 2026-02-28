-- Market Box Subscription Payout: Full prepaid vendor payout at checkout
-- Previously, vendors were paid per-pickup (F2 FIX). Business rule: vendor gets
-- paid the full prepaid amount when buyer pays, not per-pickup.
-- This adds a subscription-level reference to vendor_payouts for full-term payouts.

-- Add column for subscription-level payouts
ALTER TABLE vendor_payouts
  ADD COLUMN market_box_subscription_id UUID REFERENCES market_box_subscriptions(id);

-- Unique index: one active payout per subscription (prevents double payout)
-- Matches the pattern of idx_vendor_payouts_order_item_unique for regular orders
CREATE UNIQUE INDEX idx_vendor_payouts_mb_sub_unique
  ON vendor_payouts (market_box_subscription_id)
  WHERE market_box_subscription_id IS NOT NULL
    AND status NOT IN ('failed', 'cancelled');

-- Performance index for lookups by subscription
CREATE INDEX idx_payouts_mb_subscription
  ON vendor_payouts (market_box_subscription_id)
  WHERE market_box_subscription_id IS NOT NULL;
