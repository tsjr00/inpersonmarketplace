/**
 * Smart refresh utility for availability data.
 *
 * Optimizes API calls based on:
 * 1. Proximity to cutoff times (more frequent when cutoff is near)
 * 2. Time of day (no refresh during off-peak hours 10 PM - 6 AM)
 * 3. Tab visibility (pause when tab is hidden)
 * 4. Context (listing detail vs browse page)
 *
 * Estimated savings: 94-96% reduction in API calls
 */

// Off-peak hours when we skip auto-refresh (10 PM to 6 AM local time)
const OFF_PEAK_START = 22 // 10 PM
const OFF_PEAK_END = 6    // 6 AM

/**
 * Check if current time is during off-peak hours
 */
export function isOffPeakHours(): boolean {
  const hour = new Date().getHours()
  return hour >= OFF_PEAK_START || hour < OFF_PEAK_END
}

/**
 * Check if the browser tab is currently visible
 */
export function isTabVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

/**
 * Calculate hours until the nearest cutoff time
 * @param cutoffTimes Array of ISO date strings representing cutoff times
 * @returns Hours until nearest cutoff, or null if no cutoffs provided
 */
export function hoursUntilNearestCutoff(cutoffTimes: (string | null | undefined)[]): number | null {
  const validCutoffs = cutoffTimes.filter((c): c is string => !!c)
  if (validCutoffs.length === 0) return null

  const now = Date.now()
  let nearest = Infinity

  for (const cutoff of validCutoffs) {
    const cutoffTime = new Date(cutoff).getTime()
    const hoursUntil = (cutoffTime - now) / (1000 * 60 * 60)
    // Only consider future cutoffs
    if (hoursUntil > 0 && hoursUntil < nearest) {
      nearest = hoursUntil
    }
  }

  return nearest === Infinity ? null : nearest
}

/**
 * Refresh interval configuration for LISTING DETAIL pages.
 * More aggressive since user is focused on a single item.
 */
export interface DetailRefreshConfig {
  type: 'detail'
}

/**
 * Refresh interval configuration for BROWSE/PROFILE pages.
 * Less aggressive since user is scanning multiple items.
 */
export interface BrowseRefreshConfig {
  type: 'browse'
}

export type RefreshConfig = DetailRefreshConfig | BrowseRefreshConfig

/**
 * Calculate the optimal refresh interval in milliseconds.
 *
 * LISTING DETAIL strategy (user is focused, deciding):
 * - Within 1 hour of cutoff: 3 minutes
 * - Within 4 hours of cutoff: 10 minutes
 * - Peak hours, no cutoff nearby: 30 minutes
 * - Off-peak hours: No refresh
 *
 * BROWSE/PROFILE strategy (user is scanning):
 * - Within 2 hours of cutoff: 5 minutes
 * - Peak hours, no cutoff nearby: No refresh (initial load sufficient)
 * - Off-peak hours: No refresh
 *
 * @param config The page context (detail or browse)
 * @param cutoffTimes Array of cutoff times from availability data
 * @returns Interval in ms, or null if no refresh should occur
 */
export function calculateRefreshInterval(
  config: RefreshConfig,
  cutoffTimes: (string | null | undefined)[]
): number | null {
  // No refresh during off-peak hours
  if (isOffPeakHours()) {
    return null
  }

  const hoursUntil = hoursUntilNearestCutoff(cutoffTimes)

  if (config.type === 'detail') {
    // LISTING DETAIL PAGE - more aggressive refresh

    if (hoursUntil !== null && hoursUntil <= 1) {
      // Within 1 hour of cutoff: refresh every 3 minutes
      return 3 * 60 * 1000
    }

    if (hoursUntil !== null && hoursUntil <= 4) {
      // Within 4 hours of cutoff: refresh every 10 minutes
      return 10 * 60 * 1000
    }

    // No imminent cutoff: refresh every 30 minutes as a safety net
    return 30 * 60 * 1000

  } else {
    // BROWSE/PROFILE PAGE - less aggressive refresh

    if (hoursUntil !== null && hoursUntil <= 2) {
      // Within 2 hours of cutoff: refresh every 5 minutes
      return 5 * 60 * 1000
    }

    // No imminent cutoff: no auto-refresh (initial load is sufficient)
    return null
  }
}

/**
 * React hook for smart refresh with visibility handling.
 *
 * Usage:
 * ```tsx
 * const { shouldRefresh, lastHiddenDuration } = useSmartRefresh({
 *   config: { type: 'detail' },
 *   cutoffTimes: markets.map(m => m.cutoff_at),
 *   onRefresh: fetchAvailability
 * })
 * ```
 */
export function createSmartRefreshManager(
  config: RefreshConfig,
  cutoffTimes: (string | null | undefined)[],
  onRefresh: () => void
): { cleanup: () => void } {
  // Don't run on server
  if (typeof window === 'undefined') {
    return { cleanup: () => {} }
  }

  let intervalId: ReturnType<typeof setInterval> | null = null
  let hiddenAt: number | null = null
  const MIN_HIDDEN_DURATION_FOR_REFRESH = 5 * 60 * 1000 // 5 minutes

  // Calculate and set the refresh interval
  function setupInterval() {
    // Clear any existing interval
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }

    const interval = calculateRefreshInterval(config, cutoffTimes)

    if (interval !== null && isTabVisible()) {
      intervalId = setInterval(() => {
        if (isTabVisible() && !isOffPeakHours()) {
          onRefresh()
        }
      }, interval)
    }
  }

  // Handle visibility changes
  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Tab became hidden - record the time
      hiddenAt = Date.now()
      // Stop the interval while hidden
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    } else {
      // Tab became visible
      if (hiddenAt !== null) {
        const hiddenDuration = Date.now() - hiddenAt
        // If hidden for more than 5 minutes, do a refresh
        if (hiddenDuration > MIN_HIDDEN_DURATION_FOR_REFRESH) {
          onRefresh()
        }
        hiddenAt = null
      }
      // Restart the interval
      setupInterval()
    }
  }

  // Initial setup
  setupInterval()
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Cleanup function
  return {
    cleanup: () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
