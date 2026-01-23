-- Migration: Add order ratings system
-- Allows buyers to rate vendors after order completion

-- Create order_ratings table
CREATE TABLE IF NOT EXISTS order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each order can only be rated once per vendor
  UNIQUE(order_id, vendor_profile_id)
);

-- Index for efficient lookups
CREATE INDEX idx_order_ratings_vendor ON order_ratings(vendor_profile_id);
CREATE INDEX idx_order_ratings_buyer ON order_ratings(buyer_user_id);
CREATE INDEX idx_order_ratings_order ON order_ratings(order_id);

-- Add average_rating and rating_count to vendor_profiles for caching
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Function to update vendor rating stats
CREATE OR REPLACE FUNCTION update_vendor_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate average rating for the vendor
  UPDATE vendor_profiles
  SET
    average_rating = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM order_ratings
      WHERE vendor_profile_id = COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id)
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM order_ratings
      WHERE vendor_profile_id = COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id)
    )
  WHERE id = COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update stats on rating changes
DROP TRIGGER IF EXISTS trigger_update_vendor_rating_stats ON order_ratings;
CREATE TRIGGER trigger_update_vendor_rating_stats
AFTER INSERT OR UPDATE OR DELETE ON order_ratings
FOR EACH ROW
EXECUTE FUNCTION update_vendor_rating_stats();

-- RLS Policies
ALTER TABLE order_ratings ENABLE ROW LEVEL SECURITY;

-- Buyers can view all ratings
CREATE POLICY "Anyone can view ratings"
  ON order_ratings FOR SELECT
  USING (true);

-- Buyers can create ratings for their own orders
CREATE POLICY "Buyers can create ratings for their orders"
  ON order_ratings FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_user_id
    AND EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id
      AND orders.buyer_user_id = auth.uid()
      AND orders.status IN ('completed', 'fulfilled')
    )
  );

-- Buyers can update their own ratings
CREATE POLICY "Buyers can update their own ratings"
  ON order_ratings FOR UPDATE
  USING (auth.uid() = buyer_user_id);

-- Buyers can delete their own ratings
CREATE POLICY "Buyers can delete their own ratings"
  ON order_ratings FOR DELETE
  USING (auth.uid() = buyer_user_id);

COMMENT ON TABLE order_ratings IS 'Ratings from buyers for vendors after order completion';
