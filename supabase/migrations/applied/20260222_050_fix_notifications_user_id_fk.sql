-- ============================================================================
-- Migration 050: Fix notifications.user_id FK to reference auth.users(id)
-- ============================================================================
-- Problem: notifications.user_id FK references user_profiles(id) (auto-generated
-- surrogate PK), but ALL application code passes auth.uid (from auth.users.id).
-- These are DIFFERENT UUIDs. Result:
--   1. Silent FK violation on every INSERT (caught by service, swallowed)
--   2. Profile lookup fails (.eq('id', authUid) returns null) — breaks email/SMS
--   3. RLS SELECT never matches (compares user_profiles.id vs auth.uid())
--   => ZERO in-app notifications delivered despite 40+ call sites
--
-- Fix: Change FK from user_profiles(id) → auth.users(id) to match callers.
-- ============================================================================

-- Step 1: Translate any existing rows from user_profiles.id → auth.uid
-- (user_profiles.user_id IS auth.uid)
UPDATE notifications n
SET user_id = up.user_id
FROM user_profiles up
WHERE n.user_id = up.id;

-- Step 2: Delete orphaned rows that don't match any auth user
DELETE FROM notifications n
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users au WHERE au.id = n.user_id
);

-- Step 3: Drop old FK and create new FK → auth.users(id)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Fix notify_transaction_status_change() trigger function
-- Problem: transactions.buyer_user_id references user_profiles(id),
-- but notifications now expects auth.uid. Must resolve via user_profiles.user_id.
-- vendor_profiles.user_id is already auth.uid (no change needed for vendor).
CREATE OR REPLACE FUNCTION notify_transaction_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_buyer_auth_uid UUID;
    v_vendor_user_id UUID;
    v_listing_name TEXT;
BEGIN
    -- Only notify if status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Resolve buyer auth.uid from user_profiles
        -- (transactions.buyer_user_id = user_profiles.id, we need user_profiles.user_id)
        SELECT up.user_id INTO v_buyer_auth_uid
        FROM user_profiles up
        WHERE up.id = NEW.buyer_user_id;

        -- Get vendor auth.uid (vendor_profiles.user_id IS auth.uid already)
        SELECT vp.user_id INTO v_vendor_user_id
        FROM vendor_profiles vp
        WHERE vp.id = NEW.vendor_profile_id;

        -- Get listing name from listing_data
        SELECT l.listing_data->>'stand_name' INTO v_listing_name
        FROM listings l
        WHERE l.id = NEW.listing_id;

        IF v_listing_name IS NULL THEN
            SELECT l.listing_data->>'booth_name' INTO v_listing_name
            FROM listings l
            WHERE l.id = NEW.listing_id;
        END IF;

        -- Notify buyer
        IF v_buyer_auth_uid IS NOT NULL THEN
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (
                v_buyer_auth_uid,
                'transaction_update',
                'Transaction Updated',
                'Your transaction status changed to: ' || NEW.status,
                jsonb_build_object(
                    'transaction_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'listing_name', v_listing_name
                )
            );
        END IF;

        -- Notify vendor (for initiated status)
        IF NEW.status = 'initiated' AND v_vendor_user_id IS NOT NULL THEN
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (
                v_vendor_user_id,
                'new_transaction',
                'New Reservation Request',
                'You have a new reservation request',
                jsonb_build_object(
                    'transaction_id', NEW.id,
                    'listing_name', v_listing_name
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 5: Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
