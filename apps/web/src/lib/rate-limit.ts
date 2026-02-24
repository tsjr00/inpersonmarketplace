/**
 * In-memory rate limiter for API routes with burst detection and pattern analysis.
 *
 * Limitations: Per-serverless-instance (no shared state across Vercel functions).
 * Provides basic protection against abuse at zero cost for beta scale.
 *
 * FUTURE: Upstash Redis Integration
 * ==================================
 * The in-memory store resets on cold start and is per-instance.
 * Upstash Redis free tier (500K commands/mo) will replace this.
 *
 * Migration plan:
 * 1. Install @upstash/redis and @upstash/ratelimit
 * 2. Create Upstash Redis database (free tier)
 * 3. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
 * 4. Replace Map-based store with Upstash Ratelimit sliding window
 * 5. Keep in-memory fallback for local dev (when env vars not set)
 * 6. Burst detection and pattern analysis can use Redis sorted sets
 *
 * Estimated Upstash usage: ~50K commands/mo at current traffic
 * (each rate limit check = 1-2 Redis commands)
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// ── Stores ──────────────────────────────────────────────

// Primary rate limit store
const rateLimitStore = new Map<string, RateLimitEntry>()

// Burst detection: tracks recent request timestamps per key
const burstStore = new Map<string, number[]>()

// Endpoint scanning detection: tracks unique routes per IP
const scanStore = new Map<string, { routes: Set<string>; resetAt: number }>()

// ── Cleanup ─────────────────────────────────────────────

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
  // Clean burst store (keep last 10 seconds of data)
  for (const [key, timestamps] of burstStore.entries()) {
    const recent = timestamps.filter(t => t > now - 10_000)
    if (recent.length === 0) burstStore.delete(key)
    else burstStore.set(key, recent)
  }
  // Clean scan store
  for (const [key, entry] of scanStore.entries()) {
    if (entry.resetAt < now) scanStore.delete(key)
  }
}

// ── Types ───────────────────────────────────────────────

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
  /** True if this request was flagged as a burst (too fast) */
  burst?: boolean
  /** True if this IP is scanning multiple endpoints */
  scanning?: boolean
}

// ── Composite Key ───────────────────────────────────────

/**
 * Create a composite rate limit key from IP + optional user/fingerprint signals.
 * Provides better identification when IP alone is ambiguous (shared NAT, VPN).
 */
export function compositeKey(ip: string, userId?: string, fingerprint?: string): string {
  const parts = [ip]
  if (userId) parts.push(`u:${userId}`)
  if (fingerprint) parts.push(`fp:${fingerprint}`)
  return parts.join('|')
}

/**
 * Generate a simple request fingerprint from headers.
 * Not browser fingerprinting — just request header hashing for additional signal.
 */
export function getRequestFingerprint(request: Request): string {
  const ua = request.headers.get('user-agent') || ''
  const lang = request.headers.get('accept-language') || ''
  const enc = request.headers.get('accept-encoding') || ''
  // Simple hash: sum char codes, mod to keep short
  const raw = `${ua}|${lang}|${enc}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

// ── Burst Detection ─────────────────────────────────────

const BURST_WINDOW_MS = 1_000 // 1 second
const BURST_THRESHOLD = 5    // max requests per second before flagging

/**
 * Check if a client is sending requests faster than the burst threshold.
 * Returns true if the client is bursting (>5 req/sec).
 */
export function checkBurst(identifier: string): boolean {
  const now = Date.now()
  const timestamps = burstStore.get(identifier) || []
  timestamps.push(now)

  // Keep only timestamps within burst window
  const recent = timestamps.filter(t => t > now - BURST_WINDOW_MS)
  burstStore.set(identifier, recent)

  return recent.length > BURST_THRESHOLD
}

// ── Endpoint Scanning Detection ─────────────────────────

const SCAN_WINDOW_S = 60       // 60 second window
const SCAN_ROUTE_THRESHOLD = 10 // flag if >10 unique endpoints in window

/**
 * Track which routes an IP is hitting. Flags potential endpoint scanning
 * (automated probing of multiple API endpoints).
 */
export function trackEndpointScan(ip: string, route: string): boolean {
  const now = Date.now()
  let entry = scanStore.get(ip)

  if (!entry || entry.resetAt < now) {
    entry = { routes: new Set(), resetAt: now + SCAN_WINDOW_S * 1000 }
    scanStore.set(ip, entry)
  }

  entry.routes.add(route)
  return entry.routes.size > SCAN_ROUTE_THRESHOLD
}

// ── Core Rate Limiter ───────────────────────────────────

/**
 * Check if a request should be rate limited.
 *
 * @param identifier - Unique identifier for the client (e.g., IP address, composite key)
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

  // Check burst status (informational — does not block, just flags)
  const burst = checkBurst(identifier)

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
      resetAt: newEntry.resetAt,
      burst,
    }
  }

  // Within window - check count
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      burst,
    }
  }

  // Increment count
  entry.count++
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
    burst,
  }
}

// ── IP Extraction ───────────────────────────────────────

/**
 * Get client IP from request headers.
 * Works with Vercel, Cloudflare, and direct connections.
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

// ── Presets ──────────────────────────────────────────────

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

  // Destructive operations (account deletion, etc.)
  deletion: { limit: 3, windowSeconds: 3600 } as RateLimitConfig,

  // Webhook endpoints (from trusted sources)
  webhook: { limit: 100, windowSeconds: 60 } as RateLimitConfig,

  // Sensitive endpoints — payment, stripe connect, subscription checkout
  sensitive: { limit: 3, windowSeconds: 60 } as RateLimitConfig,
}

// ── Response Helper ─────────────────────────────────────

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
