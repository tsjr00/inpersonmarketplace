-- Migration 117: Add vertical_id to error_logs for vertical-scoped error dashboards
--
-- Vertical admins need to see only errors from their vertical's routes.
-- error_logs previously had no vertical signal. This column is nullable —
-- existing rows and shared/platform routes remain NULL (visible in
-- platform admin only). Routes that know their vertical populate it
-- going forward via withErrorTracing's new options param.

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS vertical_id TEXT REFERENCES verticals(vertical_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_vertical ON error_logs(vertical_id) WHERE vertical_id IS NOT NULL;
