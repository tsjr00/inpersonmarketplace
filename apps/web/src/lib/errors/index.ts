/**
 * Error Tracing & Resolution System
 *
 * Internal error tracing system for debugging and analysis.
 * Provides structured error codes, breadcrumb trails, error catalog,
 * and resolution tracking to verify fixes actually work.
 *
 * Usage in API routes:
 * ```typescript
 * import { withErrorTracing, traced, crumb } from '@/lib/errors'
 *
 * export async function GET(request: NextRequest) {
 *   return withErrorTracing('/api/buyer/orders', 'GET', async () => {
 *     crumb.auth('Checking user')
 *     const { data: { user }, error: authError } = await supabase.auth.getUser()
 *     if (authError) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
 *
 *     crumb.supabase('select', 'orders')
 *     const { data, error } = await supabase.from('orders').select('*')
 *     if (error) throw traced.fromSupabase(error, { table: 'orders' })
 *
 *     return NextResponse.json({ orders: data })
 *   })
 * }
 * ```
 *
 * Error lookup in browser console (dev only):
 * ```javascript
 * explainError('ERR_RLS_001')
 * ```
 *
 * Resolution tracking (for developers/AI):
 * ```typescript
 * import {
 *   getFailedApproaches,
 *   getVerifiedSolutions,
 *   recordFixAttempt,
 *   verifyResolution
 * } from '@/lib/errors'
 *
 * // Before attempting a fix, check what's been tried
 * const failed = await getFailedApproaches('ERR_RLS_001')
 * const verified = await getVerifiedSolutions('ERR_RLS_001')
 *
 * // Record a fix attempt
 * const resolutionId = await recordFixAttempt({
 *   errorCode: 'ERR_RLS_001',
 *   attemptedFix: 'Remove cross-table reference from orders_select',
 *   migrationFile: '20260126_011_fix_rls_recursion.sql'
 * })
 *
 * // After testing, verify the outcome
 * await verifyResolution(resolutionId, { worked: true, method: 'manual' })
 * // OR
 * await verifyResolution(resolutionId, { worked: false, reason: 'Still getting 42P17' })
 * ```
 */

// Core classes and types
export { TracedError } from './traced-error'
export type {
  ErrorContext,
  ErrorSeverity,
  ErrorCategory,
  ErrorCatalogEntry,
  TracedErrorResponse,
  Breadcrumb,
  SupabaseError,
  // Resolution tracking types
  ErrorResolution,
  ResolutionStatus,
  VerifiedSolution,
  FailedApproach,
} from './types'
export { getHttpStatus, HTTP_STATUS_MAP } from './types'

// Breadcrumb system
export {
  startBreadcrumbTrail,
  addBreadcrumb,
  getBreadcrumbs,
  clearBreadcrumbs,
  crumb,
} from './breadcrumbs'

// Supabase error handling
export {
  parseSupabaseError,
  extractTableFromError,
  extractPolicyFromError,
  isRlsRecursionError,
  isRlsAccessDenied,
  isNoRowsError,
  traced,
} from './supabase-errors'

// Error catalog
export {
  ERROR_CATALOG,
  lookupError,
  lookupByPgCode,
  getErrorsByCategory,
  getCriticalErrors,
  explainError,
} from './error-catalog'

// Route wrapper
export {
  withErrorTracing,
  createTracedHandler,
  throwTracedError,
} from './with-error-tracing'

// Logger
export { logErrorToDb, logError, isDbLoggingEnabled } from './logger'

// Resolution tracking - verify fixes actually work
export {
  // Query functions
  getFailedApproaches,
  getVerifiedSolutions,
  getPendingResolutions,
  getResolutionHistory,
  // Mutation functions
  recordFixAttempt,
  verifyResolution,
  markResolutionVerified,
  markResolutionFailed,
  // Summary functions
  getResolutionSummary,
  formatResolutionSummary,
  printResolutionSummary,
} from './resolution-tracker'
export type { RecordFixAttemptParams, VerifyResolutionParams } from './resolution-tracker'
