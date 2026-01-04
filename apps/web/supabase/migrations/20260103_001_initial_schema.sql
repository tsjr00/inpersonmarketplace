-- Migration: Initial Schema
-- Created: 2026-01-03
-- Purpose: Create core tables for InPersonMarketplace

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- User roles
CREATE TYPE user_role AS ENUM ('buyer', 'vendor', 'admin', 'verifier');

-- Vendor profile status
CREATE TYPE vendor_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'suspended');

-- Verification status
CREATE TYPE verification_status AS ENUM ('pending', 'in_review', 'approved', 'rejected');

-- Listing status
CREATE TYPE listing_status AS ENUM ('draft', 'published', 'paused', 'archived');

-- Transaction status
CREATE TYPE transaction_status AS ENUM ('initiated', 'accepted', 'declined', 'canceled', 'fulfilled', 'expired');

-- Fulfillment mode
CREATE TYPE fulfillment_mode AS ENUM ('pickup', 'delivery', 'meetup');

-- Fulfillment status
CREATE TYPE fulfillment_status AS ENUM ('pending', 'confirmed', 'completed', 'failed');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- User Profiles (extends Supabase auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    phone TEXT,
    display_name TEXT,
    roles user_role[] DEFAULT ARRAY['buyer']::user_role[],
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE user_profiles IS 'Extended user profile data linked to Supabase auth';
COMMENT ON COLUMN user_profiles.user_id IS 'References auth.users(id)';
COMMENT ON COLUMN user_profiles.roles IS 'Array of user roles (buyer, vendor, admin, verifier)';

-- -----------------------------------------------------------------------------
-- Organizations (optional business entity for vendors)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legal_name TEXT NOT NULL,
    dba_name TEXT,
    owner_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    tax_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE organizations IS 'Business entities that can own vendor profiles';
COMMENT ON COLUMN organizations.dba_name IS 'Doing Business As name';

-- -----------------------------------------------------------------------------
-- Verticals (marketplace configurations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verticals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vertical_id TEXT UNIQUE NOT NULL,
    name_public TEXT NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE verticals IS 'Marketplace vertical configurations (fireworks, farmers_market, etc.)';
COMMENT ON COLUMN verticals.vertical_id IS 'Unique string identifier (e.g., "fireworks")';
COMMENT ON COLUMN verticals.config IS 'Full JSON configuration from config/verticals/*.json';

-- -----------------------------------------------------------------------------
-- Vendor Profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    status vendor_status DEFAULT 'draft',
    profile_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Either user_id or organization_id must be set
    CONSTRAINT vendor_owner_check CHECK (
        (user_id IS NOT NULL) OR (organization_id IS NOT NULL)
    )
);

COMMENT ON TABLE vendor_profiles IS 'Vendor accounts with vertical-specific profile data';
COMMENT ON COLUMN vendor_profiles.profile_data IS 'JSONB data from vendor_fields in vertical config';

-- -----------------------------------------------------------------------------
-- Vendor Verifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    status verification_status DEFAULT 'pending',
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    documents JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_verifications IS 'Verification status and documents for vendors';
COMMENT ON COLUMN vendor_verifications.documents IS 'Array of document metadata (file paths, types, etc.)';

-- -----------------------------------------------------------------------------
-- Listings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    status listing_status DEFAULT 'draft',
    listing_data JSONB DEFAULT '{}'::jsonb,

    -- Location data (extracted for querying)
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Availability
    available_from DATE,
    available_to DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE listings IS 'Products/services/stands for sale';
COMMENT ON COLUMN listings.listing_data IS 'JSONB data from listing_fields in vertical config';

-- -----------------------------------------------------------------------------
-- Listing Images
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    url TEXT,
    alt_text TEXT,
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE listing_images IS 'Images associated with listings';

-- -----------------------------------------------------------------------------
-- Transactions (reservations/orders)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
    buyer_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    status transaction_status DEFAULT 'initiated',
    buyer_data JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Buyer-vendor transactions (reservations, orders)';
COMMENT ON COLUMN transactions.buyer_data IS 'JSONB data from buyer_fields in vertical config';

-- -----------------------------------------------------------------------------
-- Fulfillments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fulfillments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    mode fulfillment_mode NOT NULL,
    status fulfillment_status DEFAULT 'pending',
    scheduled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    location_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fulfillments IS 'Fulfillment details for transactions';

-- -----------------------------------------------------------------------------
-- Audit Log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Audit trail for important changes';

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'User notifications';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- User profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id);

-- Verticals
CREATE INDEX IF NOT EXISTS idx_verticals_vertical_id ON verticals(vertical_id);
CREATE INDEX IF NOT EXISTS idx_verticals_active ON verticals(is_active) WHERE is_active = true;

-- Vendor profiles
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user ON vendor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_org ON vendor_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_vertical ON vendor_profiles(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_status ON vendor_profiles(status);

-- Vendor verifications
CREATE INDEX IF NOT EXISTS idx_vendor_verifications_vendor ON vendor_verifications(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_verifications_status ON vendor_verifications(status);

-- Listings
CREATE INDEX IF NOT EXISTS idx_listings_vendor ON listings(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_listings_vertical ON listings(vertical_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_available ON listings(available_from, available_to);

-- Listing images
CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_listing ON transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Fulfillments
CREATE INDEX IF NOT EXISTS idx_fulfillments_transaction ON fulfillments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_status ON fulfillments(status);

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- JSONB indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_data ON vendor_profiles USING GIN (profile_data);
CREATE INDEX IF NOT EXISTS idx_listings_data ON listings USING GIN (listing_data);
