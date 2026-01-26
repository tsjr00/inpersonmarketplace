/**
 * API Route Error Tracing Wrapper
 *
 * Wraps API route handlers with error tracing, breadcrumb management,
 * and standardized error responses.
 */

import { NextResponse } from 'next/server'
import { TracedError } from './traced-error'
import { startBreadcrumbTrail, crumb } from './breadcrumbs'
import { logError } from './logger'
import { getHttpStatus } from './types'

/**
 * Check if we should show error codes in responses
 */
function shouldShowErrorCodes(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.SHOW_ERROR_CODES === 'true'
  )
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

        // Return standardized error response
        return NextResponse.json(
          error.toResponse(shouldShowErrorCodes()),
          { status: error.httpStatus }
        )
      }

      // Convert unknown errors to TracedError
      const traced = TracedError.fromUnknown(error, { route, method })
      await logError(traced)

      return NextResponse.json(
        traced.toResponse(shouldShowErrorCodes()),
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
