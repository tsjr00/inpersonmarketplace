/**
 * M-3: Shared vertical validation utility.
 * Single source of truth for valid vertical IDs — used by API routes, middleware, etc.
 */

export const VALID_VERTICALS = new Set(['farmers_market', 'food_trucks', 'fire_works'])

export type ValidVertical = 'farmers_market' | 'food_trucks' | 'fire_works'

export function validateVertical(value: unknown): value is ValidVertical {
  return typeof value === 'string' && VALID_VERTICALS.has(value)
}

export function requireVertical(value: unknown, paramName = 'vertical'): ValidVertical {
  if (!validateVertical(value)) {
    throw new Error(`Invalid ${paramName}: "${value}". Must be one of: ${[...VALID_VERTICALS].join(', ')}`)
  }
  return value
}
