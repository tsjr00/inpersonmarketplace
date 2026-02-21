-- Migration 048: Buyer Search Log
-- Tracks anonymous buyer search activity for geographic intelligence features.
-- Used by Pro/Boss tier vendors for coverage gap detection.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE public.buyer_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code TEXT,
  vertical_id TEXT REFERENCES public.verticals(vertical_id),
  results_count INTEGER NOT NULL DEFAULT 0,
  search_type TEXT NOT NULL CHECK (search_type IN ('markets', 'vendors')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX idx_bsl_vertical_created ON public.buyer_search_log (vertical_id, created_at DESC);
CREATE INDEX idx_bsl_zip_vertical ON public.buyer_search_log (zip_code, vertical_id) WHERE zip_code IS NOT NULL;
CREATE INDEX idx_bsl_zero_results ON public.buyer_search_log (vertical_id, created_at DESC) WHERE results_count = 0;

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.buyer_search_log ENABLE ROW LEVEL SECURITY;

-- No SELECT for regular users — this is anonymous aggregate data.
-- Admin can view all rows.
CREATE POLICY "Admins can view buyer search log"
  ON public.buyer_search_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'admin'
    )
  );

-- Service role writes (from API routes). No user insert policy needed.
-- The service_role bypasses RLS automatically.

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
