-- Migration: Record ERR_RLS_001 Resolution History
-- Created: 2026-01-26
-- Purpose: Document the fix attempts for RLS recursion error in the tracking system
--
-- This populates the error_resolutions table with the actual history of
-- what was tried and what worked.

-- ============================================================================
-- 1. RECORD FAILED ATTEMPT: Migration 007
-- ============================================================================

INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  failure_reason,
  verification_method,
  verified_at,
  verified_by,
  created_by
) VALUES (
  'ERR_RLS_001',
  'Consolidated order policies but kept orders→order_items reference in orders_select',
  '20260126_007_cleanup_order_policies.sql',
  'Dropped duplicate policies on order_items, recreated orders_select with vendor check that references order_items',
  'failed',
  'orders_select still referenced order_items, creating cycle: orders→order_items→orders',
  'manual',
  '2026-01-26T10:00:00Z',
  'developer',
  'claude-code'
);

-- ============================================================================
-- 2. RECORD PARTIAL FIX: Migration 011
-- ============================================================================

INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  partial_notes,
  verification_method,
  verified_at,
  verified_by,
  created_by
) VALUES (
  'ERR_RLS_001',
  'Remove cross-table references from orders_select and vendor_profiles_select',
  '20260126_011_fix_rls_recursion.sql',
  'orders_select: removed order_items reference. vendor_profiles_select: removed order_items reference. order_items_select: unchanged (references orders and vendor_profiles which are now safe).',
  'partial',
  'Fixed 2 of 3 cycles: (1) orders↔order_items, (2) order_items↔vendor_profiles. MISSED cycle (3): markets↔listing_markets. Error persisted until migration 013.',
  'manual',
  '2026-01-26T11:00:00Z',
  'developer',
  'claude-code'
);

-- ============================================================================
-- 3. RECORD VERIFIED FIX: Migration 013
-- ============================================================================

INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  verification_method,
  verification_result,
  verified_at,
  verified_by,
  created_by
) VALUES (
  'ERR_RLS_001',
  'Remove cross-table references from markets_public_select (listing_markets) and listing_markets_select (markets)',
  '20260126_013_fix_markets_listing_markets_cycle.sql',
  'markets_public_select: removed listing_markets reference, kept order_items reference (safe). listing_markets_select: removed markets reference from public check, simplified to check listings.status only.',
  'verified',
  'manual',
  'Orders page loads successfully. No 42P17 error. Buyer can see orders with markets and listing data.',
  NOW(),
  'developer',
  'claude-code'
);

-- ============================================================================
-- 4. SUMMARY VIEW CHECK
-- ============================================================================

-- After running this, you can verify with:
-- SELECT * FROM v_verified_solutions WHERE error_code = 'ERR_RLS_001';
-- SELECT * FROM v_failed_approaches WHERE error_code = 'ERR_RLS_001';

-- ============================================================================
-- Done!
-- ============================================================================
