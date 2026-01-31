-- ============================================================================
-- Migration: Vendor Alternative Payment Methods
-- Created: 2026-01-31
-- Purpose: Add support for Venmo, Cash App, PayPal, and cash payments
-- ============================================================================

-- ============================================================================
-- VENDOR PROFILE PAYMENT FIELDS
-- ============================================================================

ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS venmo_username TEXT,
ADD COLUMN IF NOT EXISTS cashapp_cashtag TEXT,
ADD COLUMN IF NOT EXISTS paypal_username TEXT,
ADD COLUMN IF NOT EXISTS accepts_cash_at_pickup BOOLEAN DEFAULT false;

COMMENT ON COLUMN vendor_profiles.venmo_username IS 'Venmo username for deep link payments (without @)';
COMMENT ON COLUMN vendor_profiles.cashapp_cashtag IS 'Cash App $cashtag (without $)';
COMMENT ON COLUMN vendor_profiles.paypal_username IS 'PayPal.me username';
COMMENT ON COLUMN vendor_profiles.accepts_cash_at_pickup IS 'Whether vendor accepts cash payment at pickup';

-- ============================================================================
-- PAYMENT METHOD ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'stripe',
    'venmo',
    'cashapp',
    'paypal',
    'cash'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- ORDERS TABLE - ADD PAYMENT METHOD TRACKING
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_method payment_method DEFAULT 'stripe',
ADD COLUMN IF NOT EXISTS external_payment_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS external_payment_confirmed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN orders.payment_method IS 'How the buyer paid for this order';
COMMENT ON COLUMN orders.external_payment_confirmed_at IS 'When vendor confirmed external payment received';
COMMENT ON COLUMN orders.external_payment_confirmed_by IS 'User who confirmed external payment';

-- ============================================================================
-- VENDOR FEE TRACKING TABLES
-- ============================================================================

-- Running balance of platform fees owed by vendor
CREATE TABLE IF NOT EXISTS vendor_fee_balance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  oldest_unpaid_at TIMESTAMPTZ,
  last_invoice_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_profile_id)
);

COMMENT ON TABLE vendor_fee_balance IS 'Running balance of platform fees owed by vendor from external payments';
COMMENT ON COLUMN vendor_fee_balance.oldest_unpaid_at IS 'Timestamp of oldest unpaid fee entry';

-- Ledger of fee transactions
CREATE TABLE IF NOT EXISTS vendor_fee_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_fee_ledger IS 'Ledger of fee transactions - debits from external orders, credits from payments/deductions';
COMMENT ON COLUMN vendor_fee_ledger.type IS 'debit = fees owed, credit = fees paid/deducted';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vendor_fee_balance_vendor ON vendor_fee_balance(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_fee_ledger_vendor ON vendor_fee_ledger(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_fee_ledger_order ON vendor_fee_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE vendor_fee_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_fee_ledger ENABLE ROW LEVEL SECURITY;

-- Vendor can view their own fee balance
CREATE POLICY vendor_fee_balance_select ON vendor_fee_balance
  FOR SELECT USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Vendor can view their own fee ledger
CREATE POLICY vendor_fee_ledger_select ON vendor_fee_ledger
  FOR SELECT USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Platform admins can view all (via service role)
-- Insert/update handled by API with service role

-- ============================================================================
-- FUNCTION: Update fee balance
-- ============================================================================

CREATE OR REPLACE FUNCTION update_vendor_fee_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate balance from ledger
  INSERT INTO vendor_fee_balance (vendor_profile_id, balance_cents, oldest_unpaid_at, updated_at)
  SELECT
    NEW.vendor_profile_id,
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount_cents ELSE -amount_cents END), 0),
    MIN(CASE WHEN type = 'debit' THEN created_at ELSE NULL END),
    NOW()
  FROM vendor_fee_ledger
  WHERE vendor_profile_id = NEW.vendor_profile_id
  ON CONFLICT (vendor_profile_id) DO UPDATE SET
    balance_cents = EXCLUDED.balance_cents,
    oldest_unpaid_at = EXCLUDED.oldest_unpaid_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Trigger to update balance on ledger changes
DROP TRIGGER IF EXISTS trigger_update_vendor_fee_balance ON vendor_fee_ledger;
CREATE TRIGGER trigger_update_vendor_fee_balance
  AFTER INSERT OR UPDATE OR DELETE ON vendor_fee_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_fee_balance();
