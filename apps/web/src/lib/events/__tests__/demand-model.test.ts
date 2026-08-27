/**
 * EVENT DEMAND MODEL — the owner's 2026-08-26 decisions are the spec.
 *
 *   1. Orders = organizer's expected_meal_count when given; otherwise
 *      headcount × the reviewed rate band (payment model + lunch/not +
 *      ticketed). Competing food noted → the LOW end of the band.
 *   2. Peak wave = average orders per wave × (1 + 25% margin). No more
 *      "half of all orders in one wave".
 *   3. Pool capacity at intake = MEDIAN of vendors' readiness capacity.
 *   4. Selection time: the accepted vendors' real per-event claims vs the peak.
 *   5. The suggestion = max(capacity need, variety need), clamped 1–20.
 *
 * Expected values are computed from those rules, not read from the code.
 */
import { describe, it, expect } from 'vitest'
import {
  BUYER_RATES,
  PEAK_WAVE_MARGIN,
  calculateWaveCount,
  checkAcceptedCapacity,
  estimateOrders,
  expectedPeakOrdersPerWave,
  isLunchStart,
  median,
  resolveDemandProfile,
  suggestVendorCount,
} from '../demand-model'
import { calculateWaveCount as viabilityWaveCount } from '../viability'

describe('Demand model — the single rate table', () => {
  it('carries the owner-reviewed bands from the viability scorer, unchanged', () => {
    expect(BUYER_RATES.company_paid).toEqual({ low: 0.9, high: 1.0, label: '90-100% (company paying)' })
    expect(BUYER_RATES.attendee_paid_lunch).toEqual({ low: 0.6, high: 0.8, label: '60-80% (lunch hour)' })
    expect(BUYER_RATES.attendee_paid_other).toEqual({ low: 0.3, high: 0.5, label: '30-50% (non-lunch)' })
    expect(BUYER_RATES.crowd).toEqual({ low: 0.1, high: 0.3, label: '10-30% (public event)' })
    expect(BUYER_RATES.crowd_ticketed).toEqual({ low: 0.15, high: 0.4, label: '15-40% (ticketed event)' })
  })

  it('the peak margin is one named knob: 25%', () => {
    expect(PEAK_WAVE_MARGIN).toBe(0.25)
  })
})

describe('Demand model — which band applies', () => {
  it('festival / grand opening are crowd events regardless of payment model; ticketed lifts the band', () => {
    expect(resolveDemandProfile({ paymentModel: 'company_paid', eventType: 'festival', startTime: '12:00', isTicketed: false })).toBe('crowd')
    expect(resolveDemandProfile({ paymentModel: null, eventType: 'grand_opening', startTime: null, isTicketed: true })).toBe('crowd_ticketed')
  })

  it('company-paid (explicit, hybrid, or the corporate defaults) is company_paid', () => {
    expect(resolveDemandProfile({ paymentModel: 'company_paid', eventType: 'private_party', startTime: '18:00', isTicketed: false })).toBe('company_paid')
    expect(resolveDemandProfile({ paymentModel: 'hybrid', eventType: 'other', startTime: '18:00', isTicketed: false })).toBe('company_paid')
    expect(resolveDemandProfile({ paymentModel: null, eventType: 'corporate_lunch', startTime: '12:00', isTicketed: false })).toBe('company_paid')
    expect(resolveDemandProfile({ paymentModel: null, eventType: 'team_building', startTime: '15:00', isTicketed: false })).toBe('company_paid')
  })

  it('attendee-paid splits on the lunch hour (11:00–13:59); unknown start assumes lunch', () => {
    expect(isLunchStart('11:00')).toBe(true)
    expect(isLunchStart('13:59')).toBe(true)
    expect(isLunchStart('14:00')).toBe(false)
    expect(isLunchStart(null)).toBe(true)
    expect(resolveDemandProfile({ paymentModel: 'attendee_paid', eventType: 'corporate_lunch', startTime: '12:00', isTicketed: false })).toBe('attendee_paid_lunch')
    expect(resolveDemandProfile({ paymentModel: 'attendee_paid', eventType: 'private_party', startTime: '18:00', isTicketed: false })).toBe('attendee_paid_other')
    expect(resolveDemandProfile({ paymentModel: null, eventType: 'private_party', startTime: '18:00', isTicketed: false })).toBe('attendee_paid_other')
  })
})

