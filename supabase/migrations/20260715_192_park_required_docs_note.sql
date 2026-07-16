-- Migration 192: markets.required_docs_note — park-defined required documents
--
-- Tester finding P4b (2026-07-15, user decision: keep it S-M, no compliance
-- engine): the park-spot booking flow tells trucks to upload "the documents
-- this park requires," but operators had no way to SAY what those are.
--
-- One nullable free-text column on markets. The operator writes their list
-- (e.g. "City vending permit / COI naming us as additional insured / County
-- health permit"); the booking form displays it verbatim above the document
-- acknowledgment. Enforcement stays human (book-then-vet review) — this is
-- display-only, deliberately not a structured requirements system.
--
-- Companion code (same commit): manager GET/PATCH at
-- market-manager/[marketId]/required-docs, ParkRequiredDocsCard in the FT
-- park dashboard Setup group, and the booking form display.

ALTER TABLE markets ADD COLUMN IF NOT EXISTS required_docs_note TEXT;

COMMENT ON COLUMN markets.required_docs_note IS
  'Operator-written list of documents vendors must carry to book here (free text, display-only at booking; enforcement is human review). FT parks today; harmless elsewhere.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE markets DROP COLUMN IF EXISTS required_docs_note;
