-- Migration 123: Add selection_email_sent_at to prevent duplicate organizer emails
--
-- Problem: When organizer submits vendor selections (self-service flow), the
-- select route sends a confirmation email with QR + marketing kit. If admin
-- later manually sets status='ready', the admin route sends a second nearly
-- identical "vendors confirmed" email. Organizer receives duplicates.
--
-- Fix: Stamp selection_email_sent_at when the selection email fires. Admin
-- route checks it before sending — if already stamped, skips the email.

ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS selection_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN catering_requests.selection_email_sent_at IS
  'Timestamp when the vendor-selection confirmation email was sent to the organizer. Used to prevent duplicate emails when admin also transitions status to ready.';
