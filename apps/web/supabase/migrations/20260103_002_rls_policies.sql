-- Migration: Row Level Security Policies
-- Created: 2026-01-03
-- Purpose: Enable RLS and create access policies for all tables

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(check_role user_role)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_id = auth.uid()
        AND check_role = ANY(roles)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN has_role('admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is verifier
CREATE OR REPLACE FUNCTION is_verifier()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN has_role('verifier') OR has_role('admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's vendor profile IDs
CREATE OR REPLACE FUNCTION get_user_vendor_ids()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT vp.id FROM vendor_profiles vp
    LEFT JOIN user_profiles up ON vp.user_id = up.id
    LEFT JOIN organizations o ON vp.organization_id = o.id
    WHERE up.user_id = auth.uid()
       OR o.owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USER PROFILES POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- New users can insert their profile (via trigger or signup)
CREATE POLICY "Users can insert own profile"
ON user_profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON user_profiles FOR SELECT
USING (is_admin());

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================

-- Owners can view their organizations
CREATE POLICY "Owners can view own organizations"
ON organizations FOR SELECT
USING (
    owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Owners can update their organizations
CREATE POLICY "Owners can update own organizations"
ON organizations FOR UPDATE
USING (
    owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Owners can create organizations
CREATE POLICY "Users can create organizations"
ON organizations FOR INSERT
WITH CHECK (
    owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Admins can view all organizations
CREATE POLICY "Admins can view all organizations"
ON organizations FOR SELECT
USING (is_admin());

-- ============================================================================
-- VERTICALS POLICIES
-- ============================================================================

-- Everyone can read active verticals (public data)
CREATE POLICY "Public can read active verticals"
ON verticals FOR SELECT
USING (is_active = true);

-- Admins can manage verticals
CREATE POLICY "Admins can manage verticals"
ON verticals FOR ALL
USING (is_admin());

-- ============================================================================
-- VENDOR PROFILES POLICIES
-- ============================================================================

-- Vendors can view their own profiles
CREATE POLICY "Vendors can view own profiles"
ON vendor_profiles FOR SELECT
USING (id IN (SELECT get_user_vendor_ids()));

-- Vendors can update their own profiles
CREATE POLICY "Vendors can update own profiles"
ON vendor_profiles FOR UPDATE
USING (id IN (SELECT get_user_vendor_ids()))
WITH CHECK (id IN (SELECT get_user_vendor_ids()));

-- Users can create vendor profiles
CREATE POLICY "Users can create vendor profiles"
ON vendor_profiles FOR INSERT
WITH CHECK (
    user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    OR organization_id IN (
        SELECT id FROM organizations
        WHERE owner_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    )
);

-- Public can view approved vendor profiles (for browsing)
CREATE POLICY "Public can view approved vendors"
ON vendor_profiles FOR SELECT
USING (status = 'approved' AND deleted_at IS NULL);

-- Admins/verifiers can view all vendor profiles
CREATE POLICY "Admins can view all vendor profiles"
ON vendor_profiles FOR SELECT
USING (is_verifier());

-- Admins can update vendor status
CREATE POLICY "Admins can update vendor profiles"
ON vendor_profiles FOR UPDATE
USING (is_admin());

-- ============================================================================
-- VENDOR VERIFICATIONS POLICIES
-- ============================================================================

-- Vendors can view their own verifications
CREATE POLICY "Vendors can view own verifications"
ON vendor_verifications FOR SELECT
USING (
    vendor_profile_id IN (SELECT get_user_vendor_ids())
);

-- Vendors can submit verifications (insert)
CREATE POLICY "Vendors can submit verifications"
ON vendor_verifications FOR INSERT
WITH CHECK (
    vendor_profile_id IN (SELECT get_user_vendor_ids())
);

-- Verifiers can view all verifications
CREATE POLICY "Verifiers can view all verifications"
ON vendor_verifications FOR SELECT
USING (is_verifier());

-- Verifiers can update verifications
CREATE POLICY "Verifiers can update verifications"
ON vendor_verifications FOR UPDATE
USING (is_verifier());

-- ============================================================================
-- LISTINGS POLICIES
-- ============================================================================

-- Vendors can view their own listings
CREATE POLICY "Vendors can view own listings"
ON listings FOR SELECT
USING (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Vendors can create listings
CREATE POLICY "Vendors can create listings"
ON listings FOR INSERT
WITH CHECK (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Vendors can update their own listings
CREATE POLICY "Vendors can update own listings"
ON listings FOR UPDATE
USING (vendor_profile_id IN (SELECT get_user_vendor_ids()))
WITH CHECK (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Vendors can soft-delete their own listings
CREATE POLICY "Vendors can delete own listings"
ON listings FOR DELETE
USING (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Public can view published listings
CREATE POLICY "Public can view published listings"
ON listings FOR SELECT
USING (status = 'published' AND deleted_at IS NULL);

-- Admins can view all listings
CREATE POLICY "Admins can view all listings"
ON listings FOR SELECT
USING (is_admin());

-- ============================================================================
-- LISTING IMAGES POLICIES
-- ============================================================================

-- Vendors can manage their listing images
CREATE POLICY "Vendors can manage listing images"
ON listing_images FOR ALL
USING (
    listing_id IN (
        SELECT id FROM listings
        WHERE vendor_profile_id IN (SELECT get_user_vendor_ids())
    )
);

-- Public can view images of published listings
CREATE POLICY "Public can view published listing images"
ON listing_images FOR SELECT
USING (
    listing_id IN (
        SELECT id FROM listings
        WHERE status = 'published' AND deleted_at IS NULL
    )
);

-- ============================================================================
-- TRANSACTIONS POLICIES
-- ============================================================================

-- Buyers can view their own transactions
CREATE POLICY "Buyers can view own transactions"
ON transactions FOR SELECT
USING (
    buyer_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Vendors can view transactions for their listings
CREATE POLICY "Vendors can view their transactions"
ON transactions FOR SELECT
USING (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Buyers can create transactions
CREATE POLICY "Buyers can create transactions"
ON transactions FOR INSERT
WITH CHECK (
    buyer_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Buyers can update their pending transactions (cancel)
CREATE POLICY "Buyers can update own transactions"
ON transactions FOR UPDATE
USING (
    buyer_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
    AND status = 'initiated'
);

-- Vendors can update transactions (accept/decline)
CREATE POLICY "Vendors can update transactions"
ON transactions FOR UPDATE
USING (vendor_profile_id IN (SELECT get_user_vendor_ids()));

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
ON transactions FOR SELECT
USING (is_admin());

-- ============================================================================
-- FULFILLMENTS POLICIES
-- ============================================================================

-- Participants can view fulfillments for their transactions
CREATE POLICY "Participants can view fulfillments"
ON fulfillments FOR SELECT
USING (
    transaction_id IN (
        SELECT id FROM transactions
        WHERE buyer_user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
           OR vendor_profile_id IN (SELECT get_user_vendor_ids())
    )
);

-- Vendors can create/update fulfillments
CREATE POLICY "Vendors can manage fulfillments"
ON fulfillments FOR ALL
USING (
    transaction_id IN (
        SELECT id FROM transactions
        WHERE vendor_profile_id IN (SELECT get_user_vendor_ids())
    )
);

-- ============================================================================
-- AUDIT LOG POLICIES
-- ============================================================================

-- Only admins can view audit log
CREATE POLICY "Admins can view audit log"
ON audit_log FOR SELECT
USING (is_admin());

-- System can insert audit entries (via service role)
CREATE POLICY "System can insert audit entries"
ON audit_log FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
USING (
    user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
USING (
    user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
);

-- System can create notifications (via service role)
CREATE POLICY "System can create notifications"
ON notifications FOR INSERT
WITH CHECK (true);
