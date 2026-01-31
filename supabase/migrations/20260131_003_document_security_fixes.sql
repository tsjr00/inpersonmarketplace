-- Migration: Document Security & Performance Fixes
-- Created: 2026-01-31
-- Description: Record verified solutions for issues found in security audit
--
-- This documents the fixes applied on 2026-01-31 to prevent future rework
-- and provide context for developers working on similar issues

-- =============================================================================
-- ERR_SEC_001: Admin Bypass in /api/listings
-- =============================================================================
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
  'ERR_SEC_001',
  'Add server-side admin role verification before using service client. Query params alone are not sufficient authentication.',
  NULL,
  'src/app/api/listings/route.ts: Import verifyAdminForApi from @/lib/auth/admin. Call verifyAdminForApi() when admin=true param is present. Only use createServiceClient() if verified admin. Fall back to regular createClient() silently if not admin.',
  'verified',
  'manual',
  'Admin routes now verify role via verifyAdminForApi() before using service client. Non-admin requests with admin=true param are silently downgraded to regular client.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_SEC_002: Debug Endpoints Exposed
-- =============================================================================
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
  'ERR_SEC_002',
  'Delete all debug endpoints. Add rule to CLAUDE.md to never create debug endpoints in production code.',
  NULL,
  'DELETED: src/app/api/debug/markets/route.ts, src/app/api/debug/vendors/route.ts. UPDATED: CLAUDE.md with security checklist requiring no debug endpoints.',
  'verified',
  'manual',
  'Debug directory and endpoints deleted. CLAUDE.md updated with pre-merge checklist that includes checking for debug endpoints.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_SEC_003: Missing search_path in SECURITY DEFINER
-- =============================================================================
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
  'ERR_SEC_003',
  'Add SET search_path = public to all SECURITY DEFINER functions to prevent search path injection attacks.',
  '20260131_001_fix_security_definer_search_path.sql',
  'Recreated 4 functions with SET search_path = public: update_vendor_last_login(), update_vendor_activity_on_listing(), update_vendor_activity_on_order(), scan_vendor_activity(). Added rule to CLAUDE.md for future SECURITY DEFINER functions.',
  'verified',
  'manual',
  'Migration created. All SECURITY DEFINER functions now include SET search_path = public. CLAUDE.md updated with rule that all SECURITY DEFINER functions must include this setting.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_PERF_001: Image Display Using Raw img Tags
-- =============================================================================
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
  'ERR_PERF_001',
  'Replace raw <img> tags with next/image for lazy loading, responsive sizing, and automatic format optimization.',
  NULL,
  'src/app/[vertical]/browse/page.tsx: Replaced raw img with next/image for listing images and vendor images. Used fill mode with sizes attribute for responsive behavior. src/app/[vertical]/market-box/[id]/page.tsx: Same changes for market box images.',
  'verified',
  'manual',
  'Browse and market-box pages now use next/image. Images lazy load and serve appropriate sizes based on viewport. Note: Upload compression (image-resize.ts) was already working - this fix is about display optimization.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_PERF_002: Missing Database Indexes
-- =============================================================================
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
  'ERR_PERF_002',
  'Add indexes for frequently queried columns identified in performance audit.',
  '20260131_002_add_missing_indexes.sql',
  'Created indexes: idx_user_profiles_user_id, idx_market_schedules_market_status, idx_cart_items_buyer_listing, idx_market_box_offerings_vendor_status, idx_listings_vendor_status, idx_orders_buyer_created, idx_order_items_order, idx_vendor_profiles_vertical_status, idx_market_vendors_market_status',
  'verified',
  'manual',
  'Migration created with 9 indexes covering common query patterns. All indexes use IF NOT EXISTS to be idempotent.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_SEC_004: Missing Rate Limiting on Sensitive Endpoints
-- =============================================================================
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
  'ERR_SEC_004',
  'Add rate limiting to sensitive endpoints to prevent abuse.',
  NULL,
  'src/app/api/user/delete-account/route.ts: Added rate limiting (3 requests per hour per IP) using checkRateLimit utility.',
  'verified',
  'manual',
  'Delete account endpoint now rate limited to 3 requests per hour per IP address. Returns 429 with retry-after header when limit exceeded.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- ERR_SEC_005: Stripe Operations Missing Idempotency Keys
-- =============================================================================
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
  'ERR_SEC_005',
  'Add idempotency keys to Stripe operations to prevent duplicate charges/transfers on retry.',
  NULL,
  'src/lib/stripe/payments.ts: Added idempotencyKey to transferToVendor (transfer-{orderId}-{orderItemId}) and createRefund (refund-{paymentIntentId}-{amount}). src/lib/stripe/connect.ts: Added idempotencyKey to createConnectAccount (connect-account-{vendorProfileId or email}).',
  'verified',
  'manual',
  'All Stripe mutation operations now include idempotency keys. Duplicate requests with same key will return cached result instead of creating duplicate transactions.',
  NOW(),
  'claude-code',
  'claude-code'
);

-- =============================================================================
-- META: Guardrails Added to Prevent Regression
-- =============================================================================
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
  'ERR_META_001',
  'Add security guardrails to CLAUDE.md to prevent future regressions. Include API route checklist, pre-merge checklist, and image optimization rules.',
  NULL,
  'CLAUDE.md: Added new sections - API Route Security Checklist (5 requirements), Pre-Merge Checklist (security, performance, error tracking, RLS), Image Optimization Rules (distinguishing upload vs display), SECURITY DEFINER rules.',
  'verified',
  'manual',
  'CLAUDE.md now includes comprehensive security and performance checklists that must be followed for all new development. This should prevent the pattern of security issues being introduced in new code.',
  NOW(),
  'claude-code',
  'claude-code'
);
