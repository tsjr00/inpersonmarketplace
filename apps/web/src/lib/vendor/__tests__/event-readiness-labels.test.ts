import { describe, it, expect } from 'vitest'
import {
  eventReadinessRows,
  SETUP_TYPE_OPTIONS,
  PERISHABILITY_OPTIONS,
  QUESTION_LABELS,
} from '../event-readiness-labels'
import {
  VALID_FT_VEHICLE_TYPES,
  VALID_FM_SETUP_TYPES,
  VALID_FT_PERISHABILITY,
  VALID_FM_PERISHABILITY,
} from '../event-readiness-validation'

/**
 * Owner 2026-09-19 (admin UI feedback): an FM vendor's event-readiness
 * answers were read back to the admin through FT wording — "Tent / Booth"
 * displayed as "Food Trailer", "Requires refrigeration" as "Can sit 30+ min",
 * "Max Runtime: undefined hours". The rule: the admin sees the vendor's answer
 * in the words the vendor chose, and only the questions their vertical asks.
 */

const FM_ANSWERS = {
  vehicle_type: 'tent_booth',
  vehicle_length_feet: 10,
  requires_generator: true,
  strong_odors: false,
  food_perishability: 'refrigerated',
  packaging: 'table displays, cooler',
  utensils_required: true,      // FM: can offer samples
  seating_recommended: true,    // FM: needs covered space
  max_headcount_per_wave: 30,   // FM: per HOUR
  has_event_experience: false,
}

const FT_ANSWERS = {
  vehicle_type: 'food_trailer',
  vehicle_length_feet: 24,
  requires_generator: true,
  generator_type: 'quiet_inverter',
  generator_fuel: 'propane',
  max_runtime_hours: 8,
  strong_odors: true,
  odor_description: 'frying',
  food_perishability: 'can_sit_30_plus',
  packaging: 'boxes',
  utensils_required: false,
  seating_recommended: false,
  max_headcount_per_wave: 50,
  has_event_experience: true,
  event_experience_description: 'weddings',
  additional_notes: 'none',
}

const byLabel = (rows: Array<{ label: string; value: string }>) =>
  Object.fromEntries(rows.map(r => [r.label, r.value]))

describe('eventReadinessRows — FM vendor', () => {
  const rows = byLabel(eventReadinessRows(FM_ANSWERS, 'farmers_market'))

  it('shows the FM setup type the vendor chose, under the FM question', () => {
    expect(rows['Setup Type']).toBe('Tent / Booth')
    expect(rows['Vehicle Type']).toBeUndefined()
  })

  it('shows storage needs in FM words (not the FT perishability ladder)', () => {
    expect(rows['Product Storage Needs']).toBe('Requires refrigeration or ice (dairy, meat, produce)')
    expect(Object.values(rows)).not.toContain('Can sit 30+ minutes (packaged or wrapped items)')
  })

  it('reads the shared booleans with FM meaning', () => {
    expect(rows['Do You Need Access to Electrical Power?']).toBe('Yes')
    expect(rows['Can You Offer Product Samples at Events?']).toBe('Yes — I can provide samples or tastings')
    expect(rows['Outdoor Event Suitability']).toBe('Needs covered / indoor space — products are weather-sensitive')
  })

  it('reports headcount per hour and never shows FT-only questions', () => {
    expect(rows['How Many Customers Can You Serve Per Hour?']).toBe('30 customers / hour')
    expect(rows['Space Needed (feet wide)']).toBe('10 feet')
    for (const ftOnly of ['Generator Type', 'Generator Fuel', 'Max Runtime Without External Power (hours)']) {
      expect(rows[ftOnly]).toBeUndefined()
    }
    expect(Object.values(rows).join(' ')).not.toMatch(/undefined/)
  })
})

describe('eventReadinessRows — FT vendor', () => {
  const rows = byLabel(eventReadinessRows(FT_ANSWERS, 'food_trucks'))

  it('keeps the FT wording and generator detail', () => {
    expect(rows['Vehicle Type']).toBe('Food Trailer (truck + trailer)')
    expect(rows['Generator Type']).toBe('Quiet / Inverter Generator')
    expect(rows['Generator Fuel']).toBe('Propane (minimal smell)')
    expect(rows['Max Runtime Without External Power (hours)']).toBe('8 hours')
    expect(rows['Max Headcount Per 30-Minute Wave']).toBe('50 people / 30 min')
    expect(rows['Does Your Cooking Produce Strong Odors?']).toBe('Yes — frying')
    expect(rows['Do You Have Event or Catering Experience?']).toBe('Yes — weddings')
    expect(rows['Anything Else About Your Event Capabilities?']).toBe('none')
  })

  it('hides generator detail when no generator is needed', () => {
    const noGen = byLabel(eventReadinessRows({ ...FT_ANSWERS, requires_generator: false }, 'food_trucks'))
    expect(noGen['Generator Type']).toBeUndefined()
    expect(noGen['Generator Fuel']).toBeUndefined()
  })
})

describe('label map ↔ validator agree on the option sets', () => {
  it('offers exactly the values the validator accepts', () => {
    expect(SETUP_TYPE_OPTIONS.food_trucks.map(o => o.value)).toEqual(VALID_FT_VEHICLE_TYPES)
    expect(SETUP_TYPE_OPTIONS.farmers_market.map(o => o.value)).toEqual(VALID_FM_SETUP_TYPES)
    expect(PERISHABILITY_OPTIONS.food_trucks.map(o => o.value)).toEqual(VALID_FT_PERISHABILITY)
    expect(PERISHABILITY_OPTIONS.farmers_market.map(o => o.value)).toEqual(VALID_FM_PERISHABILITY)
  })

  it('FM asks no FT-only questions', () => {
    for (const key of ['generator_type', 'generator_fuel', 'max_runtime_hours']) {
      expect(QUESTION_LABELS.farmers_market[key]).toBeUndefined()
      expect(QUESTION_LABELS.food_trucks[key]).toBeDefined()
    }
  })
})
