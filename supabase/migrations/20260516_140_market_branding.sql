-- Migration 140: Market co-branding fields
--
-- Adds branding fields to markets so market managers can upload a logo
-- (and a longer description) that renders on:
--   1. The public market profile page (/markets/[id])
--   2. The co-branded vendor invite landing (/[vertical]/vendor-signup?market=<id>)
--
-- Phase B follow-through from staging review 2026-05-16: vendor invite
-- landing wanted to show market branding, but no fields existed for
-- managers to set them. The `description` column already exists (added
-- earlier); only `logo_url` is new here.
--
-- Storage: the logo file itself lives in Supabase Storage (bucket
-- managed by the manager-branding upload endpoint). This column holds
-- the public URL.
--
-- RLS: markets table RLS unchanged. Managers update via service-client
-- API; public reads via existing /api/markets/[id] + /api/markets/[id]/
-- optin-public routes.
--
-- Rollback: ALTER TABLE markets DROP COLUMN logo_url;

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN markets.logo_url IS
  'URL to market logo image stored in Supabase Storage. Set by the market manager via the dashboard branding section. Rendered on the public market profile page and on the vendor invite landing (Phase B co-branding).';

NOTIFY pgrst, 'reload schema';
