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
  VALID_VEHICLE_TYPES,
  VALID_GENERATOR_TYPES,
  VALID_GENERATOR_FUELS,
  VALID_PERISHABILITY,
} from '../event-readiness-validation'

// Complete valid form data — all 14 fields filled
function validForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

describe('validateEventReadiness', () => {

  // ── Happy path ──────────────────────────────────────────────────
  it('accepts a complete valid form and returns sanitized data', () => {
    const result = validateEventReadiness(validForm())
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.sanitized).toBeDefined()
    expect(result.sanitized!.vehicle_type).toBe('food_truck')
    expect(result.sanitized!.vehicle_length_feet).toBe(22)
    expect(result.sanitized!.generator_type).toBe('quiet_inverter')
    expect(result.sanitized!.generator_fuel).toBe('propane')
    expect(result.sanitized!.odor_description).toBe('Grilling and smoking')
    expect(result.sanitized!.event_experience_description).toBe('3 years of corporate catering')
    expect(result.sanitized!.additional_notes).toBe('We have a 20ft awning for shade')
  })

  // ── Enum constants are correct ──────────────────────────────────
  it('exports correct validation enums', () => {
    expect(VALID_VEHICLE_TYPES).toEqual(['food_truck', 'food_trailer'])
    expect(VALID_GENERATOR_TYPES).toEqual(['quiet_inverter', 'standard'])
    expect(VALID_GENERATOR_FUELS).toEqual(['propane', 'gasoline', 'diesel'])
    expect(VALID_PERISHABILITY).toEqual(['immediate', 'within_15_min', 'can_sit_30_plus'])
  })

  // ── Required field validation errors ────────────────────────────
  it('rejects missing vehicle_type', () => {
    const result = validateEventReadiness(validForm({ vehicle_type: undefined }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle type/)
  })

  it('rejects invalid vehicle_type', () => {
    const result = validateEventReadiness(validForm({ vehicle_type: 'spaceship' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/food_truck or food_trailer/)
  })

  it('rejects vehicle_length below 5 feet', () => {
    const result = validateEventReadiness(validForm({ vehicle_length_feet: 4 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 80/)
  })

  it('rejects vehicle_length above 80 feet', () => {
    const result = validateEventReadiness(validForm({ vehicle_length_feet: 81 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 80/)
  })

  it('rejects non-number vehicle_length', () => {
    const result = validateEventReadiness(validForm({ vehicle_length_feet: 'twenty' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Vehicle length/)
  })

  it('rejects non-boolean requires_generator', () => {
    const result = validateEventReadiness(validForm({ requires_generator: 'yes' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Requires generator/)
  })

  it('rejects missing food_perishability', () => {
    const result = validateEventReadiness(validForm({ food_perishability: undefined }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/perishability/)
  })

  it('rejects invalid food_perishability', () => {
    const result = validateEventReadiness(validForm({ food_perishability: 'forever' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/perishability/)
  })

  it('rejects empty packaging', () => {
    const result = validateEventReadiness(validForm({ packaging: '   ' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Packaging/)
  })

  it('rejects non-boolean utensils_required', () => {
    const result = validateEventReadiness(validForm({ utensils_required: 'no' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Utensils/)
  })

  it('rejects non-boolean seating_recommended', () => {
    const result = validateEventReadiness(validForm({ seating_recommended: 1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Seating/)
  })

  it('rejects headcount below 5', () => {
    const result = validateEventReadiness(validForm({ max_headcount_per_wave: 4 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 500/)
  })

  it('rejects headcount above 500', () => {
    const result = validateEventReadiness(validForm({ max_headcount_per_wave: 501 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 5 and 500/)
  })

  it('rejects non-boolean has_event_experience', () => {
    const result = validateEventReadiness(validForm({ has_event_experience: 'yes' }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Event experience/)
  })

  it('rejects max_runtime_hours below 1', () => {
    const result = validateEventReadiness(validForm({ max_runtime_hours: 0 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 1 and 24/)
  })

  it('rejects max_runtime_hours above 24', () => {
    const result = validateEventReadiness(validForm({ max_runtime_hours: 25 }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/between 1 and 24/)
  })

  // ── Conditional field validation ────────────────────────────────
  it('requires generator_type when requires_generator=true', () => {
    const result = validateEventReadiness(validForm({
      requires_generator: true,
      generator_type: undefined,
    }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Generator type is required/)
  })

  it('requires generator_fuel when requires_generator=true', () => {
    const result = validateEventReadiness(validForm({
      requires_generator: true,
      generator_type: 'standard',
      generator_fuel: undefined,
    }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Generator fuel type is required/)
  })

  it('requires odor_description when strong_odors=true', () => {
    const result = validateEventReadiness(validForm({
      strong_odors: true,
      odor_description: '',
    }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/describe the cooking odors/)
  })

  it('requires event_experience_description when has_event_experience=true', () => {
    const result = validateEventReadiness(validForm({
      has_event_experience: true,
      event_experience_description: '  ',
    }))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/describe your event experience/)
  })

  // ── Conditional fields NOT required when false ──────────────────
  it('does not require generator fields when requires_generator=false', () => {
    const result = validateEventReadiness(validForm({
      requires_generator: false,
      generator_type: undefined,
      generator_fuel: undefined,
    }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.generator_type).toBeUndefined()
    expect(result.sanitized!.generator_fuel).toBeUndefined()
  })

  it('does not require odor_description when strong_odors=false', () => {
    const result = validateEventReadiness(validForm({
      strong_odors: false,
      odor_description: undefined,
    }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.odor_description).toBeUndefined()
  })

  it('does not require experience description when has_event_experience=false', () => {
    const result = validateEventReadiness(validForm({
      has_event_experience: false,
      event_experience_description: undefined,
    }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.event_experience_description).toBeUndefined()
  })

  // ── Sanitization ────────────────────────────────────────────────
  it('trims strings in sanitized output', () => {
    const result = validateEventReadiness(validForm({
      packaging: '  Foil boxes  ',
      odor_description: '  Heavy smoke  ',
      event_experience_description: '  Lots of events  ',
      additional_notes: '  Extra info  ',
    }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.packaging).toBe('Foil boxes')
    expect(result.sanitized!.odor_description).toBe('Heavy smoke')
    expect(result.sanitized!.event_experience_description).toBe('Lots of events')
    expect(result.sanitized!.additional_notes).toBe('Extra info')
  })

  it('rounds numbers in sanitized output', () => {
    const result = validateEventReadiness(validForm({
      vehicle_length_feet: 22.7,
      max_runtime_hours: 6.3,
      max_headcount_per_wave: 42.9,
    }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.vehicle_length_feet).toBe(23)
    expect(result.sanitized!.max_runtime_hours).toBe(6)
    expect(result.sanitized!.max_headcount_per_wave).toBe(43)
  })

  // ── Optional fields ─────────────────────────────────────────────
  it('includes additional_notes when present and non-empty', () => {
    const result = validateEventReadiness(validForm({ additional_notes: 'We have a tent' }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBe('We have a tent')
  })

  it('excludes additional_notes when empty', () => {
    const result = validateEventReadiness(validForm({ additional_notes: '   ' }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBeUndefined()
  })

  it('excludes additional_notes when missing', () => {
    const result = validateEventReadiness(validForm({ additional_notes: undefined }))
    expect(result.valid).toBe(true)
    expect(result.sanitized!.additional_notes).toBeUndefined()
  })
})
