/**
 * Content moderation utility for user-generated text.
 *
 * Two modes:
 * - `isProfane(text)` — returns true if text contains profanity (for validation)
 * - `moderateText(text)` — returns { clean, flagged, reason } with details
 *
 * Uses `bad-words` library as base + custom additions for platform context.
 * Call from API routes on text submission (listings, reviews, profiles, etc.)
 */

import { Filter } from 'bad-words'

// Custom additions beyond the default bad-words list
const CUSTOM_PROFANITY: string[] = [
  // Add platform-specific blocked terms here as needed
  // These supplement the ~460 words already in bad-words
]

// Words that bad-words might flag but we want to allow (food/farming context)
const ALLOW_LIST: string[] = [
  'breast',    // chicken breast
  'thigh',     // chicken thigh
  'cocktail',  // cocktail sauce
  'shank',     // lamb shank
  'strip',     // strip steak
  'tender',    // chicken tender
  'boner',     // deboning tool (butcher term)
  'hooker',    // cheese hooker (farming tool)
  'nipple',    // bottle nipple (dairy)
  'erect',     // tent/booth setup
]

let _filter: InstanceType<typeof Filter> | null = null

function getFilter(): InstanceType<typeof Filter> {
  if (!_filter) {
    _filter = new Filter()
    // Remove false positives for food/farming context
    _filter.removeWords(...ALLOW_LIST)
    // Add custom blocked terms
    if (CUSTOM_PROFANITY.length > 0) {
      _filter.addWords(...CUSTOM_PROFANITY)
    }
  }
  return _filter
}

/**
 * Check if text contains profanity.
 * Use for quick validation before saving to DB.
 */
export function isProfane(text: string): boolean {
  if (!text || text.trim().length === 0) return false
  try {
    return getFilter().isProfane(text)
  } catch {
    // If filter fails, don't block the user
    return false
  }
}

/**
 * Get detailed moderation result for text.
 * Returns the cleaned version and whether it was flagged.
 */
export function moderateText(text: string): {
  clean: string
  flagged: boolean
  reason: string | null
} {
  if (!text || text.trim().length === 0) {
    return { clean: text, flagged: false, reason: null }
  }
  try {
    const filter = getFilter()
    const flagged = filter.isProfane(text)
    const clean = flagged ? filter.clean(text) : text
    return {
      clean,
      flagged,
      reason: flagged ? 'Content contains inappropriate language' : null,
    }
  } catch {
    return { clean: text, flagged: false, reason: null }
  }
}

/**
 * Validate multiple text fields at once.
 * Returns the first field that fails, or null if all pass.
 * Use in API routes to check all user-submitted text in one call.
 */
export function checkFields(fields: Record<string, string | null | undefined>): {
  passed: boolean
  failedField: string | null
  reason: string | null
} {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (value && isProfane(value)) {
      return {
        passed: false,
        failedField: fieldName,
        reason: `The ${fieldName.replace(/_/g, ' ')} field contains inappropriate language. Please revise and try again.`,
      }
    }
  }
  return { passed: true, failedField: null, reason: null }
}
