-- Migration 065: Add vertical_id to notifications table
-- Fixes cross-vertical notification leakage (notifications from one vertical
-- visible on another vertical's dashboard/bell)

-- Add nullable vertical_id column with FK to verticals table
ALTER TABLE public.notifications
  ADD COLUMN vertical_id TEXT REFERENCES public.verticals(vertical_id);

-- Composite index for the primary query pattern: user + vertical filter
CREATE INDEX idx_notifications_user_vertical
  ON public.notifications(user_id, vertical_id);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
