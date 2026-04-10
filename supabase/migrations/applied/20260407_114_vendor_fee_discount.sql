-- Vendor Fee Discount System
-- Allows selective reduction of vendor platform fees for grant/partner vendors.
-- Vendor enters a code, admin verifies and sets actual fee rate.
-- Floor is 3.6% (covers Stripe processing). $0.15 flat fees never change.
-- Buyer fees are NEVER affected.

ALTER TABLE vendor_profiles
  ADD COLUMN vendor_fee_override_percent NUMERIC,
  ADD COLUMN fee_discount_code TEXT,
  ADD COLUMN fee_discount_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN fee_discount_approved_at TIMESTAMPTZ;

-- Floor constraint: if set, must be between 3.6% and 6.5%
ALTER TABLE vendor_profiles
  ADD CONSTRAINT ck_vendor_fee_override_floor
  CHECK (vendor_fee_override_percent IS NULL OR
         (vendor_fee_override_percent >= 3.6 AND vendor_fee_override_percent <= 6.5));

-- Notify PostgREST to pick up new columns
NOTIFY pgrst, 'reload schema';
