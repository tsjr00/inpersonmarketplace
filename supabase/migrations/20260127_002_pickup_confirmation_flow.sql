-- Pickup confirmation flow: dual-confirmation system
-- Buyer confirms receipt -> vendor counter-confirms handoff -> transfer triggers

-- Add vendor confirmation and confirmation window columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_confirmed_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS confirmation_window_expires_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS lockdown_active BOOLEAN DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS lockdown_initiated_at TIMESTAMPTZ;

-- Track dispute/issue reports
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_reported_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_reported_by TEXT; -- 'buyer' | 'vendor'
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_description TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_resolved_by TEXT; -- 'admin' | 'system'

-- Index for finding unresolved confirmations (lockdown checks)
CREATE INDEX IF NOT EXISTS idx_order_items_unresolved_confirmation
  ON order_items(vendor_confirmed_at)
  WHERE buyer_confirmed_at IS NOT NULL AND vendor_confirmed_at IS NULL;

-- Index for lockdown queries
CREATE INDEX IF NOT EXISTS idx_order_items_lockdown
  ON order_items(lockdown_active)
  WHERE lockdown_active = true;
