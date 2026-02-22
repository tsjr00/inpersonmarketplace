import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  // Use unique identifiers per test to avoid cross-test interference
  let testId = 0
  beforeEach(() => { testId++ })

  it('allows requests under the limit', () => {
    const id = `test-under-${testId}`
    const result = checkRateLimit(id, { limit: 5, windowSeconds: 60 })

    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('tracks remaining count accurately', () => {
    const id = `test-remaining-${testId}`
    const config = { limit: 3, windowSeconds: 60 }

    const r1 = checkRateLimit(id, config)
    expect(r1.remaining).toBe(2)

    const r2 = checkRateLimit(id, config)
    expect(r2.remaining).toBe(1)

    const r3 = checkRateLimit(id, config)
    expect(r3.remaining).toBe(0)
  })

  it('blocks requests at the limit', () => {
    const id = `test-block-${testId}`
    const config = { limit: 2, windowSeconds: 60 }

    checkRateLimit(id, config) // 1
    checkRateLimit(id, config) // 2

    const blocked = checkRateLimit(id, config) // 3 - should be blocked
    expect(blocked.success).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('different identifiers are tracked independently', () => {
    const config = { limit: 1, windowSeconds: 60 }

    const r1 = checkRateLimit(`user-a-${testId}`, config)
    const r2 = checkRateLimit(`user-b-${testId}`, config)

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)

    const r3 = checkRateLimit(`user-a-${testId}`, config)
    expect(r3.success).toBe(false)
  })
})

describe('rateLimits presets', () => {
  it('has expected preset configurations', () => {
    expect(rateLimits.auth.limit).toBe(5)
    expect(rateLimits.api.limit).toBe(60)
    expect(rateLimits.admin.limit).toBe(30)
    expect(rateLimits.deletion.limit).toBe(3)
    expect(rateLimits.deletion.windowSeconds).toBe(3600) // 1 hour
  })
})

describe('rateLimitResponse', () => {
  it('returns 429 status with proper headers', () => {
    const result = {
      success: false,
      remaining: 0,
      resetAt: Date.now() + 30000
    }

    const response = rateLimitResponse(result)
    expect(response.status).toBe(429)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('Retry-After')).toBeTruthy()
  })
})
