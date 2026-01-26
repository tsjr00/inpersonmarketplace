/**
 * RLS Error Catalog
 *
 * Error definitions for Row-Level Security policy issues.
 * These are the most common errors when debugging Supabase RLS.
 */

import { ErrorCatalogEntry } from '../types'

export const RLS_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_RLS_001',
    title: 'RLS Policy Recursion',
    category: 'RLS',
    severity: 'high',
    description:
      'An RLS policy is calling itself through cross-table references, creating infinite recursion.',
    causes: [
      'Policy on table A references table B, whose policy references table A',
      'Example: orders_select checks order_items, order_items_select checks orders',
      'Example: vendor_profiles_select checks order_items, order_items_select checks vendor_profiles',
      'Admin check policy queries user_profiles which has its own admin check',
      'Policy uses EXISTS subquery that triggers the same or related policy',
    ],
    solutions: [
      'Break the cycle by removing cross-table reference from one policy',
      'Ensure "parent" tables (orders, vendor_profiles) have NO cross-table refs in SELECT policies',
      'Child tables (order_items) CAN reference parent tables safely',
      'Use is_platform_admin() helper function instead of inline admin checks',
      'Simplify policy to use direct column checks instead of subqueries',
    ],

    // Verification - how to confirm this error is fixed
    verificationQuery: `
      -- Run as authenticated user (not service role)
      -- Should return rows without 42P17 error
      SELECT o.id, o.order_number
      FROM orders o
      WHERE o.buyer_user_id = auth.uid()
      LIMIT 1;
    `,
    verificationSteps: [
      '1. Log in as a buyer user (e.g., emily.taylor1@test.com)',
      '2. Navigate to /[vertical]/buyer/orders',
      '3. Page should load without "RLS policy recursion detected" error',
      '4. Orders should be visible (or empty state if no orders)',
    ],

    // Known failed approaches - populated from error_resolutions table
    // These are also tracked in the database for historical accuracy
    failedApproaches: [
      {
        description: 'Migration 007: Consolidated policies but kept orders→order_items reference',
        migrationFile: '20260126_007_cleanup_order_policies.sql',
        reason: 'Still had circular dependency: orders_select referenced order_items',
        attemptedAt: '2026-01-26',
      },
      {
        description: 'Migration 011: Fixed orders↔order_items and vendor_profiles↔order_items but missed markets↔listing_markets cycle',
        migrationFile: '20260126_011_fix_rls_recursion.sql',
        reason: 'Partial fix - addressed 2 of 3 cycles. Third cycle: markets_public_select→listing_markets→markets',
        attemptedAt: '2026-01-26',
      },
    ],

    // Verified solution - this actually worked!
    verifiedSolutions: [
      {
        description: 'Break ALL cross-table cycles: (1) orders_select must not reference order_items, (2) vendor_profiles_select must not reference order_items, (3) markets_public_select must not reference listing_markets, (4) listing_markets_select must not reference markets. Child tables CAN reference parent tables.',
        migrationFile: '20260126_011_fix_rls_recursion.sql + 20260126_013_fix_markets_listing_markets_cycle.sql',
        verifiedAt: '2026-01-26',
        verifiedBy: 'developer - tested on dev & staging',
      },
    ],

    // All known cycles that cause this error (for future reference)
    // Cycle 1: orders ↔ order_items (fixed in 011)
    // Cycle 2: order_items ↔ vendor_profiles (fixed in 011)
    // Cycle 3: markets ↔ listing_markets (fixed in 013)

    pgCodes: ['42P17'],
    relatedCodes: ['ERR_RLS_101', 'ERR_RLS_103'],
  },
  {
    code: 'ERR_RLS_002',
    title: 'RLS Access Denied',
    category: 'RLS',
    severity: 'medium',
    description: 'Row-level security policy denied access to the requested data.',
    causes: [
      'User is not authenticated (auth.uid() returns null)',
      'User does not own the resource (buyer_user_id/vendor_profile_id mismatch)',
      'User lacks required role (not admin/vendor when needed)',
      'Resource belongs to different vertical',
      'Policy condition not met for this specific row',
    ],
    solutions: [
      'Verify user is authenticated: check supabase.auth.getUser() result',
      'Verify user has correct role in user_profiles table',
      'Check if resource belongs to user (buyer_user_id, vendor_profile_id)',
      'Review RLS policies in supabase/migrations/ for the affected table',
      'Use service role for operations that need to bypass RLS',
    ],
    pgCodes: ['42501'],
  },
  {
    code: 'ERR_RLS_100',
    title: 'Orders Table RLS Denied',
    category: 'RLS',
    severity: 'medium',
    description: 'Cannot access order - RLS policy blocked the request.',
    causes: [
      'User is not the buyer of this order (orders.buyer_user_id != auth.uid())',
      'Vendor trying to access order not containing their items',
      'User is not an admin',
    ],
    solutions: [
      'Verify order.buyer_user_id matches auth.uid()',
      'For vendors: access orders through order_items query instead',
      'Check orders_select policy in migrations',
    ],
    relatedCodes: ['ERR_RLS_002'],
  },
  {
    code: 'ERR_RLS_101',
    title: 'Order Items Table RLS Denied',
    category: 'RLS',
    severity: 'medium',
    description: 'Cannot access order items - RLS policy blocked the request.',
    causes: [
      'User is not the buyer of the parent order',
      'Vendor does not own this order item (vendor_profile_id mismatch)',
      'Policy recursion with orders table',
    ],
    solutions: [
      'Verify order_items.vendor_profile_id matches user vendor profile',
      'Verify parent order.buyer_user_id matches auth.uid()',
      'Check order_items_select policy - ensure no circular dependency with orders',
    ],
    relatedCodes: ['ERR_RLS_002', 'ERR_RLS_001'],
  },
  {
    code: 'ERR_RLS_102',
    title: 'Markets Table RLS Denied',
    category: 'RLS',
    severity: 'medium',
    description: 'Cannot access market - RLS policy blocked the request.',
    causes: [
      'Market is not approved/active',
      'Private pickup location belongs to different vendor',
      'Buyer trying to access market not in their orders',
    ],
    solutions: [
      'Check market.approval_status = approved AND market.active = true',
      'For private pickups: verify submitted_by_vendor_id matches user',
      'Check markets_public_select policy includes buyer order access',
    ],
    relatedCodes: ['ERR_RLS_002'],
  },
  {
    code: 'ERR_RLS_103',
    title: 'Vendor Profiles Table RLS Denied',
    category: 'RLS',
    severity: 'medium',
    description: 'Cannot access vendor profile - RLS policy blocked the request.',
    causes: [
      'Vendor profile status is not approved',
      'User trying to access another users vendor profile',
      'Policy recursion with order_items or other tables',
    ],
    solutions: [
      'Check vendor_profiles.status = approved for public visibility',
      'Verify vendor_profiles.user_id = auth.uid() for own profile',
      'Ensure vendor_profiles_select does not have circular dependencies',
    ],
    relatedCodes: ['ERR_RLS_002', 'ERR_RLS_001'],
  },
]
