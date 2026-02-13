-- Migration: Fix premium window restock regression
-- Date: 2026-02-09
-- Problem: Migration 20260201_002 re-added the restock condition to set_listing_premium_window()
--   that was intentionally removed in 20260129_002. Any quantity increase on a published listing
--   was resetting premium_window_ends_at, hiding the listing from standard buyers for 2 hours.
-- Fix: Remove the restock condition. Premium window only applies to:
--   1. New listing published (INSERT with status='published')
--   2. Draft listing published (UPDATE from draft to published)

CREATE OR REPLACE FUNCTION set_listing_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_minutes INTEGER;
BEGIN
  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Only new publish (INSERT or draft→published), NOT restocks
  IF (TG_OP = 'INSERT' AND NEW.status = 'published') OR
     (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'published') THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

-- Clear any currently-active premium windows caused by restocks
UPDATE listings
SET premium_window_ends_at = NULL
WHERE premium_window_ends_at > NOW()
  AND status = 'published';
