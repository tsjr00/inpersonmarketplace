-- Migration: Market Box Stripe Integration
-- Created: 2026-01-31
-- Description: Add Stripe payment intent tracking to market box subscriptions

-- Add column to track the Stripe payment intent for idempotency
ALTER TABLE market_box_subscriptions
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Add unique index to prevent duplicate subscriptions from same payment
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_box_subscriptions_payment_intent
ON market_box_subscriptions(stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

-- Add index for lookup by payment intent
CREATE INDEX IF NOT EXISTS idx_market_box_subscriptions_buyer_offering
ON market_box_subscriptions(buyer_user_id, offering_id, status);
