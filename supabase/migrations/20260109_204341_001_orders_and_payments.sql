-- ============================================================================
-- Migration: Phase 3 - Orders and Payments
-- Created: 2026-01-09 20:43:41
-- Purpose: Add complete commerce system (orders, payments, payouts)
-- Dependencies: Existing listings, vendor_profiles, user_profiles tables
-- ============================================================================

-- Applied to:
-- [x] Dev (project-ref: vawpviatqalicckkqchs) - Date: 2026-01-09 20:43
-- [x] Staging (project-ref: vfknvsxfgcwqmlkuzhnq) - Date: 2026-01-09 21:15

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Order status
CREATE TYPE order_status AS ENUM (
  'pending',      -- Created but not paid
  'paid',         -- Payment successful
  'confirmed',    -- Vendor confirmed
  'ready',        -- Ready for pickup
  'completed',    -- All items picked up
  'cancelled',    -- Buyer cancelled before payment
  'refunded'      -- Full refund processed
);

-- Order item status
CREATE TYPE order_item_status AS ENUM (
  'pending',      -- Awaiting vendor confirmation
  'confirmed',    -- Vendor accepted
  'ready',        -- Vendor marked ready for pickup
  'fulfilled',    -- Buyer picked up
  'cancelled',    -- Vendor cancelled
  'refunded'      -- Refunded to buyer
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
);

-- Payout status
CREATE TYPE payout_status AS ENUM (
  'pending',      -- Awaiting transfer
  'processing',   -- Stripe processing
  'completed',    -- Successfully transferred
  'failed',       -- Transfer failed
  'cancelled'     -- Cancelled before transfer
);

-- Listing type (add to existing listings table)
CREATE TYPE listing_type AS ENUM ('presale', 'flash', 'market_box');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Orders table (buyer's cart)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  order_number TEXT UNIQUE NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE orders IS 'Buyer orders (shopping carts)';
COMMENT ON COLUMN orders.order_number IS 'Human-readable order number (e.g., FW-2026-00001)';
COMMENT ON COLUMN orders.subtotal_cents IS 'Sum of all order items before fees';
COMMENT ON COLUMN orders.platform_fee_cents IS 'Total platform fees (buyer + vendor fees)';
COMMENT ON COLUMN orders.total_cents IS 'Final amount charged to buyer';

-- Order items table (links orders to bundles)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  vendor_payout_cents INTEGER NOT NULL,
  status order_item_status NOT NULL DEFAULT 'pending',
  pickup_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Individual items within orders';
COMMENT ON COLUMN order_items.unit_price_cents IS 'Price per unit at time of purchase (base price)';
COMMENT ON COLUMN order_items.subtotal_cents IS 'quantity × unit_price_cents';
COMMENT ON COLUMN order_items.platform_fee_cents IS 'Total platform fee for this item';
COMMENT ON COLUMN order_items.vendor_payout_cents IS 'Amount vendor receives after platform fee';

-- Payments table (Stripe tracking)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Stripe payment tracking';
COMMENT ON COLUMN payments.stripe_payment_intent_id IS 'Stripe payment intent ID';
COMMENT ON COLUMN payments.amount_cents IS 'Total amount charged to buyer';

-- Vendor payouts table (Stripe Connect transfers)
CREATE TABLE vendor_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  amount_cents INTEGER NOT NULL,
  stripe_transfer_id TEXT UNIQUE,
  status payout_status NOT NULL DEFAULT 'pending',
  transferred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_payouts IS 'Stripe Connect transfers to vendors';
COMMENT ON COLUMN vendor_payouts.stripe_transfer_id IS 'Stripe transfer ID';
COMMENT ON COLUMN vendor_payouts.amount_cents IS 'Amount transferred to vendor';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Orders indexes
CREATE INDEX idx_orders_buyer ON orders(buyer_user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_vertical ON orders(vertical_id);

-- Order items indexes
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_profile_id);
CREATE INDEX idx_order_items_listing ON order_items(listing_id);
CREATE INDEX idx_order_items_status ON order_items(status);

-- Payments indexes
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Vendor payouts indexes
CREATE INDEX idx_payouts_vendor ON vendor_payouts(vendor_profile_id);
CREATE INDEX idx_payouts_order_item ON vendor_payouts(order_item_id);
CREATE INDEX idx_payouts_status ON vendor_payouts(status);

-- ============================================================================
-- ALTER EXISTING TABLES
-- ============================================================================

-- Add Stripe Connect fields to vendor_profiles
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN vendor_profiles.stripe_account_id IS 'Stripe Connect account ID';
COMMENT ON COLUMN vendor_profiles.stripe_onboarding_complete IS 'Has vendor completed Stripe onboarding';
COMMENT ON COLUMN vendor_profiles.stripe_charges_enabled IS 'Can vendor accept charges';
COMMENT ON COLUMN vendor_profiles.stripe_payouts_enabled IS 'Can vendor receive payouts';

-- Add listing_type to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_type listing_type DEFAULT 'presale';

COMMENT ON COLUMN listings.listing_type IS 'Type of listing: presale, flash, market_box';

-- Add fee structure to verticals (if not exists)
ALTER TABLE verticals
  ADD COLUMN IF NOT EXISTS buyer_fee_percent DECIMAL(4,2) DEFAULT 6.5,
  ADD COLUMN IF NOT EXISTS vendor_fee_percent DECIMAL(4,2) DEFAULT 6.5;

COMMENT ON COLUMN verticals.buyer_fee_percent IS 'Buyer markup percentage (default 6.5%)';
COMMENT ON COLUMN verticals.vendor_fee_percent IS 'Vendor deduction percentage (default 6.5%)';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payouts ENABLE ROW LEVEL SECURITY;

-- Orders: Buyers see their own orders
CREATE POLICY orders_buyer_select ON orders
  FOR SELECT
  USING (auth.uid() = buyer_user_id);

-- Orders: Buyers can insert their own orders
CREATE POLICY orders_buyer_insert ON orders
  FOR INSERT
  WITH CHECK (auth.uid() = buyer_user_id);

-- Orders: Vendors see orders containing their items
CREATE POLICY orders_vendor_select ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendor_profiles vp ON oi.vendor_profile_id = vp.id
      WHERE oi.order_id = orders.id AND vp.user_id = auth.uid()
    )
  );

-- Order items: Buyers see items in their orders
CREATE POLICY order_items_buyer_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- Order items: Buyers can insert items in their orders
CREATE POLICY order_items_buyer_insert ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- Order items: Vendors see their items
CREATE POLICY order_items_vendor_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- Order items: Vendors can update their items (status changes)
CREATE POLICY order_items_vendor_update ON order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- Payments: Buyers see their payments
CREATE POLICY payments_buyer_select ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = payments.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- Vendor payouts: Vendors see their payouts
CREATE POLICY vendor_payouts_select ON vendor_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = vendor_payouts.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated timestamp triggers (reuse existing function if available)
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER vendor_payouts_updated_at
  BEFORE UPDATE ON vendor_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
