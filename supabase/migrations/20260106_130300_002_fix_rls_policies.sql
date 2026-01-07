-- =============================================================================
-- Migration: Fix overly permissive RLS policies
-- =============================================================================
-- Created: 2026-01-06 13:03:00 CST
-- Author: Claude Code
--
-- Purpose: Replace WITH CHECK (true) with proper conditions
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
-- =============================================================================

-- Fix audit_log: Only service_role should insert
DROP POLICY IF EXISTS "System can insert audit entries" ON public.audit_log;

CREATE POLICY "Service role can insert audit entries"
ON public.audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Fix notifications: Only service_role or system should insert
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Service role can create notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- Alternative: Allow authenticated users to create their own notifications
CREATE POLICY "Users can create own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Verify
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('audit_log', 'notifications');
