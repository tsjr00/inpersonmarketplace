import { randomBytes } from 'crypto'

/**
 * Buyer survey access tokens (mig 147 / Phase E).
 *
 * Why opaque tokens stored in DB instead of signed JWTs:
 *   - Simpler — no secret rotation, no signing key management
 *   - Revocable — can NULL the token to invalidate without changing key
 *   - Validatable in one DB hit (the UNIQUE partial index on access_token
 *     gives O(1) lookup; expires_at column handles TTL)
 *   - No payload — token is purely a lookup key; the DB row carries the
 *     audience identity + market context. Smaller URL, no leak risk.
 *
 * Format: 32 url-safe characters from a 192-bit random buffer (base64url
 * truncated). Collision probability is ~0 over the lifetime of the
 * platform; the UNIQUE constraint catches any theoretical clash at insert.
 */

/**
 * Generate a fresh opaque token for a buyer survey row. Caller stores
 * it in market_surveys.access_token. Always exactly 32 chars; URL-safe
 * (a-z, A-Z, 0-9, hyphen, underscore).
 */
export function generateSurveyToken(): string {
  // 24 random bytes → 32 base64url chars (no padding)
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 32)
}

/**
 * Sanity-check a token string before hitting the DB. Returns true if
 * the shape matches what generateSurveyToken() produces. Cheaper to
 * reject obvious garbage at the route layer than to round-trip to PG.
 */
export function isWellFormedSurveyToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
}
