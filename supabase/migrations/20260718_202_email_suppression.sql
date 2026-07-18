-- ============================================================================
-- Migration 202: user_profiles email suppression (NOT-5, user decisions
--                2026-07-18 — all 4 recommendations confirmed)
-- ============================================================================
-- email_events (Resend webhook) records hard bounces / spam complaints /
-- delivery delays — but NOTHING read it at send time, so the platform kept
-- paying to email dead addresses and spam-complainers (sender-reputation
-- damage on top of the per-send cost).
--
-- Design (D-N1..4, all user-confirmed):
--   1. Suppress on HARD bounce + spam complaint immediately; never on soft
--      bounce / delivery delay (transient).
--   2. Mechanism = this flag on user_profiles, written once by the Resend
--      webhook; the send path already loads user_profiles (NOT-2 prefetch),
--      so the send-time check adds zero queries once this column exists
--      (pre-migration the code falls back to a legacy select — see companion).
--   3. Un-suppress automatically when the user changes their email address
--      (companion code clears the flag on profile email update) + admin
--      manual clear (plain UPDATE).
--   4. One free in_app notification when suppression trips ("your email is
--      bouncing — update it").
--
-- ADDITIVE — 2 nullable columns, no backfill (pre-existing bounce history in
-- email_events is admin-visible but does not retro-suppress; suppression
-- starts with the next qualifying event).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_suppressed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_suppression_reason TEXT NULL;

COMMENT ON COLUMN user_profiles.email_suppressed_at IS
  'NOT-5 (mig 202): set by the Resend webhook on a hard bounce or spam complaint. While set, the notification email channel is skipped for this user (in_app always still delivers). Cleared when the user changes their profile email, or manually by an admin.';
COMMENT ON COLUMN user_profiles.email_suppression_reason IS
  'Why email is suppressed: hard_bounce | complaint (mig 202).';

-- D-N3: un-suppress automatically when the email ADDRESS changes — a trigger
-- catches every write path (auth sync, admin edit, future routes), not just
-- one route. Admin manual clear = plain UPDATE setting the columns NULL.
CREATE OR REPLACE FUNCTION clear_email_suppression_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_suppressed_at := NULL;
    NEW.email_suppression_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_email_suppression ON user_profiles;
CREATE TRIGGER trg_clear_email_suppression
  BEFORE UPDATE OF email ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION clear_email_suppression_on_change();

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- 1) SELECT column_name FROM information_schema.columns
--    WHERE table_name='user_profiles' AND column_name LIKE 'email_suppress%';
--    → 2 rows.
-- 2) Trigger a hard bounce in Resend's test mode (or insert a synthetic
--    email.bounced webhook event) → the user's row gains email_suppressed_at
--    + reason 'hard_bounce', an in_app notice appears, and subsequent
--    notifications to them skip the email channel (in_app still arrives).
-- 3) Change that user's profile email → both columns reset to NULL.
-- ============================================================================
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_clear_email_suppression ON user_profiles;
--   DROP FUNCTION IF EXISTS clear_email_suppression_on_change();
--   ALTER TABLE user_profiles
--     DROP COLUMN IF EXISTS email_suppressed_at,
--     DROP COLUMN IF EXISTS email_suppression_reason;
-- (Companion code is tolerant of the columns being absent.)
