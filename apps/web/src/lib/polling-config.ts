/**
 * Centralized polling intervals + business hours awareness.
 *
 * FM/FT are daytime businesses — no need to poll aggressively at 2am.
 * All components also refetch on tab focus + page navigation for instant updates.
 * These intervals are background safety nets, not the primary data source.
 */

const OFF_PEAK_START = 22 // 10 PM local time
const OFF_PEAK_END = 6    // 6 AM local time

/** Off-peak: 10pm-6am in the user's local timezone */
export function isOffPeak(): boolean {
  const hour = new Date().getHours()
  return hour >= OFF_PEAK_START || hour < OFF_PEAK_END
}

export const POLLING_INTERVALS = {
  /** NotificationBell unread count */
  notificationCount: 5 * 60 * 1000,        // 5 min active hours (was 60s)
  notificationCountOffPeak: 15 * 60 * 1000, // 15 min off-peak

  /** Vendor dashboard orders list */
  vendorOrders: 2 * 60 * 1000,              // 2 min active hours (was 30s)
  vendorOrdersOffPeak: 10 * 60 * 1000,      // 10 min off-peak

  /** CutoffStatusBanner availability check */
  cutoffStatus: 5 * 60 * 1000,              // 5 min (was 60s) — cutoffs measured in hours
} as const

/** Get the appropriate polling interval based on time of day */
export function getPollingInterval(active: number, offPeak: number): number {
  return isOffPeak() ? offPeak : active
}
