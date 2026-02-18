-- Migration: 20260218_034_vendor_favorites
-- Description: Create vendor_favorites table for shopper favorite vendors
-- Tables affected: vendor_favorites (new)

CREATE TABLE vendor_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, vendor_profile_id)
);

CREATE INDEX idx_vendor_favorites_user ON vendor_favorites(user_id);
CREATE INDEX idx_vendor_favorites_vendor ON vendor_favorites(vendor_profile_id);

ALTER TABLE vendor_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view own favorites" ON vendor_favorites
    FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Users can add favorites
CREATE POLICY "Users can add favorites" ON vendor_favorites
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Users can remove their own favorites
CREATE POLICY "Users can remove own favorites" ON vendor_favorites
    FOR DELETE USING (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
