-- Migration 206: markets.required_docs — structured park required-documents list
--
-- Tester finding 2026-07-23 (owner decision: structured column). Replaces the
-- free-text markets.required_docs_note (mig 192) with a structured list so the
-- operator picks from the SAME standard food-truck permits the vendor uploads
-- against in onboarding (MFU permit, Certified Food Manager, Food Handler's
-- Card, Fire Safety Certificate, Commissary Agreement), plus repeatable
-- free-text "Other" entries. Display-only at booking — enforcement stays human
-- review (book-then-vet), exactly as mig 192; this only changes the SHAPE of
-- what the operator can say, not that it's advisory.
--
-- Shape: an array of entries.
--   Standard: {"key": "mfu_permit"}                (key ∈ the 5 permit types)
--   Custom:   {"key": "other", "label": "City noise permit"}   (repeatable)
--
-- ADDITIVE. One new NOT NULL column with a default so existing rows are valid
-- immediately. required_docs_note is DELIBERATELY KEPT (not dropped) — dropping
-- is destructive and the column is still referenced until the code cutover
-- lands; after this it becomes a dormant legacy column.
--
-- BACKFILL: markets that already have a non-empty required_docs_note get that
-- text preserved as a single {"key":"other","label":<note>} entry, so no
-- operator loses what they typed. The label is truncated to 120 chars to match
-- the app-side MAX_CUSTOM_DOC_LABEL cap.
--
-- Companion code (same commit, PRE-MIGRATION SAFE — mirrors mig 192/205):
-- lib/markets/required-docs.ts (tolerant parse → []), the required-docs GET/PATCH
-- route, ParkRequiredDocsCard (checkbox list + Other rows), and the booking-form
-- display all tolerate the column being absent, so every surface renders even
-- before this migration applies.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS required_docs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN markets.required_docs IS
  'Structured park required-documents list (FT parks). JSONB array of entries: {"key":"<permit_type>"} for standard food-truck permits (labels from onboarding FOOD_TRUCK_PERMIT_REQUIREMENTS) or {"key":"other","label":"..."} for custom. Display-only at booking (book-then-vet). Supersedes required_docs_note (mig 192), which is kept dormant.';

-- Preserve any existing free-text note as a single "other" entry.
UPDATE markets
SET required_docs = jsonb_build_array(
      jsonb_build_object('key', 'other', 'label', left(btrim(required_docs_note), 120))
    )
WHERE required_docs_note IS NOT NULL
  AND btrim(required_docs_note) <> ''
  AND required_docs = '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE markets DROP COLUMN IF EXISTS required_docs;
-- (required_docs_note is untouched by this migration, so nothing to restore there.)
