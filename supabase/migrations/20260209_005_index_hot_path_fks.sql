-- Add indexes on foreign keys that appear in hot RLS policy paths.
-- These FKs are evaluated on every query against their respective tables
-- but had no covering index, causing sequential scans during policy checks.

-- markets: submitted_by_vendor_id used in INSERT/UPDATE/DELETE RLS policies
CREATE INDEX IF NOT EXISTS idx_markets_submitted_by_vendor_id
  ON public.markets (submitted_by_vendor_id);

-- transactions: vertical_id used in is_admin_for_vertical(vertical_id) RLS check
CREATE INDEX IF NOT EXISTS idx_transactions_vertical_id
  ON public.transactions (vertical_id);
