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
 * Generate arrival time slots from a vendor's operating hours.
 * Each slot is an arrival time the buyer can choose (e.g., "10:00" = "I'll arrive at 10:00").
 * Multiple buyers can pick the same slot — slots are waves, not reservations.
 *
 * End time = last time vendor will serve a customer. A slot AT end time is valid
 * (buyer arrives at close, vendor serves them).
 *
 * @param startTime - Schedule start ("HH:MM:SS" or "HH:MM")
 * @param endTime - Schedule end ("HH:MM:SS" or "HH:MM") — last time vendor will serve
 * @param pickupDate - "YYYY-MM-DD" — if today, filters out slots too close to now
 * @param minLeadMinutes - Minimum minutes from now for today's slots (default 30).
 *   FT vendors configure this to 15 or 30 via vendor_profiles.pickup_lead_minutes.
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

  // Generate slots at intervals matching the vendor's lead time (15 or 30 min)
  const slotInterval = minLeadMinutes <= 15 ? 15 : 30
  for (let m = startMins; m <= endMins; m += slotInterval) {
    slots.push(minutesToTime(m))
  }

  // If pickup is today, filter out slots that are too soon
  if (pickupDate) {
    const now = new Date()
    // Use local date (not UTC) to match the pickup date from the DB
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const today = `${year}-${month}-${day}`
    if (pickupDate === today) {
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
