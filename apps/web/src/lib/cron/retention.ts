/**
 * Data Retention Logic — Phase 9
 *
 * Extracted from: src/app/api/cron/expire-orders/route.ts (Phase 9)
 * Purpose: Weekly (Sunday) cleanup of old error logs, read notifications,
 * and activity events to keep tables lean.
 *
 * Pure functions — no DB, no side effects.
 */

/** Days before deletion for each table */
export const DATA_RETENTION_DAYS = {
  error_logs: 90,
  notifications: 60,
  activity_events: 30,
} as const

/** Phase 9 only runs on Sundays (UTC) */
export function isCleanupDay(now?: Date): boolean {
  return (now ?? new Date()).getUTCDay() === 0
}

/** Calculate ISO cutoff dates for each retention table */
export function calculateRetentionCutoffs(now?: Date): {
  error_logs: string
  notifications: string
  activity_events: string
} {
  const ref = now ?? new Date()
  const ms = (days: number) => days * 24 * 60 * 60 * 1000

  return {
    error_logs: new Date(ref.getTime() - ms(DATA_RETENTION_DAYS.error_logs)).toISOString(),
    notifications: new Date(ref.getTime() - ms(DATA_RETENTION_DAYS.notifications)).toISOString(),
    activity_events: new Date(ref.getTime() - ms(DATA_RETENTION_DAYS.activity_events)).toISOString(),
  }
}
