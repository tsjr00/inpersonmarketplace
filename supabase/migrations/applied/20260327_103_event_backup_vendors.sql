-- Migration 103: Backup vendor support for events
--
-- Adds is_backup flag to market_vendors for the backup vendor escalation system.
-- When an organizer selects their primary trucks, non-selected accepted vendors
-- are marked as backups. If a primary cancels, the backup can be auto-escalated.
--
-- Also adds backup_priority for ordering among multiple backups.
-- See: event_system_deep_dive.md Part 15.4

ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS is_backup BOOLEAN DEFAULT false;
ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS backup_priority INTEGER;
ALTER TABLE public.market_vendors ADD COLUMN IF NOT EXISTS replaced_vendor_id UUID;

NOTIFY pgrst, 'reload schema';
