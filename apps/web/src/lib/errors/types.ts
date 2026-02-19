/**
 * Error Tracing System - Type Definitions
 *
 * Core types for the internal error tracing system that makes debugging faster
 * by providing structured error codes, context, and breadcrumb trails.
 */

/**
 * Error severity levels for logging and alerting
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Error categories matching the naming convention ERR_{CATEGORY}_{NUMBER}
 */
export type ErrorCategory =
  | 'AUTH'
  | 'RLS'
  | 'DB'
  | 'CART'
  | 'ORDER'
  | 'STRIPE'
  | 'VENDOR'
  | 'MARKET'
  | 'LISTING'
  | 'UPLOAD'
  | 'RATE'
  | 'UNKNOWN'

/**
 * Breadcrumb entry capturing a point in execution
 */
export interface Breadcrumb {
  timestamp: number
  category: string // e.g., 'api', 'supabase', 'stripe', 'auth'
  message: string // Human-readable description
  data?: Record<string, unknown> // Additional context
  level: 'debug' | 'info' | 'warning' | 'error'
}

/**
 * Context collected when an error occurs
 */
export interface ErrorContext {
  // Request context
  route?: string // e.g., '/api/buyer/orders'
  method?: string // HTTP method
  userId?: string // Authenticated user (if any)

  // Supabase context (when available)
  table?: string // Table involved
  operation?: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  policyName?: string // RLS policy name (if detectable)

  // Business context
  vertical?: string // Vertical ID
  vendorId?: string
  orderId?: string
  listingId?: string
  marketId?: string

  // Breadcrumb trail
  breadcrumbs?: Breadcrumb[]

  // Raw error details
  originalError?: unknown
  pgCode?: string // PostgreSQL error code
  pgDetail?: string // PostgreSQL detail
  pgHint?: string // PostgreSQL hint

  // Catch-all for additional context data
  [key: string]: unknown
}

/**
 * Entry in the error catalog
 */
export interface ErrorCatalogEntry {
  code: string // e.g., 'ERR_RLS_001'
  title: string // Short description
  category: ErrorCategory
  severity: ErrorSeverity
  description: string // Detailed explanation (internal — for developers)
  causes: string[] // Possible causes

  // User-facing guidance (shown in ErrorDisplay component)
  userGuidance?: string // Plain-language message telling the user what to do
  selfResolvable?: boolean // If true, userGuidance alone should fix it (hides Report button initially)
  retryable?: boolean // If true, the operation can be automatically retried

  // Solution tracking - separate verified from theoretical
  solutions: string[] // Theoretical solutions (what MIGHT work)
  verifiedSolutions?: VerifiedSolution[] // What HAS worked (populated from DB)
  failedApproaches?: FailedApproach[] // What did NOT work - don't try again

  // Verification
  verificationQuery?: string // SQL query to verify error is resolved
  verificationEndpoint?: string // API endpoint to test
  verificationSteps?: string[] // Manual steps to verify

  relatedCodes?: string[] // Related error codes
  pgCodes?: string[] // PostgreSQL codes that map to this
}

/**
 * A solution that has been verified to work
 */
export interface VerifiedSolution {
  description: string // What was done
  migrationFile?: string // Migration that implemented the fix
  verifiedAt: string // ISO date when verified
  verifiedBy: string // Who/what verified it
}

/**
 * An approach that was tried but failed
 */
export interface FailedApproach {
  description: string // What was attempted
  migrationFile?: string // Migration file (if applicable)
  reason: string // Why it didn't work
  attemptedAt: string // ISO date when attempted
}

/**
 * Resolution status for tracking fix attempts
 */
export type ResolutionStatus = 'pending' | 'verified' | 'failed' | 'partial'

/**
 * Resolution record for tracking a fix attempt
 */
export interface ErrorResolution {
  id: string
  errorCode: string
  traceId?: string
  attemptedFix: string
  migrationFile?: string
  codeChanges?: string
  status: ResolutionStatus
  failureReason?: string
  partialNotes?: string
  verificationMethod?: 'manual' | 'query' | 'api_test' | 'automated'
  verificationQuery?: string
  verificationResult?: string
  verifiedAt?: string
  verifiedBy?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

/**
 * API error response format (extends existing pattern)
 */
export interface TracedErrorResponse {
  error: string // User-friendly message
  code?: string // Error code (always included — helps users report issues)
  details?: string // SQL details (dev/staging only — hidden in production)
  traceId?: string // Unique trace ID for log correlation
}

/**
 * Supabase error shape
 */
export interface SupabaseError {
  code?: string // PostgreSQL error code
  message: string
  details?: string | null
  hint?: string | null
}

/**
 * HTTP status code mapping for error categories
 */
export const HTTP_STATUS_MAP: Record<string, number> = {
  ERR_AUTH_001: 401, // Not authenticated
  ERR_AUTH_002: 403, // Insufficient role
  ERR_AUTH_003: 404, // Vendor not found
  ERR_RLS_001: 500, // RLS recursion (server error)
  ERR_RLS_002: 403, // RLS access denied
  ERR_DB_001: 400, // Foreign key violation
  ERR_DB_002: 409, // Unique constraint violation
  ERR_RATE_001: 429, // Rate limited
  // Market box errors
  ERR_MBOX_001: 500, // Creation failed (database error)
  ERR_MBOX_002: 400, // Invalid schedule for traditional market
  ERR_MBOX_003: 403, // Limit reached
  ERR_MBOX_004: 404, // Market not found
  ERR_MBOX_005: 500, // Update failed
  ERR_MBOX_006: 400, // Invalid price
  ERR_MBOX_007: 400, // Missing required fields
  DEFAULT: 500,
}

/**
 * Get HTTP status code for an error code
 */
export function getHttpStatus(errorCode: string): number {
  return HTTP_STATUS_MAP[errorCode] || HTTP_STATUS_MAP.DEFAULT
}
