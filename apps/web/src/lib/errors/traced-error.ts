/**
 * TracedError - Error class with structured context and breadcrumbs
 *
 * Extends Error with:
 * - Unique error codes for quick lookup
 * - Context about what was happening when error occurred
 * - Breadcrumb trail showing execution path
 * - Trace ID for correlating logs with API responses
 */

import { ErrorContext, ErrorSeverity, TracedErrorResponse, getHttpStatus } from './types'
import { getBreadcrumbs } from './breadcrumbs'
import { lookupError } from './error-catalog'

/**
 * Generate a unique trace ID for error correlation
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}`
}

/**
 * Get severity from error catalog or default based on category
 */
function getErrorSeverity(code: string): ErrorSeverity {
  const entry = lookupError(code)
  if (entry) return entry.severity

  // Default severities based on category
  if (code.startsWith('ERR_RLS_')) return 'high'
  if (code.startsWith('ERR_AUTH_')) return 'medium'
  if (code.startsWith('ERR_DB_')) return 'medium'
  return 'medium'
}

/**
 * TracedError extends Error with structured context and breadcrumbs.
 *
 * Usage:
 *   throw new TracedError('ERR_RLS_001', 'Access denied', {
 *     table: 'orders',
 *     userId: user.id
 *   });
 */
export class TracedError extends Error {
  public readonly code: string
  public readonly context: ErrorContext
  public readonly timestamp: number
  public readonly traceId: string
  public readonly severity: ErrorSeverity
  public readonly httpStatus: number

  constructor(code: string, message: string, context?: Partial<ErrorContext>) {
    super(message)
    this.name = 'TracedError'
    this.code = code
    this.timestamp = Date.now()
    this.traceId = generateTraceId()
    this.severity = getErrorSeverity(code)
    this.httpStatus = getHttpStatus(code)

    // Merge provided context with current breadcrumbs
    this.context = {
      ...context,
      breadcrumbs: getBreadcrumbs(),
    }

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TracedError)
    }
  }

  /**
   * Create response object for API routes
   * @param showCode - Include error code in response (true for dev/staging)
   */
  toResponse(showCode: boolean = false): TracedErrorResponse {
    const response: TracedErrorResponse = {
      error: this.message,
      traceId: this.traceId,
    }

    // Include error code in dev/staging for debugging
    if (showCode) {
      response.code = this.code
      if (this.context.pgDetail) {
        response.details = this.context.pgDetail
      }
    }

    return response
  }

  /**
   * Log error with full context to console
   */
  log(): void {
    const logData = {
      traceId: this.traceId,
      severity: this.severity,
      context: {
        route: this.context.route,
        method: this.context.method,
        userId: this.context.userId,
        table: this.context.table,
        operation: this.context.operation,
        pgCode: this.context.pgCode,
        pgDetail: this.context.pgDetail,
        pgHint: this.context.pgHint,
      },
      breadcrumbs: this.context.breadcrumbs,
    }

    // Clean up undefined values
    Object.keys(logData.context).forEach((key) => {
      if (logData.context[key as keyof typeof logData.context] === undefined) {
        delete logData.context[key as keyof typeof logData.context]
      }
    })

    console.error(`[${this.code}] ${this.message}`, JSON.stringify(logData, null, 2))
  }

  /**
   * Get catalog entry for this error (if exists)
   */
  getCatalogEntry() {
    return lookupError(this.code)
  }

  /**
   * Create a TracedError from an unknown error
   */
  static fromUnknown(error: unknown, context?: Partial<ErrorContext>): TracedError {
    if (error instanceof TracedError) {
      return error
    }

    const message = error instanceof Error ? error.message : String(error)
    return new TracedError('ERR_UNKNOWN_001', message, {
      ...context,
      originalError: error,
    })
  }
}
