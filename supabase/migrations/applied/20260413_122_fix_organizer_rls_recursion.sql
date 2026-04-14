-- Migration 122: Drop recursive organizer RLS policies
--
-- Root cause: migration 121 added two RLS policies that EXISTS-query the
-- markets table. The pre-existing markets_select policy (migration 075)
-- subqueries order_items. For authenticated users, Postgres detects a
-- cyclic policy reference and raises:
--   "infinite recursion detected in policy for relation markets"
-- This made browse silently return empty and cart return 500 for every
-- signed-in user on prod after migration 121 was applied (2026-04-12).
--
-- Remediation: drop both policies. The organizer-visibility feature they
-- enabled is not yet surfaced in the UI on prod (Session 71 commits have
-- not been pushed). All organizer dashboard queries use serviceClient and
-- bypass RLS. No app functionality depends on these policies.
--
-- If organizer-scoped RLS is reintroduced later, it must use a
-- SECURITY DEFINER helper function to avoid cycling through markets_select.
-- See CLAUDE.md → RLS Policy Changes → Rule 5.

DROP POLICY IF EXISTS "organizer_read_event_order_items" ON public.order_items;
DROP POLICY IF EXISTS "organizer_read_wave_reservations" ON public.event_wave_reservations;

NOTIFY pgrst, 'reload schema';
