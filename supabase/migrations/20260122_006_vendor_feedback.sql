-- Migration: Vendor Feedback System
-- Date: 2026-01-22
-- Purpose: Allow vendors to submit feedback, report issues, request features

-- ============================================
-- Create vendor feedback category enum
-- ============================================
DO $$ BEGIN
    CREATE TYPE vendor_feedback_category AS ENUM (
        'suggest_market',
        'technical_problem',
        'feature_request',
        'payment_issue',
        'order_management',
        'listing_help',
        'general_feedback'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Create vendor_feedback table
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    category vendor_feedback_category NOT NULL,
    message TEXT NOT NULL,

    -- For market suggestions
    market_name TEXT,
    market_location TEXT,
    market_schedule TEXT,

    -- Admin management
    status feedback_status DEFAULT 'new',
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_vendor ON vendor_feedback(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_user ON vendor_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_vertical ON vendor_feedback(vertical_id);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_category ON vendor_feedback(category);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_status ON vendor_feedback(status);
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_created ON vendor_feedback(created_at DESC);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE vendor_feedback ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own feedback
CREATE POLICY "Vendors can view own feedback"
    ON vendor_feedback FOR SELECT
    USING (user_id = auth.uid());

-- Vendors can submit feedback
CREATE POLICY "Vendors can submit feedback"
    ON vendor_feedback FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Admins can view all vendor feedback
CREATE POLICY "Admins can view all vendor feedback"
    ON vendor_feedback FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND ('admin' = ANY(up.roles) OR up.role = 'admin')
        )
    );

-- Admins can update vendor feedback (status, notes)
CREATE POLICY "Admins can update vendor feedback"
    ON vendor_feedback FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND ('admin' = ANY(up.roles) OR up.role = 'admin')
        )
    );

-- ============================================
-- Updated_at trigger
-- ============================================
DROP TRIGGER IF EXISTS update_vendor_feedback_updated_at ON vendor_feedback;
CREATE TRIGGER update_vendor_feedback_updated_at
    BEFORE UPDATE ON vendor_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE vendor_feedback IS 'Vendor feedback submissions including market suggestions, technical issues, and feature requests';
COMMENT ON COLUMN vendor_feedback.category IS 'Type of feedback: suggest_market, technical_problem, feature_request, payment_issue, order_management, listing_help, general_feedback';
