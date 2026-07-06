-- ============================================================================
-- Migration 180: park_vendor_vetting.docs_notified_at (B3 docs-to-review dedup)
-- ============================================================================
-- Marker for the docs-to-review notification sweep: the last time we pinged
-- the park operator that this truck's compliance docs changed. The sweep
-- notifies only when vendor_verifications.updated_at is newer than
-- MAX(docs_notified_at, docs_reviewed_at) — so a manager gets one ping per
-- doc change, not one per file. ADDITIVE, nullable.
-- ============================================================================
ALTER TABLE park_vendor_vetting ADD COLUMN IF NOT EXISTS docs_notified_at TIMESTAMPTZ NULL;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK: ALTER TABLE park_vendor_vetting DROP COLUMN IF EXISTS docs_notified_at;
