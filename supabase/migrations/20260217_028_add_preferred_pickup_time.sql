-- Add preferred_pickup_time for food truck 30-min time slot selection
-- Nullable because farmers market orders don't use time slots

ALTER TABLE cart_items ADD COLUMN preferred_pickup_time time;
ALTER TABLE order_items ADD COLUMN preferred_pickup_time time;

COMMENT ON COLUMN cart_items.preferred_pickup_time IS 'Food truck only: 30-min pickup slot within vendor operating window';
COMMENT ON COLUMN order_items.preferred_pickup_time IS 'Food truck only: confirmed pickup time slot';
