-- Legal agreement acceptance tracking
-- Supports 3 tiers: platform_user (Tier 1), vendor_service (Tier 2), vendor_partner (Tier 3)
-- Creates audit trail for legal enforceability of tiered agreements

CREATE TABLE IF NOT EXISTS public.user_agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('platform_user', 'vendor_service', 'vendor_partner')),
  agreement_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  vertical_id TEXT REFERENCES public.verticals(vertical_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_uaa_user_id ON public.user_agreement_acceptances(user_id);
CREATE INDEX idx_uaa_type_version ON public.user_agreement_acceptances(agreement_type, agreement_version);

-- RLS
ALTER TABLE public.user_agreement_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can view their own acceptance records
DROP POLICY IF EXISTS "Users can view own acceptances" ON public.user_agreement_acceptances;
CREATE POLICY "Users can view own acceptances"
  ON public.user_agreement_acceptances FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Users can insert their own acceptance records
DROP POLICY IF EXISTS "Users can insert own acceptances" ON public.user_agreement_acceptances;
CREATE POLICY "Users can insert own acceptances"
  ON public.user_agreement_acceptances FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Admin access via service role bypasses RLS automatically

NOTIFY pgrst, 'reload schema';
