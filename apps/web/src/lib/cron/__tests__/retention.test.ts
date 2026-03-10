/**
 * Data Retention Tests (Phase 9)
 *
 * Tests pure functions extracted from cron expire-orders Phase 9.
 * Covers: IR-R11 (data retention), IR-R22 (log cleanup)
 *
 * Run: npx vitest run src/lib/cron/__tests__/retention.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  DATA_RETENTION_DAYS,
  isCleanupDay,
  calculateRetentionCutoffs,
} from '../retention'

describe('Data Retention — Phase 9', () => {
  // ── Constants ──────────────────────────────────────────────────
  it('retention days: error_logs=90, notifications=60, activity_events=30', () => {
    expect(DATA_RETENTION_DAYS.error_logs).toBe(90)
    expect(DATA_RETENTION_DAYS.notifications).toBe(60)
    expect(DATA_RETENTION_DAYS.activity_events).toBe(30)
  })

  // ── isCleanupDay ───────────────────────────────────────────────
  it('Sunday (UTC day 0) is a cleanup day', () => {
    // 2026-03-08 is a Sunday
    expect(isCleanupDay(new Date('2026-03-08T12:00:00Z'))).toBe(true)
  })

  it('Monday (UTC day 1) is NOT a cleanup day', () => {
    expect(isCleanupDay(new Date('2026-03-09T12:00:00Z'))).toBe(false)
  })

  it('Saturday (UTC day 6) is NOT a cleanup day', () => {
    expect(isCleanupDay(new Date('2026-03-07T12:00:00Z'))).toBe(false)
  })

  it('Friday (UTC day 5) is NOT a cleanup day', () => {
    expect(isCleanupDay(new Date('2026-03-06T12:00:00Z'))).toBe(false)
  })

  // ── calculateRetentionCutoffs ──────────────────────────────────
  it('cutoffs are valid ISO date strings', () => {
    const cutoffs = calculateRetentionCutoffs(new Date('2026-03-08T00:00:00Z'))
    expect(cutoffs.error_logs).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(cutoffs.notifications).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(cutoffs.activity_events).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('error_logs cutoff is 90 days before reference date', () => {
    const ref = new Date('2026-06-01T00:00:00Z')
    const cutoffs = calculateRetentionCutoffs(ref)
    const cutoff = new Date(cutoffs.error_logs)
    const diffDays = Math.round((ref.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000))
    expect(diffDays).toBe(90)
  })

  it('notifications cutoff is 60 days before reference date', () => {
    const ref = new Date('2026-06-01T00:00:00Z')
    const cutoffs = calculateRetentionCutoffs(ref)
    const cutoff = new Date(cutoffs.notifications)
    const diffDays = Math.round((ref.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000))
    expect(diffDays).toBe(60)
  })

  it('activity_events cutoff is 30 days before reference date', () => {
    const ref = new Date('2026-06-01T00:00:00Z')
    const cutoffs = calculateRetentionCutoffs(ref)
    const cutoff = new Date(cutoffs.activity_events)
    const diffDays = Math.round((ref.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000))
    expect(diffDays).toBe(30)
  })
})
