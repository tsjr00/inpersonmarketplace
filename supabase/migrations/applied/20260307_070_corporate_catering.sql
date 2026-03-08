-- Migration 070: Corporate Catering System
-- Adds catering_requests table for companies to request food truck catering events.
-- Extends markets and market_vendors with catering-specific columns.

-- ============================================================
-- Table: catering_requests
-- Stores company catering inquiries (public form → admin review → event creation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catering_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL DEFAULT 'food_trucks' REFERENCES public.verticals(vertical_id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'approved', 'declined', 'cancelled', 'completed')),

  -- Company info
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,

  -- Event details
  event_date DATE NOT NULL,
  event_end_date DATE,
  event_start_time TIME,
  event_end_time TIME,
  headcount INTEGER NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,

  -- Preferences
  cuisine_preferences TEXT,
  dietary_notes TEXT,
  budget_notes TEXT,
  vendor_count INTEGER DEFAULT 2,
  setup_instructions TEXT,
  additional_notes TEXT,

  -- Lifecycle
  market_id UUID REFERENCES public.markets(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catering_requests IS 'Corporate catering inquiries. Public form submits, admin reviews, approves → creates event market.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_catering_requests_status
  ON public.catering_requests (status);
CREATE INDEX IF NOT EXISTS idx_catering_requests_created
  ON public.catering_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catering_requests_market
  ON public.catering_requests (market_id)
  WHERE market_id IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER set_catering_requests_updated_at
  BEFORE UPDATE ON public.catering_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS: Admin SELECT/UPDATE only, service client inserts from public form
-- ============================================================

ALTER TABLE public.catering_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catering_requests_admin_select" ON public.catering_requests;
CREATE POLICY "catering_requests_admin_select" ON public.catering_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
    OR is_vertical_admin(vertical_id)
  );

DROP POLICY IF EXISTS "catering_requests_admin_update" ON public.catering_requests;
CREATE POLICY "catering_requests_admin_update" ON public.catering_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
    OR is_vertical_admin(vertical_id)
  );

-- ============================================================
-- Extend markets: link to catering request + headcount
-- ============================================================

ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS catering_request_id UUID REFERENCES public.catering_requests(id);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS headcount INTEGER;

-- ============================================================
-- Extend market_vendors: RFP response tracking
-- ============================================================

ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS response_status TEXT
  CHECK (response_status IN ('invited', 'accepted', 'declined'));
ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS response_notes TEXT;
ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_market_vendors_response
  ON public.market_vendors (market_id, response_status)
  WHERE response_status IS NOT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