describe('Demand model — how many will order', () => {
  const base = { paymentModel: 'company_paid', eventType: 'corporate_lunch', startTime: '12:00', isTicketed: false, hasCompetingFood: false }

  it("the organizer's expected_meal_count wins verbatim when given", () => {
    const d = estimateOrders({ ...base, headcount: 500, expectedMealCount: 120 })
    expect(d.orders).toBe(120)
    expect(d.basis).toBe('organizer')
  })

  it('otherwise headcount × the band midpoint (100 company-paid → 95)', () => {
    const d = estimateOrders({ ...base, headcount: 100, expectedMealCount: null })
    expect(d.orders).toBe(95)
    expect(d.basis).toBe('rate')
    expect(d.usedLowEnd).toBe(false)
  })

  it('competing food pulls the estimate to the LOW end (100 attendee-paid lunch → 60, not 70)', () => {
    const d = estimateOrders({ ...base, paymentModel: 'attendee_paid', headcount: 100, expectedMealCount: null, hasCompetingFood: true })
    expect(d.profile).toBe('attendee_paid_lunch')
    expect(d.orders).toBe(60)
    expect(d.usedLowEnd).toBe(true)
  })

  it('a 500-person public festival expects 100 orders (20% midpoint)', () => {
    const d = estimateOrders({ ...base, paymentModel: null, eventType: 'festival', headcount: 500, expectedMealCount: null })
    expect(d.orders).toBe(100)
  })
})

describe('Demand model — waves and the peak', () => {
  it('counts 30-minute waves; no times → 4; viability re-exports the same function', () => {
    expect(calculateWaveCount('12:00', '13:00')).toBe(2)
    expect(calculateWaveCount('11:00', '14:00')).toBe(6)
    expect(calculateWaveCount('12:00', '12:45')).toBe(2)
    expect(calculateWaveCount(null, null)).toBe(4)
    expect(calculateWaveCount('13:00', '12:00')).toBe(4)
    expect(viabilityWaveCount).toBe(calculateWaveCount)
  })

  it('peak = ceil(average per wave × 1.25) — 95 orders over 2 waves → 60', () => {
    expect(expectedPeakOrdersPerWave(95, 2)).toBe(60)
    expect(expectedPeakOrdersPerWave(100, 4)).toBe(32)
    expect(expectedPeakOrdersPerWave(0, 4)).toBe(0)
  })
})

describe('Demand model — pool capacity is a median', () => {
  it('one optimistic truck cannot skew it', () => {
    expect(median([20, 25, 30, 200])).toBe(27.5)
    expect(median([30])).toBe(30)
    expect(median([])).toBeNull()
  })
})

describe('Demand model — the suggestion', () => {
  it('100-person corporate lunch, 12–1, 3 cuisines, pool 30/wave & 1.5 cuisines/vendor → 2 vendors', () => {
    const demand = estimateOrders({ headcount: 100, expectedMealCount: null, paymentModel: 'company_paid', eventType: 'corporate_lunch', startTime: '12:00', isTicketed: false, hasCompetingFood: false })
    const peak = expectedPeakOrdersPerWave(demand.orders, calculateWaveCount('12:00', '13:00'))
    const s = suggestVendorCount({ peakOrdersPerWave: peak, capacityPerWave: 30, categoryCount: 3, avgCategoriesPerVendor: 1.5 })
    expect(s).toEqual({ suggested: 2, capacityVendors: 2, varietyVendors: 2 })
  })

  it('variety can outrank capacity (5 cuisines, single-cuisine trucks → 5)', () => {
    const s = suggestVendorCount({ peakOrdersPerWave: 20, capacityPerWave: 30, categoryCount: 5, avgCategoriesPerVendor: 1 })
    expect(s.suggested).toBe(5)
  })

  it('clamps to 1–20 and never divides by zero', () => {
    expect(suggestVendorCount({ peakOrdersPerWave: 0, capacityPerWave: 0, categoryCount: 0, avgCategoriesPerVendor: 0 }).suggested).toBe(1)
    expect(suggestVendorCount({ peakOrdersPerWave: 5000, capacityPerWave: 10, categoryCount: 0, avgCategoriesPerVendor: 1 }).suggested).toBe(20)
  })
})

describe('Demand model — selection-time capacity check', () => {
  it('compares the accepted vendors\' claimed capacity to the expected peak', () => {
    expect(checkAcceptedCapacity(60, 75)).toEqual({ ok: true, shortfallPerWave: 0, coveragePct: 125 })
    expect(checkAcceptedCapacity(60, 45)).toEqual({ ok: false, shortfallPerWave: 15, coveragePct: 75 })
    expect(checkAcceptedCapacity(0, 0)).toEqual({ ok: true, shortfallPerWave: 0, coveragePct: 100 })
  })
})
