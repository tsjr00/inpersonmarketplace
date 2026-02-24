/**
 * Timezone display utilities.
 * Uses Intl.DateTimeFormat to derive abbreviations like "CT", "ET", "PT".
 */

/**
 * Get a short timezone abbreviation (e.g. "CT", "ET", "PT") for the given IANA timezone.
 * Falls back to empty string if timezone is null/invalid.
 */
export function getTimezoneAbbreviation(timezone: string | null | undefined, date?: Date): string {
  if (!timezone) return ''
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })
    const parts = formatter.formatToParts(date || new Date())
    const tzPart = parts.find(p => p.type === 'timeZoneName')
    return tzPart?.value || ''
  } catch {
    return ''
  }
}

/**
 * Format a time string (HH:MM or HH:MM:SS) to 12-hour format with optional timezone abbreviation.
 * Example: "14:30" + "America/Chicago" → "2:30 PM CT"
 */
export function formatTimeWithTZ(timeStr: string | null | undefined, timezone?: string | null): string {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':').map(Number)
  if (isNaN(hours) || isNaN(minutes)) return ''

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const timeFormatted = minutes === 0
    ? `${displayHours} ${period}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`

  const tz = getTimezoneAbbreviation(timezone)
  return tz ? `${timeFormatted} ${tz}` : timeFormatted
}

/**
 * Format a time range with timezone abbreviation appended only once at the end.
 * Example: "09:00", "17:00", "America/New_York" → "9 AM - 5 PM ET"
 */
export function formatTimeRangeWithTZ(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  timezone?: string | null
): string {
  if (!startTime) return ''

  const formatPart = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    if (isNaN(hours) || isNaN(minutes)) return ''
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return minutes === 0
      ? `${displayHours} ${period}`
      : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const start = formatPart(startTime)
  if (!start) return ''

  const tz = getTimezoneAbbreviation(timezone)

  if (!endTime) return tz ? `${start} ${tz}` : start

  const end = formatPart(endTime)
  if (!end) return tz ? `${start} ${tz}` : start

  const range = `${start} - ${end}`
  return tz ? `${range} ${tz}` : range
}
