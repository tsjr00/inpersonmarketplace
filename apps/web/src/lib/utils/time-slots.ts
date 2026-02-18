/**
 * Time slot utilities for food truck pickup scheduling.
 * Generates 30-minute pickup windows from a vendor's operating hours.
 */

/**
 * Parse a time string ("HH:MM:SS" or "HH:MM") into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  return parts[0] * 60 + (parts[1] || 0)
}

/**
 * Convert total minutes since midnight to "HH:MM" string.
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Generate 30-min time slots from a schedule's start/end times.
 * Each slot represents the START of a 30-min window (e.g., "10:00" = 10:00–10:30).
 *
 * @param startTime - Schedule start ("HH:MM:SS" or "HH:MM")
 * @param endTime - Schedule end ("HH:MM:SS" or "HH:MM")
 * @param pickupDate - "YYYY-MM-DD" — if today, filters out slots too close to now
 * @param minLeadMinutes - Minimum minutes from now for today's slots (default 30)
 * @returns Array of "HH:MM" time strings
 */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  pickupDate?: string,
  minLeadMinutes: number = 30
): string[] {
  const startMins = parseTimeToMinutes(startTime)
  const endMins = parseTimeToMinutes(endTime)
  const slots: string[] = []

  // Generate slots every 30 min; last slot must allow a full 30-min window
  for (let m = startMins; m + 30 <= endMins; m += 30) {
    slots.push(minutesToTime(m))
  }

  // If pickup is today, filter out slots that are too soon
  if (pickupDate) {
    const today = new Date().toISOString().split('T')[0]
    if (pickupDate === today) {
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const cutoff = nowMins + minLeadMinutes
      return slots.filter(slot => parseTimeToMinutes(slot) >= cutoff)
    }
  }

  return slots
}

/**
 * Format a time slot for display: "10:00" → "10:00 AM", "14:30" → "2:30 PM"
 */
export function formatTimeSlot(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minuteStr} ${ampm}`
}
