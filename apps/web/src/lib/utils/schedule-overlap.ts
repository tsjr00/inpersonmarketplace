/**
 * Schedule overlap detection for single-truck vendors.
 *
 * Used by:
 * - API validation (real-time block at save time)
 * - Quality checks (nightly advisory scan)
 *
 * A conflict exists when a vendor is scheduled at TWO DIFFERENT markets
 * on the same day_of_week with overlapping time ranges.
 *
 * Vendors with multiple_trucks=true bypass conflict checks entirely.
 */

export interface ScheduleSlot {
  marketId: string
  marketName: string
  scheduleId: string
  dayOfWeek: number
  startTime: string // HH:MM or HH:MM:SS
  endTime: string   // HH:MM or HH:MM:SS
}

export interface ScheduleConflict {
  existing: ScheduleSlot
  incoming: ScheduleSlot
}

/**
 * Normalize time string to HH:MM:SS for consistent comparison.
 * Input from <input type="time"> is "HH:MM", DB returns "HH:MM:SS".
 */
export function padTime(t: string): string {
  if (!t) return t
  return t.length === 5 ? t + ':00' : t
}

/**
 * Check if two time ranges overlap.
 * Adjacent times (A ends exactly when B starts) are NOT considered overlapping.
 */
export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = padTime(startA)
  const eA = padTime(endA)
  const sB = padTime(startB)
  const eB = padTime(endB)
  return sA < eB && sB < eA
}

/**
 * Find conflicts between a candidate schedule slot and a list of existing slots.
 *
 * Rules:
 * - Only same day_of_week can conflict
 * - Same market is never a conflict (different time slots at one market are fine)
 * - Overlap is checked using normalized HH:MM:SS comparison
 */
export function findScheduleConflicts(
  candidate: ScheduleSlot,
  existingSlots: ScheduleSlot[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []

  for (const existing of existingSlots) {
    // Different day → no conflict
    if (existing.dayOfWeek !== candidate.dayOfWeek) continue
    // Same market → allowed (multiple time slots at one market)
    if (existing.marketId === candidate.marketId) continue

    if (timesOverlap(candidate.startTime, candidate.endTime, existing.startTime, existing.endTime)) {
      conflicts.push({ existing, incoming: candidate })
    }
  }

  return conflicts
}

/**
 * Format a day_of_week number (0=Sunday) to a human-readable name.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayOfWeekName(day: number): string {
  return DAY_NAMES[day] || `Day ${day}`
}

/**
 * Format a time string (HH:MM:SS) to 12-hour display (e.g., "2:00 PM").
 */
export function formatTimeDisplay(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${ampm}`
}
