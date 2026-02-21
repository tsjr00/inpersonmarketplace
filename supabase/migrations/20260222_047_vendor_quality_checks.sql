-- Migration 047: Vendor Quality Checks
-- Creates tables for nightly vendor quality scan system
-- Tables: vendor_quality_scan_log, vendor_quality_findings

-- ============================================================
-- Table: vendor_quality_scan_log
-- Tracks each nightly batch run
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendor_quality_scan_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  vendors_scanned INTEGER NOT NULL DEFAULT 0,
  findings_created INTEGER NOT NULL DEFAULT 0,
  findings_by_check JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Admin SELECT only, service role writes
ALTER TABLE public.vendor_quality_scan_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_scan_log" ON public.vendor_quality_scan_log;
CREATE POLICY "admin_select_scan_log" ON public.vendor_quality_scan_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
  );

-- ============================================================
-- Table: vendor_quality_findings
-- Individual findings from quality checks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendor_quality_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES public.verticals(vertical_id),
  check_type TEXT NOT NULL
    CHECK (check_type IN (
      'schedule_conflict',
      'low_stock_event',
      'price_anomaly',
      'ghost_listing',
      'inventory_velocity'
    )),
  severity TEXT NOT NULL
    CHECK (severity IN ('action_required', 'heads_up', 'suggestion')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  reference_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dismissed', 'superseded')),
  batch_id UUID REFERENCES public.vendor_quality_scan_log(id),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vqf_vendor_active
  ON public.vendor_quality_findings (vendor_profile_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_vqf_vendor_dismissed
  ON public.vendor_quality_findings (vendor_profile_id, check_type, reference_key)
  WHERE status = 'dismissed';

CREATE INDEX IF NOT EXISTS idx_vqf_batch
  ON public.vendor_quality_findings (batch_id);

-- RLS: Vendors SELECT/UPDATE own, admin SELECT all, service role writes
ALTER TABLE public.vendor_quality_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_select_own_findings" ON public.vendor_quality_findings;
CREATE POLICY "vendor_select_own_findings" ON public.vendor_quality_findings
  FOR SELECT
  USING (
    vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "vendor_update_own_findings" ON public.vendor_quality_findings;
CREATE POLICY "vendor_update_own_findings" ON public.vendor_quality_findings
  FOR UPDATE
  USING (
    vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_select_all_findings" ON public.vendor_quality_findings;
CREATE POLICY "admin_select_all_findings" ON public.vendor_quality_findings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
  );

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
