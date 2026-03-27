-- Migration 102: Self-service event support
--
-- Adds service_level to distinguish admin-managed from automated events,
-- auto_invite tracking, and organizer account linking.
-- See: event_system_deep_dive.md Parts 14-15

-- Service level: full_service (admin-managed) or self_service (automated, no admin)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS service_level TEXT DEFAULT 'full_service';

-- Timestamp when auto-invitations were sent (self-service only)
-- Used by cron to check response threshold (48hr after this timestamp)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS auto_invite_sent_at TIMESTAMPTZ;

-- Link to organizer's app account (if they created one)
-- Enables in-app notifications and dashboard event management
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS organizer_user_id UUID;

-- Vendor preferences: ordered list of preferred vendors (for "I'll choose" path)
-- Format: [{ vendor_id: UUID, priority: number }]
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS vendor_preferences JSONB;

NOTIFY pgrst, 'reload schema';
