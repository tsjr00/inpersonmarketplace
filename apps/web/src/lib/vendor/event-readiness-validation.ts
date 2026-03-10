/**
 * Event Readiness Validation
 *
 * Extracted from: src/app/api/vendor/event-readiness/route.ts
 * Purpose: Validate and sanitize the 14-field event readiness questionnaire
 * that FT vendors fill out to apply for private event approval.
 *
 * This is a pure function — no DB, no auth, no side effects.
 * Testable without HTTP server or Supabase connection.
 */

export interface EventReadinessData {
  vehicle_type: 'food_truck' | 'food_trailer'
  vehicle_length_feet: number
  requires_generator: boolean
  generator_type?: 'quiet_inverter' | 'standard'
  generator_fuel?: 'propane' | 'gasoline' | 'diesel'
  max_runtime_hours: number
  strong_odors: boolean
  odor_description?: string
  food_perishability: 'immediate' | 'within_15_min' | 'can_sit_30_plus'
  packaging: string
  utensils_required: boolean
  seating_recommended: boolean
  max_headcount_per_wave: number
  has_event_experience: boolean
  event_experience_description?: string
  additional_notes?: string
}

export const VALID_VEHICLE_TYPES = ['food_truck', 'food_trailer']
export const VALID_GENERATOR_TYPES = ['quiet_inverter', 'standard']
export const VALID_GENERATOR_FUELS = ['propane', 'gasoline', 'diesel']
export const VALID_PERISHABILITY = ['immediate', 'within_15_min', 'can_sit_30_plus']

export function validateEventReadiness(data: Record<string, unknown>): { valid: boolean; error?: string; sanitized?: EventReadinessData } {
  // Vehicle & Setup
  if (!data.vehicle_type || !VALID_VEHICLE_TYPES.includes(data.vehicle_type as string)) {
    return { valid: false, error: 'Vehicle type is required (food_truck or food_trailer)' }
  }
  if (typeof data.vehicle_length_feet !== 'number' || data.vehicle_length_feet < 5 || data.vehicle_length_feet > 80) {
    return { valid: false, error: 'Vehicle length must be a number between 5 and 80 feet' }
  }
  if (typeof data.requires_generator !== 'boolean') {
    return { valid: false, error: 'Requires generator must be yes or no' }
  }
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

  // Food Service Characteristics
  if (typeof data.strong_odors !== 'boolean') {
    return { valid: false, error: 'Strong odors must be yes or no' }
  }
  if (data.strong_odors && (!data.odor_description || (data.odor_description as string).trim() === '')) {
    return { valid: false, error: 'Please describe the cooking odors when strong odors is selected' }
  }
  if (!data.food_perishability || !VALID_PERISHABILITY.includes(data.food_perishability as string)) {
    return { valid: false, error: 'Food perishability selection is required' }
  }
  if (!data.packaging || (data.packaging as string).trim() === '') {
    return { valid: false, error: 'Packaging description is required' }
  }
  if (typeof data.utensils_required !== 'boolean') {
    return { valid: false, error: 'Utensils required must be yes or no' }
  }
  if (typeof data.seating_recommended !== 'boolean') {
    return { valid: false, error: 'Seating recommended must be yes or no' }
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
    vehicle_type: data.vehicle_type as EventReadinessData['vehicle_type'],
    vehicle_length_feet: Math.round(data.vehicle_length_feet as number),
    requires_generator: data.requires_generator as boolean,
    max_runtime_hours: Math.round(data.max_runtime_hours as number),
    strong_odors: data.strong_odors as boolean,
    food_perishability: data.food_perishability as EventReadinessData['food_perishability'],
    packaging: (data.packaging as string).trim(),
    utensils_required: data.utensils_required as boolean,
    seating_recommended: data.seating_recommended as boolean,
    max_headcount_per_wave: Math.round(data.max_headcount_per_wave as number),
    has_event_experience: data.has_event_experience as boolean,
  }

  // Conditional fields
  if (data.requires_generator) {
    sanitized.generator_type = data.generator_type as EventReadinessData['generator_type']
    sanitized.generator_fuel = data.generator_fuel as EventReadinessData['generator_fuel']
  }
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
