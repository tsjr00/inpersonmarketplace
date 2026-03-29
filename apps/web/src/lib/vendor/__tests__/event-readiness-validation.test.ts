/**
 * Event Readiness Validation Tests
 *
 * POC: Proves the "extract route logic → test independently" pattern.
 * These tests run against pure functions extracted from
 * src/app/api/vendor/event-readiness/route.ts — no HTTP server,
 * no DB, no auth needed.
 *
 * Run: npx vitest run src/lib/vendor/__tests__/event-readiness-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  validateEventReadiness,
  VALID_FT_VEHICLE_TYPES,
  VALID_FM_SETUP_TYPES,
  VALID_GENERATOR_TYPES,
  VALID_GENERATOR_FUELS,
  VALID_FT_PERISHABILITY,
  VALID_FM_PERISHABILITY,
} from '../event-readiness-validation'

// Complete valid FT form data
function validFTForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vehicle_type: 'food_truck',
    vehicle_length_feet: 22,
    requires_generator: true,
    generator_type: 'quiet_inverter',
    generator_fuel: 'propane',
    max_runtime_hours: 8,
    strong_odors: true,
    odor_description: 'Grilling and smoking',
    food_perishability: 'within_15_min',
    packaging: 'Foil-lined boxes',
    utensils_required: true,
    seating_recommended: false,
    max_headcount_per_wave: 50,
    has_event_experience: true,
    event_experience_description: '3 years of corporate catering',
    additional_notes: 'We have a 20ft awning for shade',
    ...overrides,
  }
}

// Complete valid FM form data
function validFMForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vehicle_type: 'tent_booth',
    vehicle_length_feet: 10,
    requires_generator: false,
    strong_odors: false,
    food_perishability: 'shelf_stable',
    packaging: 'Table displays with baskets',
    utensils_required: false,
    seating_recommended: false,
    max_headcount_per_wave: 30,
    has_event_experience: true,
    event_experience_description: 'Holiday markets and community festivals',
    ...overrides,
  }
}

describe('validateEventReadiness — Food Trucks', () => {

  // ── Happy path ──────────────────────────────────────────────────
  it('accepts a complete valid FT form and returns sanitized data', () => {
    const result = validateEventReadiness(validFTForm(), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.sanitized).toBeDefined()
    expect(result.sanitized!.vehicle_type).toBe('food_truck')
    expect(result.sanitized!.vehicle_length_feet).toBe(22)
    expect(result.sanitized!.generator_type).toBe('quiet_inverter')
    expect(result.sanitized!.generator_fuel).toBe('propane')
    expect(result.sanitized!.max_runtime_hours).toBe(8)
    expect(result.sanitized!.odor_description).toBe('Grilling and smoking')
    expect(result.sanitized!.event_experience_description).toBe('3 years of corporate catering')
    expect(result.sanitized!.additional_notes).toBe('We have a 20ft awning for shade')
  })

  // ── Enum constants are correct ──────────────────────────────────
  it('exports correct validation enums', () => {
    expect(VALID_FT_VEHICLE_TYPES).toEqual(['food_truck', 'food_trailer'])
    expect(VALID_FM_SETUP_TYPES).toEqual(['tent_booth', 'table_only', 'trailer', 'vehicle_booth'])
    expect(VALID_GENERATOR_TYPES).toEqual(['quiet_inverter', 'standard'])
    expect(VALID_GENERATOR_FUELS).toEqual(['propane', 'gasoline', 'diesel'])
    expect(VALID_FT_PERISHABILITY).toEqual(['immediate', 'within_15_min', 'can_sit_30_plus'])
    expect(VALID_FM_PERISHABILITY).toEqual(['refrigerated', 'shade_required', 'shelf_stable'])
  })

  // ── Required field validation errors ────────────────────────────
  it('rejects missing vehicle_type', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_type: undefined }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle type/)
  })

  it('rejects invalid vehicle_type', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_type: 'spaceship' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle type/)
  })

  it('rejects FM setup types for FT vertical', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_type: 'tent_booth' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle type/)
  })

  it('rejects vehicle_length below 5 feet', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_length_feet: 4 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 80/)
  })

  it('rejects vehicle_length above 80 feet', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_length_feet: 81 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 80/)
  })

  it('rejects non-number vehicle_length', () => {
    const result = validateEventReadiness(validFTForm({ vehicle_length_feet: 'twenty' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle length/)
  })

  it('rejects non-boolean requires_generator', () => {
    const result = validateEventReadiness(validFTForm({ requires_generator: 'yes' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/generator/)
  })

  it('rejects missing food_perishability', () => {
    const result = validateEventReadiness(validFTForm({ food_perishability: undefined }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/perishability/)
  })

  it('rejects invalid food_perishability', () => {
    const result = validateEventReadiness(validFTForm({ food_perishability: 'forever' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/perishability/)
  })

  it('rejects FM perishability values for FT vertical', () => {
    const result = validateEventReadiness(validFTForm({ food_perishability: 'shelf_stable' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/perishability/)
  })

  it('rejects empty packaging', () => {
    const result = validateEventReadiness(validFTForm({ packaging: '   ' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Packaging/)
  })

  it('rejects non-boolean utensils_required', () => {
    const result = validateEventReadiness(validFTForm({ utensils_required: 'no' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Utensils/)
  })

  it('rejects non-boolean seating_recommended', () => {
    const result = validateEventReadiness(validFTForm({ seating_recommended: 1 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Seating/)
  })

  it('rejects headcount below 5', () => {
    const result = validateEventReadiness(validFTForm({ max_headcount_per_wave: 4 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 500/)
  })

  it('rejects headcount above 500', () => {
    const result = validateEventReadiness(validFTForm({ max_headcount_per_wave: 501 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 500/)
  })

  it('rejects non-boolean has_event_experience', () => {
    const result = validateEventReadiness(validFTForm({ has_event_experience: 'yes' }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Event experience/)
  })

  it('rejects max_runtime_hours below 1', () => {
    const result = validateEventReadiness(validFTForm({ max_runtime_hours: 0 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 1 and 24/)
  })

  it('rejects max_runtime_hours above 24', () => {
    const result = validateEventReadiness(validFTForm({ max_runtime_hours: 25 }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 1 and 24/)
  })

  // ── Conditional field validation ────────────────────────────────
  it('requires generator_type when requires_generator=true', () => {
    const result = validateEventReadiness(validFTForm({
      requires_generator: true,
      generator_type: undefined,
    }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Generator type is required/)
  })

  it('requires generator_fuel when requires_generator=true', () => {
    const result = validateEventReadiness(validFTForm({
      requires_generator: true,
      generator_type: 'standard',
      generator_fuel: undefined,
    }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Generator fuel type is required/)
  })

  it('requires odor_description when strong_odors=true', () => {
    const result = validateEventReadiness(validFTForm({
      strong_odors: true,
      odor_description: '',
    }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/describe the odors/)
  })

  it('requires event_experience_description when has_event_experience=true', () => {
    const result = validateEventReadiness(validFTForm({
      has_event_experience: true,
      event_experience_description: '  ',
    }), 'food_trucks')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/describe your event experience/)
  })

  // ── Conditional fields NOT required when false ──────────────────
  it('does not require generator fields when requires_generator=false', () => {
    const result = validateEventReadiness(validFTForm({
      requires_generator: false,
      generator_type: undefined,
      generator_fuel: undefined,
    }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.generator_type).toBeUndefined()
    expect(result.sanitized!.generator_fuel).toBeUndefined()
  })

  it('does not require odor_description when strong_odors=false', () => {
    const result = validateEventReadiness(validFTForm({
      strong_odors: false,
      odor_description: undefined,
    }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.odor_description).toBeUndefined()
  })

  it('does not require experience description when has_event_experience=false', () => {
    const result = validateEventReadiness(validFTForm({
      has_event_experience: false,
      event_experience_description: undefined,
    }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.event_experience_description).toBeUndefined()
  })

  // ── Sanitization ────────────────────────────────────────────────
  it('trims strings in sanitized output', () => {
    const result = validateEventReadiness(validFTForm({
      packaging: '  Foil boxes  ',
      odor_description: '  Heavy smoke  ',
      event_experience_description: '  Lots of events  ',
      additional_notes: '  Extra info  ',
    }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.packaging).toBe('Foil boxes')
    expect(result.sanitized!.odor_description).toBe('Heavy smoke')
    expect(result.sanitized!.event_experience_description).toBe('Lots of events')
    expect(result.sanitized!.additional_notes).toBe('Extra info')
  })

  it('rounds numbers in sanitized output', () => {
    const result = validateEventReadiness(validFTForm({
      vehicle_length_feet: 22.7,
      max_runtime_hours: 6.3,
      max_headcount_per_wave: 42.9,
    }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.vehicle_length_feet).toBe(23)
    expect(result.sanitized!.max_runtime_hours).toBe(6)
    expect(result.sanitized!.max_headcount_per_wave).toBe(43)
  })

  // ── Optional fields ─────────────────────────────────────────────
  it('includes additional_notes when present and non-empty', () => {
    const result = validateEventReadiness(validFTForm({ additional_notes: 'We have a tent' }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBe('We have a tent')
  })

  it('excludes additional_notes when empty', () => {
    const result = validateEventReadiness(validFTForm({ additional_notes: '   ' }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBeUndefined()
  })

  it('excludes additional_notes when missing', () => {
    const result = validateEventReadiness(validFTForm({ additional_notes: undefined }), 'food_trucks')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBeUndefined()
  })
})

describe('validateEventReadiness — Farmers Market', () => {

  // ── Happy path ──────────────────────────────────────────────────
  it('accepts a complete valid FM form', () => {
    const result = validateEventReadiness(validFMForm(), 'farmers_market')
    expect(result.valid).toBe(true)
    expect(result.sanitized).toBeDefined()
    expect(result.sanitized!.vehicle_type).toBe('tent_booth')
    expect(result.sanitized!.vehicle_length_feet).toBe(10)
    expect(result.sanitized!.food_perishability).toBe('shelf_stable')
  })

  it('accepts all FM setup types', () => {
    for (const setupType of VALID_FM_SETUP_TYPES) {
      const result = validateEventReadiness(validFMForm({ vehicle_type: setupType }), 'farmers_market')
      expect(result.valid).toBe(true)
    }
  })

  it('accepts all FM perishability values', () => {
    for (const val of VALID_FM_PERISHABILITY) {
      const result = validateEventReadiness(validFMForm({ food_perishability: val }), 'farmers_market')
      expect(result.valid).toBe(true)
    }
  })

  // ── FM-specific validation ──────────────────────────────────────
  it('rejects FT vehicle types for FM vertical', () => {
    const result = validateEventReadiness(validFMForm({ vehicle_type: 'food_truck' }), 'farmers_market')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Setup type/)
  })

  it('rejects FT perishability values for FM vertical', () => {
    const result = validateEventReadiness(validFMForm({ food_perishability: 'within_15_min' }), 'farmers_market')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/storage needs/)
  })

  it('accepts FM space width range (4-40 feet)', () => {
    const result4 = validateEventReadiness(validFMForm({ vehicle_length_feet: 4 }), 'farmers_market')
    expect(result4.valid).toBe(true)
    const result40 = validateEventReadiness(validFMForm({ vehicle_length_feet: 40 }), 'farmers_market')
    expect(result40.valid).toBe(true)
  })

  it('rejects FM space width below 4 feet', () => {
    const result = validateEventReadiness(validFMForm({ vehicle_length_feet: 3 }), 'farmers_market')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 4 and 40/)
  })

  it('rejects FM space width above 40 feet', () => {
    const result = validateEventReadiness(validFMForm({ vehicle_length_feet: 41 }), 'farmers_market')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 4 and 40/)
  })

  // ── FM does NOT require FT-only fields ──────────────────────────
  it('does not require max_runtime_hours for FM', () => {
    const result = validateEventReadiness(validFMForm(), 'farmers_market')
    expect(result.valid).toBe(true)
    expect(result.sanitized!.max_runtime_hours).toBeUndefined()
  })

  it('does not require generator details for FM even when power needed', () => {
    const result = validateEventReadiness(validFMForm({ requires_generator: true }), 'farmers_market')
    expect(result.valid).toBe(true)
    // FM's requires_generator means "needs power access", not generator details
    expect(result.sanitized!.generator_type).toBeUndefined()
    expect(result.sanitized!.generator_fuel).toBeUndefined()
  })
})
