/**
 * Event Readiness Validation
 *
 * Extracted from: src/app/api/vendor/event-readiness/route.ts
 * Purpose: Validate and sanitize the event readiness questionnaire
 * that vendors fill out to apply for private event approval.
 *
 * Vertical-aware: FT vendors have vehicle fields, FM vendors have booth fields.
 *
 * This is a pure function — no DB, no auth, no side effects.
 * Testable without HTTP server or Supabase connection.
 */

export interface EventReadinessData {
  vehicle_type: string
  vehicle_length_feet: number
  requires_generator: boolean
  generator_type?: 'quiet_inverter' | 'standard'
  generator_fuel?: 'propane' | 'gasoline' | 'diesel'
  max_runtime_hours?: number
  strong_odors: boolean
  odor_description?: string
  food_perishability: string
  packaging: string
  utensils_required: boolean
  seating_recommended: boolean
  max_headcount_per_wave: number
  has_event_experience: boolean
  event_experience_description?: string
  additional_notes?: string
}

export const VALID_FT_VEHICLE_TYPES = ['food_truck', 'food_trailer']
export const VALID_FM_SETUP_TYPES = ['tent_booth', 'table_only', 'trailer', 'vehicle_booth']
export const VALID_GENERATOR_TYPES = ['quiet_inverter', 'standard']
export const VALID_GENERATOR_FUELS = ['propane', 'gasoline', 'diesel']
export const VALID_FT_PERISHABILITY = ['immediate', 'within_15_min', 'can_sit_30_plus']
export const VALID_FM_PERISHABILITY = ['refrigerated', 'shade_required', 'shelf_stable']

export function validateEventReadiness(data: Record<string, unknown>, vertical?: string): { valid: boolean; error?: string; sanitized?: EventReadinessData } {
  const isFT = vertical === 'food_trucks'
  const validSetupTypes = isFT ? VALID_FT_VEHICLE_TYPES : VALID_FM_SETUP_TYPES
  const validPerishability = isFT ? VALID_FT_PERISHABILITY : VALID_FM_PERISHABILITY
  const setupLabel = isFT ? 'Vehicle type' : 'Setup type'
  const minLength = isFT ? 5 : 4
  const maxLength = isFT ? 80 : 40
  const lengthLabel = isFT ? 'Vehicle length' : 'Space width'

  // Setup type
  if (!data.vehicle_type || !validSetupTypes.includes(data.vehicle_type as string)) {
    return { valid: false, error: `${setupLabel} is required (${validSetupTypes.join(', ')})` }
  }
  if (typeof data.vehicle_length_feet !== 'number' || data.vehicle_length_feet < minLength || data.vehicle_length_feet > maxLength) {
    return { valid: false, error: `${lengthLabel} must be a number between ${minLength} and ${maxLength} feet` }
  }
  if (typeof data.requires_generator !== 'boolean') {
    return { valid: false, error: isFT ? 'Requires generator must be yes or no' : 'Power needed must be yes or no' }
  }

  // FT-only: generator details + max runtime
  if (isFT) {
    if (data.requires_generator) {
      if (!data.generator_type || !VALID_GENERATOR_TYPES.includes(data.generator_type as string)) {
        return { valid: false, error: 'Generator type is required when generator is needed' }
      }
      if (!data.generator_fuel || !VALID_GENERATOR_FUELS.includes(data.generator_fuel as string)) {
        return { valid: false, error: 'Generator fuel type is required when generator is needed' }
      }
    }
    if (typeof data.max_runtime_hours !== 'number' || data.max_runtime_hours < 1 || data.max_runtime_hours > 24) {
      return { valid: false, error: 'Max runtime must be a number between 1 and 24 hours' }
    }
  }

  // Product / Food Characteristics
  if (typeof data.strong_odors !== 'boolean') {
    return { valid: false, error: 'Strong odors must be yes or no' }
  }
  if (data.strong_odors && (!data.odor_description || (data.odor_description as string).trim() === '')) {
    return { valid: false, error: 'Please describe the odors when strong odors is selected' }
  }
  if (!data.food_perishability || !validPerishability.includes(data.food_perishability as string)) {
    return { valid: false, error: `${isFT ? 'Food perishability' : 'Product storage needs'} selection is required` }
  }
  if (!data.packaging || (data.packaging as string).trim() === '') {
    return { valid: false, error: `${isFT ? 'Packaging description' : 'Product display setup'} is required` }
  }
  if (typeof data.utensils_required !== 'boolean') {
    return { valid: false, error: isFT ? 'Utensils required must be yes or no' : 'Samples available must be yes or no' }
  }
  if (typeof data.seating_recommended !== 'boolean') {
    return { valid: false, error: isFT ? 'Seating recommended must be yes or no' : 'Outdoor suitability must be selected' }
  }

  // Capacity & Experience
  if (typeof data.max_headcount_per_wave !== 'number' || data.max_headcount_per_wave < 5 || data.max_headcount_per_wave > 500) {
    return { valid: false, error: 'Max headcount per wave must be a number between 5 and 500' }
  }
  if (typeof data.has_event_experience !== 'boolean') {
    return { valid: false, error: 'Event experience must be yes or no' }
  }
  if (data.has_event_experience && (!data.event_experience_description || (data.event_experience_description as string).trim() === '')) {
    return { valid: false, error: 'Please describe your event experience' }
  }

  const sanitized: EventReadinessData = {
    vehicle_type: data.vehicle_type as string,
    vehicle_length_feet: Math.round(data.vehicle_length_feet as number),
    requires_generator: data.requires_generator as boolean,
    strong_odors: data.strong_odors as boolean,
    food_perishability: data.food_perishability as string,
    packaging: (data.packaging as string).trim(),
    utensils_required: data.utensils_required as boolean,
    seating_recommended: data.seating_recommended as boolean,
    max_headcount_per_wave: Math.round(data.max_headcount_per_wave as number),
    has_event_experience: data.has_event_experience as boolean,
  }

  // FT-only fields
  if (isFT) {
    sanitized.max_runtime_hours = Math.round(data.max_runtime_hours as number)
    if (data.requires_generator) {
      sanitized.generator_type = data.generator_type as EventReadinessData['generator_type']
      sanitized.generator_fuel = data.generator_fuel as EventReadinessData['generator_fuel']
    }
  }

  // Conditional fields
  if (data.strong_odors && data.odor_description) {
    sanitized.odor_description = (data.odor_description as string).trim()
  }
  if (data.has_event_experience && data.event_experience_description) {
    sanitized.event_experience_description = (data.event_experience_description as string).trim()
  }
  if (data.additional_notes && (data.additional_notes as string).trim() !== '') {
    sanitized.additional_notes = (data.additional_notes as string).trim()
  }

  return { valid: true, sanitized }
}
