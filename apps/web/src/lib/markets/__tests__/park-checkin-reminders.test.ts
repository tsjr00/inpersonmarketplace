import { describe, it, expect } from 'vitest'
import {
  checkinReminderWindow,
  PARK_CHECKIN_PRECLOSE_OFFSET_MIN,
} from '@/lib/markets/park-checkin-reminders'

// Helper: minutes-since-midnight for HH:MM.
const min = (h: number, m = 0) => h * 60 + m

describe('checkinReminderWindow', () => {
  // A normal 10:00–20:00 park day. open=10, mid=15, close=19 (20:00 - 1h).
  const start = min(10)
  const end = min(20)

  it('fires "open" at the start hour', () => {
    expect(checkinReminderWindow(start, end, 10)).toBe('open')
  })

  it('fires "midday" at the midpoint hour', () => {
    expect(checkinReminderWindow(start, end, 15)).toBe('midday')
  })

  it('fires "close" one hour before end', () => {
    expect(PARK_CHECKIN_PRECLOSE_OFFSET_MIN).toBe(60)
    expect(checkinReminderWindow(start, end, 19)).toBe('close')
  })

  it('returns null outside the three windows', () => {
    expect(checkinReminderWindow(start, end, 9)).toBeNull()
    expect(checkinReminderWindow(start, end, 12)).toBeNull()
    expect(checkinReminderWindow(start, end, 21)).toBeNull()
  })

  it('returns null for missing/invalid hours', () => {
    expect(checkinReminderWindow(null, end, 10)).toBeNull()
    expect(checkinReminderWindow(start, null, 10)).toBeNull()
    expect(checkinReminderWindow(min(18), min(10), 12)).toBeNull() // end <= start
  })

  it('collapses gracefully on a short day — earlier window wins the shared hour', () => {
    // 11:00–12:00: open=11, mid=11, close=11 (max(start, end-60)=11). All same hour.
    expect(checkinReminderWindow(min(11), min(12), 11)).toBe('open')
    expect(checkinReminderWindow(min(11), min(12), 12)).toBeNull()
  })
})
