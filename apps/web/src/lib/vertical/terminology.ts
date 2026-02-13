import { verticalConfigs } from './configs'
import type { TerminologyKey, VerticalContent, VerticalTerminologyConfig } from './types'

const DEFAULT_VERTICAL = 'farmers_market'

/**
 * Get a terminology label for a vertical.
 * Synchronous — reads from static config, no DB call.
 *
 * Usage:
 *   term('food_trucks', 'vendor')      → "Food Truck"
 *   term('farmers_market', 'vendor')   → "Vendor"
 *   term('food_trucks', 'vendor_signup_cta') → "List Your Food Truck"
 */
export function term(verticalId: string, key: TerminologyKey): string {
  const config = verticalConfigs[verticalId] ?? verticalConfigs[DEFAULT_VERTICAL]
  return config?.terminology[key] ?? key
}

/**
 * Get the full content block for a vertical's landing page / marketing text.
 * Returns the entire content object for destructuring in components.
 *
 * Usage:
 *   const { hero, how_it_works } = getContent('food_trucks')
 *   hero.subtitle → "Find food trucks near you..."
 */
export function getContent(verticalId: string): VerticalContent {
  const config = verticalConfigs[verticalId] ?? verticalConfigs[DEFAULT_VERTICAL]
  return config.content
}

/**
 * Get the full terminology config for a vertical (terminology + content).
 * Useful when a component needs both labels and content blocks.
 */
export function getVerticalTerminologyConfig(verticalId: string): VerticalTerminologyConfig {
  return verticalConfigs[verticalId] ?? verticalConfigs[DEFAULT_VERTICAL]
}

/**
 * Check if a vertical has a terminology config registered.
 */
export function hasTerminologyConfig(verticalId: string): boolean {
  return verticalId in verticalConfigs
}
