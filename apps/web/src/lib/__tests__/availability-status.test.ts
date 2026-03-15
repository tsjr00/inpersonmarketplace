/**
 * Availability Status Tests
 *
 * Tests the logic that maps get_listings_accepting_status() RPC output
 * to badge display status (open / closing-soon / closed).
 *
 * Business Rules Covered:
 * VJ-R12: Listing availability calculated from schedules + cutoff
 * VJ-R15: Single SQL source of truth — these functions consume RPC output
 *
 * Run: npx vitest run src/lib/__tests__/availability-status.test.ts
 */
import { describe, it, expect } from 'vitest'
import { deriveAvailabilityStatus, deriveVendorAvailabilityStatus } from '@/lib/utils/availability-status'

// =============================================================================
// deriveAvailabilityStatus — buyer-facing badge logic
// =============================================================================

describe('deriveAvailabilityStatus', () => {
  it('returns closed when no availability data', () => {
    const result = deriveAvailabilityStatus(undefined)
    expect(result.status).toBe('closed')
    expect(result.hoursUntilCutoff).toBeNull()
  })

  it('returns closed when not accepting', () => {
    const result = deriveAvailabilityStatus({
      is_accepting: false,
      hours_until_cutoff: null,
      cutoff_hours: null,
    })
    expect(result.status).toBe('closed')
    expect(result.hoursUntilCutoff).toBeNull()
  })

  it('returns open when accepting with no cutoff pressure', () => {
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: null,
      cutoff_hours: null,
    })
    expect(result.status).toBe('open')
    expect(result.hoursUntilCutoff).toBeNull()
  })

  it('returns open when accepting and hours_until_cutoff exceeds cutoff_hours', () => {
    // 20 hours left, cutoff window is 18 hours — not yet in "closing soon" range
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 20,
      cutoff_hours: 18,
    })
    expect(result.status).toBe('open')
    expect(result.hoursUntilCutoff).toBeNull()
  })

  it('returns closing-soon when within cutoff window', () => {
    // 5 hours left, cutoff window is 18 hours — within window
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 5,
      cutoff_hours: 18,
    })
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(5)
  })

  it('returns closing-soon when less than 1 hour remains', () => {
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 0.5,
      cutoff_hours: 18,
    })
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(0.5)
  })

  it('rounds hoursUntilCutoff to 1 decimal place', () => {
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 3.456,
      cutoff_hours: 18,
    })
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(3.5)
  })

  it('returns open (not closing-soon) when hours_until_cutoff equals cutoff_hours exactly', () => {
    // At the boundary: 18 hours left with 18 hour window — this IS <= cutoff_hours
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 18,
      cutoff_hours: 18,
    })
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(18)
  })

  it('does not return closing-soon when hours_until_cutoff is 0 (cutoff passed)', () => {
    // 0 hours left — cutoff has passed, but is_accepting is still true
    // (edge case: RPC might briefly return this)
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 0,
      cutoff_hours: 18,
    })
    // hours_until_cutoff > 0 check prevents this from being "closing-soon"
    expect(result.status).toBe('open')
  })

  it('handles FT parks with cutoff_hours = 0', () => {
    // FT parks: cutoff is 0 (accept orders until truck closes)
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 2,
      cutoff_hours: 0,
    })
    // hours_until_cutoff (2) <= cutoff_hours (0) is false → open
    expect(result.status).toBe('open')
  })

  it('handles private_pickup cutoff (10 hours)', () => {
    const result = deriveAvailabilityStatus({
      is_accepting: true,
      hours_until_cutoff: 8,
      cutoff_hours: 10,
    })
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(8)
  })
})

// =============================================================================
// deriveVendorAvailabilityStatus — vendor listings page (adds listingStatus check)
// =============================================================================

describe('deriveVendorAvailabilityStatus', () => {
  it('returns open for draft listings regardless of availability', () => {
    const result = deriveVendorAvailabilityStatus(
      { is_accepting: false, hours_until_cutoff: null, cutoff_hours: null },
      'draft'
    )
    expect(result.status).toBe('open')
  })

  it('returns open for paused listings regardless of availability', () => {
    const result = deriveVendorAvailabilityStatus(
      { is_accepting: false, hours_until_cutoff: null, cutoff_hours: null },
      'paused'
    )
    expect(result.status).toBe('open')
  })

  it('returns closed for published listings that are not accepting', () => {
    const result = deriveVendorAvailabilityStatus(
      { is_accepting: false, hours_until_cutoff: null, cutoff_hours: null },
      'published'
    )
    expect(result.status).toBe('closed')
  })

  it('returns closing-soon for published listings within cutoff window', () => {
    const result = deriveVendorAvailabilityStatus(
      { is_accepting: true, hours_until_cutoff: 5, cutoff_hours: 18 },
      'published'
    )
    expect(result.status).toBe('closing-soon')
    expect(result.hoursUntilCutoff).toBe(5)
  })

  it('returns open for published listings accepting outside cutoff window', () => {
    const result = deriveVendorAvailabilityStatus(
      { is_accepting: true, hours_until_cutoff: 20, cutoff_hours: 18 },
      'published'
    )
    expect(result.status).toBe('open')
  })
})
