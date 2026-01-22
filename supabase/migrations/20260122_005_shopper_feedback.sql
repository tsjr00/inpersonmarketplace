-- Migration: Shopper Feedback System
-- Date: 2026-01-22
-- Purpose: Allow shoppers to submit feedback, suggest markets, report issues

-- ============================================
-- Create feedback category enum
-- ============================================
DO $$ BEGIN
    CREATE TYPE shopper_feedback_category AS ENUM (
        'suggest_market',
        'technical_problem',
        'feature_request',
        'vendor_concern',
        'general_feedback'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Create feedback status enum
-- ============================================
DO $$ BEGIN
    CREATE TYPE feedback_status AS ENUM (
        'new',
        'in_review',
        'resolved',
        'closed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Create shopper_feedback table
-- ============================================
CREATE TABLE IF NOT EXISTS shopper_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    category shopper_feedback_category NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_user ON shopper_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_vertical ON shopper_feedback(vertical_id);
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_category ON shopper_feedback(category);
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_status ON shopper_feedback(status);
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_created ON shopper_feedback(created_at DESC);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE shopper_feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
    ON shopper_feedback FOR SELECT
    USING (user_id = auth.uid());

-- Users can submit feedback
CREATE POLICY "Users can submit feedback"
    ON shopper_feedback FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
    ON shopper_feedback FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND ('admin' = ANY(up.roles) OR up.role = 'admin')
        )
    );

-- Admins can update feedback (status, notes)
CREATE POLICY "Admins can update feedback"
    ON shopper_feedback FOR UPDATE
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
DROP TRIGGER IF EXISTS update_shopper_feedback_updated_at ON shopper_feedback;
CREATE TRIGGER update_shopper_feedback_updated_at
    BEFORE UPDATE ON shopper_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE shopper_feedback IS 'Shopper feedback submissions including market suggestions, bug reports, and general feedback';
COMMENT ON COLUMN shopper_feedback.category IS 'Type of feedback: suggest_market, technical_problem, feature_request, vendor_concern, general_feedback';
COMMENT ON COLUMN shopper_feedback.market_name IS 'For market suggestions: name of the market';
COMMENT ON COLUMN shopper_feedback.market_location IS 'For market suggestions: location/address of the market';
COMMENT ON COLUMN shopper_feedback.market_schedule IS 'For market suggestions: when the market operates';
