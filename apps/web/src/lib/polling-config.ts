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
  /** NotificationBell — slow safety net only.
   *  Push notifications alert users, tab-focus + page navigation give instant badge updates.
   *  This polling is just a fallback for badge count accuracy. */
  notificationCount: 15 * 60 * 1000,        // 15 min active hours
  notificationCountOffPeak: 30 * 60 * 1000, // 30 min off-peak

  /** Vendor orders — FT (same-day food orders, vendors need timely updates) */
  vendorOrdersFT: 2 * 60 * 1000,              // 2 min active hours
  vendorOrdersFTOffPeak: 10 * 60 * 1000,       // 10 min off-peak

  /** Vendor orders — FM (orders placed days in advance, low urgency) */
  vendorOrdersFM: 60 * 60 * 1000,             // 60 min active hours
  vendorOrdersFMOffPeak: 180 * 60 * 1000,     // 180 min (3 hr) off-peak
} as const

/** Get the appropriate polling interval based on time of day */
export function getPollingInterval(active: number, offPeak: number): number {
  return isOffPeak() ? offPeak : active
}
