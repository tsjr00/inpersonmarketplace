/**
 * Rate limiter with Upstash Redis for shared state across Vercel instances.
 * Falls back to in-memory when UPSTASH_REDIS_REST_URL is not set (local dev).
 *
 * Upstash free tier: 10K commands/day. Each rate limit check = 2 Redis commands.
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// ── Upstash Redis Client ───────────────────────────────

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

// Cache Ratelimit instances per config to avoid re-creation
const limiters = new Map<string, Ratelimit>()

function getLimiter(config: RateLimitConfig): Ratelimit {
  const key = `${config.limit}:${config.windowSeconds}`
  if (!limiters.has(key)) {
    limiters.set(key, new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
      prefix: 'rl',
    }))
  }
  return limiters.get(key)!
}

// ── In-Memory Fallback ─────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Burst detection: tracks recent request timestamps per key
const burstStore = new Map<string, number[]>()

// Endpoint scanning detection: tracks unique routes per IP
const scanStore = new Map<string, { routes: Set<string>; resetAt: number }>()

// Cleanup expired in-memory entries periodically
const CLEANUP_INTERVAL = 60 * 1000
let lastCleanup = Date.now()

function cleanupExpiredEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key)
  }
  for (const [key, timestamps] of burstStore.entries()) {
    const recent = timestamps.filter(t => t > now - 10_000)
    if (recent.length === 0) burstStore.delete(key)
    else burstStore.set(key, recent)
  }
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
  const raw = `${ua}|${lang}|${enc}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

// ── Burst Detection ─────────────────────────────────────

const BURST_WINDOW_MS = 1_000
const BURST_THRESHOLD = 5

/**
 * Check if a client is sending requests faster than the burst threshold.
 * Returns true if the client is bursting (>5 req/sec).
 * Informational only — stays in-memory.
 */
export function checkBurst(identifier: string): boolean {
  const now = Date.now()
  const timestamps = burstStore.get(identifier) || []
  timestamps.push(now)
  const recent = timestamps.filter(t => t > now - BURST_WINDOW_MS)
  burstStore.set(identifier, recent)
  return recent.length > BURST_THRESHOLD
}

// ── Endpoint Scanning Detection ─────────────────────────

const SCAN_WINDOW_S = 60
const SCAN_ROUTE_THRESHOLD = 10

/**
 * Track which routes an IP is hitting. Flags potential endpoint scanning.
 * Informational only — stays in-memory.
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
 * Uses Upstash Redis when available, falls back to in-memory.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const burst = checkBurst(identifier)

  // Upstash Redis path (shared across all instances)
  if (redis) {
    try {
      const limiter = getLimiter(config)
      const result = await limiter.limit(identifier)
      return {
        success: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
        burst,
      }
    } catch {
      // Redis error — fall through to in-memory as safety net
    }
  }

  // In-memory fallback (local dev or Redis failure)
  cleanupExpiredEntries()

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = rateLimitStore.get(identifier)

  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + windowMs }
    rateLimitStore.set(identifier, newEntry)
    return { success: true, remaining: config.limit - 1, resetAt: newEntry.resetAt, burst }
  }

  if (entry.count >= config.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt, burst }
  }

  entry.count++
  return { success: true, remaining: config.limit - entry.count, resetAt: entry.resetAt, burst }
}

// ── IP Extraction ───────────────────────────────────────

/**
 * Get client IP from request headers.
 * Works with Vercel, Cloudflare, and direct connections.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

// ── Presets ──────────────────────────────────────────────

export const rateLimits = {
  auth: { limit: 5, windowSeconds: 60 } as RateLimitConfig,
  submit: { limit: 10, windowSeconds: 60 } as RateLimitConfig,
  api: { limit: 60, windowSeconds: 60 } as RateLimitConfig,
  admin: { limit: 30, windowSeconds: 60 } as RateLimitConfig,
  deletion: { limit: 3, windowSeconds: 3600 } as RateLimitConfig,
  webhook: { limit: 100, windowSeconds: 60 } as RateLimitConfig,
  sensitive: { limit: 3, windowSeconds: 60 } as RateLimitConfig,
}

// ── Response Helper ─────────────────────────────────────

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
