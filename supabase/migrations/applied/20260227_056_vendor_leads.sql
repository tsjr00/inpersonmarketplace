-- ============================================================================
-- Migration: Vendor Lead Capture
-- Created: 2026-02-27
-- Purpose: Create vendor_leads table for pre-launch lead capture forms.
--   Stores prospective vendor signups from QR code landing pages.
-- ============================================================================

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL DEFAULT 'food_trucks' REFERENCES public.verticals(vertical_id),
  business_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  social_link TEXT,
  website TEXT,
  interested_in_demo BOOLEAN NOT NULL DEFAULT false,
  questions TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Prevent duplicate submissions per email per vertical
CREATE UNIQUE INDEX idx_vendor_leads_email_vertical
  ON public.vendor_leads(email, vertical_id);

-- Admin filtering
CREATE INDEX idx_vendor_leads_status ON public.vendor_leads(status);
CREATE INDEX idx_vendor_leads_created ON public.vendor_leads(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendor_leads ENABLE ROW LEVEL SECURITY;

-- Admin-only read access
DROP POLICY IF EXISTS "vendor_leads_admin_select" ON public.vendor_leads;
CREATE POLICY "vendor_leads_admin_select" ON public.vendor_leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'admin'
    )
  );

-- Admin-only update (status changes, notes)
DROP POLICY IF EXISTS "vendor_leads_admin_update" ON public.vendor_leads;
CREATE POLICY "vendor_leads_admin_update" ON public.vendor_leads
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'admin'
    )
  );

-- No public insert policy — inserts go through service client in API route

-- ── Triggers ─────────────────────────────────────────────────────────────────

CREATE TRIGGER set_vendor_leads_updated_at
  BEFORE UPDATE ON public.vendor_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── Notify PostgREST ─────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
