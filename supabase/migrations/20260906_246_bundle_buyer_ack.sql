-- Migration 246: bundle two-part handoff confirmation — buyer acknowledge stamp
--
-- Owner decision 2026-09-06 (E1b): the bundle transaction gets the SAME
-- two-part 30-second ritual as every other pickup, at both of its handoffs:
--   1. vendor → manager (collection): the manager plays the buyer's role —
--      a manager stand-in acknowledge sets the existing per-item
--      buyer_confirmed_at / confirmation_window_expires_at fields, and the
--      vendor fulfills inside the window exactly as on any order (this is
--      ALSO what pays the vendor: fulfill's normal-flow branch. Without it,
--      bundle items landed in fulfill's vendor-first edge branch, whose
--      payout waits for a per-item buyer ack that bundle buyers never send).
--   2. manager → buyer (final handoff): mirrored one level up — the buyer
--      acknowledges the BUNDLE (this column), and the manager's
--      "Mark handed off" is the within-window response that releases the
--      margin. Money still moves only when BOTH parties have acted,
--      whichever order they act in (mirrors the item state machine).
--
-- This column is the buyer's half of handoff 2. The window is computed at
-- check time (ack + CONFIRMATION_WINDOW_SECONDS) — no expiry column needed.
-- Additive, inert on arrival: nothing reads it until the code ships.

ALTER TABLE orders ADD COLUMN bundle_buyer_ack_at timestamptz;

COMMENT ON COLUMN orders.bundle_buyer_ack_at IS
  'Bundle orders only: when the buyer acknowledged receiving the assembled bundle from the market manager (handoff 2 of the two-part confirmation). The margin pays only when both this and bundle_handed_off_at exist.';

NOTIFY pgrst, 'reload schema';
