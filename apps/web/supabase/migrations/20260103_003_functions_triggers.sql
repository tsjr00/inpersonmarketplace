-- Migration: Functions and Triggers
-- Created: 2026-01-03
-- Purpose: Create utility functions and auto-update triggers

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- APPLY UPDATED_AT TRIGGERS TO ALL TABLES
-- ============================================================================

-- User profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Organizations
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verticals
DROP TRIGGER IF EXISTS update_verticals_updated_at ON verticals;
CREATE TRIGGER update_verticals_updated_at
    BEFORE UPDATE ON verticals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Vendor profiles
DROP TRIGGER IF EXISTS update_vendor_profiles_updated_at ON vendor_profiles;
CREATE TRIGGER update_vendor_profiles_updated_at
    BEFORE UPDATE ON vendor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Vendor verifications
DROP TRIGGER IF EXISTS update_vendor_verifications_updated_at ON vendor_verifications;
CREATE TRIGGER update_vendor_verifications_updated_at
    BEFORE UPDATE ON vendor_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Listings
DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Transactions
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Fulfillments
DROP TRIGGER IF EXISTS update_fulfillments_updated_at ON fulfillments;
CREATE TRIGGER update_fulfillments_updated_at
    BEFORE UPDATE ON fulfillments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- USER PROFILE AUTO-CREATE ON SIGNUP
-- ============================================================================

-- Function to create user profile when new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, email, display_name, roles)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        ARRAY['buyer']::user_role[]
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- SOFT DELETE HELPER
-- ============================================================================

-- Function to soft delete a record
CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Instead of deleting, set deleted_at
    UPDATE vendor_profiles SET deleted_at = NOW() WHERE id = OLD.id;
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE plpgsql;

-- Note: Apply soft delete triggers selectively where needed
-- Example for vendor_profiles (uncomment if wanted):
-- CREATE TRIGGER soft_delete_vendor_profiles
--     BEFORE DELETE ON vendor_profiles
--     FOR EACH ROW
--     EXECUTE FUNCTION soft_delete();

-- ============================================================================
-- VENDOR STATUS CHANGE TRACKING
-- ============================================================================

-- Function to track vendor status changes
CREATE OR REPLACE FUNCTION track_vendor_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit_log (
            user_id,
            action,
            table_name,
            record_id,
            old_data,
            new_data
        )
        SELECT
            up.id,
            'vendor_status_change',
            'vendor_profiles',
            NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status)
        FROM user_profiles up
        WHERE up.user_id = auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS track_vendor_status ON vendor_profiles;
CREATE TRIGGER track_vendor_status
    AFTER UPDATE ON vendor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION track_vendor_status_change();

-- ============================================================================
-- TRANSACTION STATUS CHANGE NOTIFICATION
-- ============================================================================

-- Function to create notification on transaction status change
CREATE OR REPLACE FUNCTION notify_transaction_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_buyer_user_id UUID;
    v_vendor_user_id UUID;
    v_listing_name TEXT;
BEGIN
    -- Only notify if status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Get buyer user_id
        v_buyer_user_id := NEW.buyer_user_id;

        -- Get vendor user_id
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
        IF v_buyer_user_id IS NOT NULL THEN
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (
                v_buyer_user_id,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_transaction_status ON transactions;
CREATE TRIGGER notify_transaction_status
    AFTER UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION notify_transaction_status_change();

-- Also notify on new transaction insert
DROP TRIGGER IF EXISTS notify_new_transaction ON transactions;
CREATE TRIGGER notify_new_transaction
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION notify_transaction_status_change();

-- ============================================================================
-- VERIFICATION STATUS SYNC
-- ============================================================================

-- Function to sync verification status to vendor profile
CREATE OR REPLACE FUNCTION sync_verification_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When verification is approved, update vendor status
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        UPDATE vendor_profiles
        SET status = 'approved'
        WHERE id = NEW.vendor_profile_id
        AND status = 'submitted';
    END IF;

    -- When verification is rejected, update vendor status
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        UPDATE vendor_profiles
        SET status = 'rejected'
        WHERE id = NEW.vendor_profile_id
        AND status = 'submitted';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_vendor_verification ON vendor_verifications;
CREATE TRIGGER sync_vendor_verification
    AFTER UPDATE ON vendor_verifications
    FOR EACH ROW
    EXECUTE FUNCTION sync_verification_status();

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Get vertical config by ID
CREATE OR REPLACE FUNCTION get_vertical_config(v_id TEXT)
RETURNS JSONB AS $$
    SELECT config FROM verticals WHERE vertical_id = v_id AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get vendor fields for a vertical
CREATE OR REPLACE FUNCTION get_vendor_fields(v_id TEXT)
RETURNS JSONB AS $$
    SELECT config->'vendor_fields'
    FROM verticals
    WHERE vertical_id = v_id AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get listing fields for a vertical
CREATE OR REPLACE FUNCTION get_listing_fields(v_id TEXT)
RETURNS JSONB AS $$
    SELECT config->'listing_fields'
    FROM verticals
    WHERE vertical_id = v_id AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user owns vendor profile
CREATE OR REPLACE FUNCTION user_owns_vendor(vendor_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM vendor_profiles vp
        LEFT JOIN user_profiles up ON vp.user_id = up.id
        LEFT JOIN organizations o ON vp.organization_id = o.id
        WHERE vp.id = vendor_id
        AND (
            up.user_id = auth.uid()
            OR o.owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
