/**
 * Simple in-memory rate limiter for API routes
 *
 * Note: This is per-serverless-instance, so it won't perfectly limit
 * across all instances. For production-scale apps, use Redis or similar.
 * However, this provides basic protection against abuse at zero cost.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store - will reset when serverless instance cold starts
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60 * 1000 // 1 minute
let lastCleanup = Date.now()

function cleanupExpiredEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Time window in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier for the client (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result with success status and metadata
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanupExpiredEntries()

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = rateLimitStore.get(identifier)

  // No existing entry or window has expired
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs
    }
    rateLimitStore.set(identifier, newEntry)
    return {
      success: true,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt
    }
  }

  // Within window - check count
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt
    }
  }

  // Increment count
  entry.count++
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt
  }
}

/**
 * Get client IP from request headers
 * Works with Vercel, Cloudflare, and direct connections
 */
export function getClientIp(request: Request): string {
  // Vercel / common proxy headers
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, the first is the client
    return forwardedFor.split(',')[0].trim()
  }

  // Cloudflare
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp) {
    return cfConnectingIp
  }

  // Vercel specific
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback - shouldn't happen in production behind a proxy
  return 'unknown'
}

/**
 * Pre-configured rate limits for common use cases
 */
export const rateLimits = {
  // Auth endpoints - stricter limits
  auth: { limit: 5, windowSeconds: 60 } as RateLimitConfig,

  // Form submissions
  submit: { limit: 10, windowSeconds: 60 } as RateLimitConfig,

  // API reads
  api: { limit: 60, windowSeconds: 60 } as RateLimitConfig,

  // Admin operations
  admin: { limit: 30, windowSeconds: 60 } as RateLimitConfig,

  // Webhook endpoints (from trusted sources)
  webhook: { limit: 100, windowSeconds: 60 } as RateLimitConfig,
}

/**
 * Create a rate limit response with proper headers
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
        'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000))
      }
    }
  )
}
