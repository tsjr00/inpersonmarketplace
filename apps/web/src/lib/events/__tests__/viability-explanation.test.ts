/**
 * VIABILITY EXPLANATION MUST MATCH THE ARITHMETIC
 *
 * T-07, owner 2026-08-11: the admin's Viability Assessment contradicted itself
 * inside one box — "~50 orders/vendor estimated (125 visitors × 10-30% (public
 * event) = 13-38 orders)". The headline used the organizer's expected buyer
 * count; the parenthetical beside it derived a range from headcount × rate,
 * which never entered the calculation.
 *
 * The numbers were right. The sentence explaining them described a different
 * calculation — which is worse than being wrong, because it teaches an admin to
 * distrust the whole box. These tests assert the explanation names the input
 * that actually produced the figure.
 */
import { describe, it, expect } from 'vitest'
import { calculateViability, type EventScoreInput } from '../viability'

const base: EventScoreInput = {
  event_type: 'festival',
  payment_model: 'attendee_paid',
  total_food_budget_cents: null,
  per_meal_budget_cents: null,
  expected_meal_count: null,
  headcount: 125,
  vendor_count: 3,
  event_start_time: '11:00',
  event_end_time: '15:00',
  is_recurring: false,
  is_ticketed: false,
  competing_food_options: null,
  estimated_dwell_hours: 1.5,
}

const capacityDetail = (input: EventScoreInput) => calculateViability(input).capacity.detail

describe('viability capacity explanation', () => {
  it('names the ORGANIZER figure when the organizer supplied one', () => {
    // The reported case: 150 expected buyers / 3 trucks = ~50 per vendor.
    const detail = capacityDetail({ ...base, expected_meal_count: 150 })
    expect(detail).toContain('organizer expects 150 buyers')
    expect(detail, 'must show the division that produced the headline').toContain('3 trucks')
  })

  it('does NOT quote a headcount-derived range it did not use', () => {
    // The exact contradiction: a 13-38 range printed beside a ~50 headline.
    const detail = capacityDetail({ ...base, expected_meal_count: 150 })
    expect(detail, 'the unused headcount range must not appear').not.toMatch(/\d+-\d+ orders/)
    expect(detail).not.toContain('125')
  })

  it('falls back to the headcount calculation when no figure was given', () => {
    // headcount must be large enough to reach the 'viable' branch — only that
    // branch carries an explanation at all. At 125 guests this scores ~8
    // orders/vendor and returns the bare "may not be worth vendors' time"
    // string, which has never included a basis. See the note below.
    const detail = capacityDetail({ ...base, headcount: 400, expected_meal_count: null })
    expect(detail).toContain('400')
    expect(detail, 'the range is legitimate here — it IS the calculation').toMatch(/\d+-\d+ orders/)
    expect(detail, 'and the per-vendor division must be shown').toContain('3 trucks')
  })

  it('the low-volume branch still explains nothing — known gap, not this fix', () => {
    // Documented rather than silently accepted: an admin looking at a red
    // capacity score sees "~8 orders/vendor" with no indication of where 8 came
    // from. Pre-existing on both scorers, out of scope for T-07 (which was
    // about an explanation that CONTRADICTED its headline). Backlogged.
    const detail = capacityDetail({ ...base, expected_meal_count: null })
    expect(detail).toContain('orders/vendor')
    expect(detail).not.toMatch(/\d+-\d+ orders/)
  })

  it('says "truck" not "trucks" for a single-vendor event', () => {
    const detail = capacityDetail({ ...base, vendor_count: 1, expected_meal_count: 40 })
    expect(detail).toContain('1 truck')
    expect(detail).not.toContain('1 trucks')
  })

  it('the headline figure itself is unchanged by this fix', () => {
    // The maths was never wrong. 150 / 3 = 50.
    expect(capacityDetail({ ...base, expected_meal_count: 150 })).toContain('~50 orders/vendor')
  })
})
