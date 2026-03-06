/**
 * API Route Error Tracing Wrapper
 *
 * Wraps API route handlers with error tracing, breadcrumb management,
 * and standardized error responses.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { TracedError } from './traced-error'
import { startBreadcrumbTrail, crumb } from './breadcrumbs'
import { logError } from './logger'
import { getHttpStatus } from './types'

/**
 * Error codes (ERR_AUTH_003) are always shown — they help users report issues
 * and are not a security risk. SQL details (pgDetail) are hidden in production.
 */
function shouldShowErrorDetails(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Wraps an API route handler with error tracing
 *
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   return withErrorTracing('/api/buyer/orders', 'GET', async () => {
 *     // Your route logic here
 *     return NextResponse.json({ data })
 *   })
 * }
 * ```
 */
export async function withErrorTracing<T>(
  route: string,
  method: string,
  handler: () => Promise<T>
): Promise<T | NextResponse> {
  return startBreadcrumbTrail(async () => {
    // Add initial breadcrumb for the route
    crumb.api(route, method)

    try {
      return await handler()
    } catch (error) {
      // If already a TracedError, use it
      if (error instanceof TracedError) {
        // Add route context if not already present
        if (!error.context.route) {
          error.context.route = route
          error.context.method = method
        }

        // Log to console and database
        await logError(error)

        // H-8: Report to Sentry — only server errors (5xx), not validation/auth (4xx)
        if (error.httpStatus >= 500) {
          Sentry.captureException(error, {
            tags: { route, method, errorCode: error.code },
            extra: error.context,
          })
        }

        // Return standardized error response
        return NextResponse.json(
          error.toResponse(shouldShowErrorDetails()),
          { status: error.httpStatus }
        )
      }

      // Convert unknown errors to TracedError
      const traced = TracedError.fromUnknown(error, { route, method })
      await logError(traced)

      // H-8: Report to Sentry
      Sentry.captureException(error, {
        tags: { route, method, errorCode: traced.code },
        extra: traced.context,
      })

      return NextResponse.json(
        traced.toResponse(shouldShowErrorDetails()),
        { status: 500 }
      )
    }
  })
}

/**
 * Create a traced route handler with automatic context
 *
 * Usage:
 * ```typescript
 * export const GET = createTracedHandler('/api/buyer/orders', 'GET', async (request) => {
 *   // Your route logic here
 *   return NextResponse.json({ data })
 * })
 * ```
 */
export function createTracedHandler<T>(
  route: string,
  method: string,
  handler: (request: Request) => Promise<T>
) {
  return async (request: Request): Promise<T | NextResponse> => {
    return withErrorTracing(route, method, () => handler(request))
  }
}

/**
 * Helper to throw a TracedError with route context already set
 */
export function throwTracedError(
  code: string,
  message: string,
  context?: Record<string, unknown>
): never {
  throw new TracedError(code, message, context)
}
