-- Migration 017: Fix carts.vertical_id type mismatch (UUID → TEXT)
--
-- Problem: carts.vertical_id is UUID with FK to verticals.id (UUID PK),
-- but ALL other tables use TEXT vertical_id with FK to verticals.vertical_id (TEXT slug).
-- This means food_trucks cart operations silently fail because the vertical_id
-- value 'food_trucks' (TEXT) doesn't match the UUID column type.
--
-- Fix: Alter column to TEXT and repoint FK to verticals.vertical_id

-- Step 1: Drop existing FK constraint
ALTER TABLE public.carts
  DROP CONSTRAINT IF EXISTS carts_vertical_id_fkey;

-- Step 2: Drop indexes that reference the column (will recreate after type change)
DROP INDEX IF EXISTS idx_carts_vertical;
DROP INDEX IF EXISTS carts_user_id_vertical_id_key;

-- Step 3: Alter column type from UUID to TEXT
-- Any existing UUID values will be cast to text (harmless for dev/staging with empty carts)
ALTER TABLE public.carts
  ALTER COLUMN vertical_id TYPE text USING vertical_id::text;

-- Step 4: Recreate FK to verticals.vertical_id (TEXT slug) instead of verticals.id (UUID)
ALTER TABLE public.carts
  ADD CONSTRAINT carts_vertical_id_fkey
  FOREIGN KEY (vertical_id) REFERENCES public.verticals(vertical_id);

-- Step 5: Recreate indexes
CREATE INDEX idx_carts_vertical ON public.carts USING btree (vertical_id);
CREATE UNIQUE INDEX carts_user_id_vertical_id_key ON public.carts USING btree (user_id, vertical_id);

-- Step 6: Clear any orphaned cart data where vertical_id was a UUID string
-- (won't match any verticals.vertical_id since those are slugs like 'farmers_market')
DELETE FROM public.cart_items
WHERE cart_id IN (
  SELECT c.id FROM public.carts c
  LEFT JOIN public.verticals v ON v.vertical_id = c.vertical_id
  WHERE v.vertical_id IS NULL
);

DELETE FROM public.carts c
WHERE NOT EXISTS (
  SELECT 1 FROM public.verticals v WHERE v.vertical_id = c.vertical_id
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
