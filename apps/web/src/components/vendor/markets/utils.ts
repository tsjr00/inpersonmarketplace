export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatTime12h(time24: string): string {
  if (!time24) return ''
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

export function getDefaultCutoffHours(vertical: string, marketType: string): number {
  if (marketType === 'event') return 24
  if (vertical === 'food_trucks') return 0
  return marketType === 'private_pickup' ? 10 : 18
}

export function getCutoffDisplay(dayOfWeek: number, startTime: string, cutoffHrs: number): string | null {
  if (cutoffHrs === 0) return null

  const [hours, minutes] = startTime.split(':').map(Number)

  let cutoffHour = hours - cutoffHrs
  let cutoffDay = dayOfWeek

  while (cutoffHour < 0) {
    cutoffHour += 24
    cutoffDay = cutoffDay === 0 ? 6 : cutoffDay - 1
  }

  const cutoffDayName = DAYS[cutoffDay]
  const cutoffTime = `${cutoffHour % 12 || 12}:${minutes.toString().padStart(2, '0')} ${cutoffHour >= 12 ? 'PM' : 'AM'}`
  return `${cutoffDayName} at ${cutoffTime}`
}
