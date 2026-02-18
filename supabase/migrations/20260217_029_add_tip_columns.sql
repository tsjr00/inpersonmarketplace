-- Add tipping support for food truck orders
-- tip_percentage: integer percentage selected by buyer (e.g. 15 = 15%)
-- tip_amount: computed tip in cents
-- Both default to 0 — every order has a tip value, even if $0

ALTER TABLE orders ADD COLUMN tip_percentage smallint DEFAULT 0;
ALTER TABLE orders ADD COLUMN tip_amount integer DEFAULT 0;

COMMENT ON COLUMN orders.tip_percentage IS 'Tip percentage selected by buyer (integer, e.g. 15 = 15%)';
COMMENT ON COLUMN orders.tip_amount IS 'Tip amount in cents';
