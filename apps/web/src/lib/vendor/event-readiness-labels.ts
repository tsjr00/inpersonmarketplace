/**
 * Event-readiness questionnaire — the ONE place the question labels and the
 * option wording live, per vertical (owner 2026-09-19, admin UI feedback).
 *
 * The vendor form (app/[vertical]/vendor/edit/EventReadinessForm.tsx) and the
 * admin read-out (components/admin/VendorDetailAdminPage.tsx) both render from
 * here. Before this file the admin page carried its own FT-only copy, so an FM
 * vendor's "Tent / Booth" read back to the admin as "Food Trailer" and
 * "Requires refrigeration" as "Can sit 30+ min" — wrong ANSWERS, not just
 * wrong headings. Sharing the map makes that drift impossible.
 *
 * Storage keys are shared across verticals (validateEventReadiness in
 * event-readiness-validation.ts): FM reuses `vehicle_type` for setup type,
 * `vehicle_length_feet` for frontage, `requires_generator` for power,
 * `utensils_required` for samples and `seating_recommended` for
 * "needs covered space". The maps below give each key its per-vertical meaning.
 */

export type EventReadinessVertical = 'food_trucks' | 'farmers_market'

export interface Option { value: string; label: string }

export const SETUP_TYPE_OPTIONS: Record<EventReadinessVertical, Option[]> = {
  food_trucks: [
    { value: 'food_truck', label: 'Food Truck' },
    { value: 'food_trailer', label: 'Food Trailer (truck + trailer)' },
  ],
  farmers_market: [
    { value: 'tent_booth', label: 'Tent / Booth' },
    { value: 'table_only', label: 'Table Only' },
    { value: 'trailer', label: 'Trailer' },
    { value: 'vehicle_booth', label: 'Vehicle + Booth' },
  ],
}

export const GENERATOR_TYPE_OPTIONS: Option[] = [
  { value: 'quiet_inverter', label: 'Quiet / Inverter Generator' },
  { value: 'standard', label: 'Standard Generator' },
]

export const GENERATOR_FUEL_OPTIONS: Option[] = [
  { value: 'propane', label: 'Propane (minimal smell)' },
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
]

export const PERISHABILITY_OPTIONS: Record<EventReadinessVertical, Option[]> = {
  food_trucks: [
    { value: 'immediate', label: 'Must be eaten immediately (ice cream, frozen items)' },
    { value: 'within_15_min', label: 'Best within 15 minutes (fried items, hot plates)' },
    // T-69: examples here are PACKAGED ONLY, deliberately. Naming hot prepared
    // food as fine to sit 30+ minutes reads as the platform endorsing a
    // food-safety practice a health inspector would not. Do not re-add hot or
    // prepared items to this option.
    { value: 'can_sit_30_plus', label: 'Can sit 30+ minutes (packaged or wrapped items)' },
  ],
  farmers_market: [
    { value: 'refrigerated', label: 'Requires refrigeration or ice (dairy, meat, produce)' },
    { value: 'shade_required', label: 'Needs shade / temperature control (chocolate, baked goods)' },
    { value: 'shelf_stable', label: 'Shelf-stable (jams, honey, crafts, dry goods)' },
  ],
}

/** Question labels per vertical, keyed by storage field. */
export const QUESTION_LABELS: Record<EventReadinessVertical, Record<string, string>> = {
  food_trucks: {
    vehicle_type: 'Vehicle Type',
    vehicle_length_feet: 'Vehicle Length (feet)',
    requires_generator: 'Requires Generator?',
    generator_type: 'Generator Type',
    generator_fuel: 'Generator Fuel',
    max_runtime_hours: 'Max Runtime Without External Power (hours)',
    strong_odors: 'Does Your Cooking Produce Strong Odors?',
    odor_description: 'Describe the Odors',
    food_perishability: 'Food Perishability',
    packaging: 'Packaging Used for Serving',
    utensils_required: 'Does Your Food Require Utensils?',
    seating_recommended: 'Should Guests Have Seating?',
    max_headcount_per_wave: 'Max Headcount Per 30-Minute Wave',
    has_event_experience: 'Do You Have Event or Catering Experience?',
    additional_notes: 'Anything Else About Your Event Capabilities?',
  },
  farmers_market: {
    vehicle_type: 'Setup Type',
    vehicle_length_feet: 'Space Needed (feet wide)',
    requires_generator: 'Do You Need Access to Electrical Power?',
    strong_odors: 'Does Your Setup Produce Strong Odors? (e.g., cooking demos, samples)',
    odor_description: 'Describe the Odors',
    food_perishability: 'Product Storage Needs',
    packaging: 'Product Display Setup',
    utensils_required: 'Can You Offer Product Samples at Events?',
    seating_recommended: 'Outdoor Event Suitability',
    // Same stored key, different unit: FM is asked per HOUR, FT per 30-minute wave.
    max_headcount_per_wave: 'How Many Customers Can You Serve Per Hour?',
    has_event_experience: 'Do You Have Event or Catering Experience?',
    additional_notes: 'Anything Else About Your Event Capabilities?',
  },
}

/** Unit suffix for max_headcount_per_wave — the same number means a different window per vertical. */
export const HEADCOUNT_UNIT: Record<EventReadinessVertical, string> = {
  food_trucks: 'people / 30 min',
  farmers_market: 'customers / hour',
}

/** Yes/No answer wording where the two verticals read the same boolean differently. */
export const BOOLEAN_ANSWERS: Record<EventReadinessVertical, Record<string, { yes: string; no: string }>> = {
  food_trucks: {
    utensils_required: { yes: 'Yes (forks, knives, or spoons needed)', no: 'No (handheld)' },
    seating_recommended: { yes: 'Yes (e.g., BBQ plates, full meals)', no: 'No (handheld, walk-and-eat)' },
  },
  farmers_market: {
    utensils_required: { yes: 'Yes — I can provide samples or tastings', no: 'No — display and sell only' },
    // Stored inverted on purpose: `seating_recommended = true` means "needs
    // covered / indoor space" for FM (the form's radio order mirrors this).
    seating_recommended: {
      yes: 'Needs covered / indoor space — products are weather-sensitive',
      no: 'Fully outdoor OK — my products and setup handle sun, wind, and light rain',
    },
  },
}

export function toEventReadinessVertical(vertical: string | null | undefined): EventReadinessVertical {
  return vertical === 'food_trucks' ? 'food_trucks' : 'farmers_market'
}

function optionLabel(options: Option[], value: unknown): string {
  const hit = options.find(o => o.value === value)
  return hit ? hit.label : (typeof value === 'string' && value ? value : 'N/A')
}

function yesNo(v: unknown): string {
  return v === true ? 'Yes' : v === false ? 'No' : 'N/A'
}

/**
 * The admin read-out: one {label, value} row per question the vendor was
 * actually asked in their vertical, in the form's order. FT-only rows
 * (generator details, runtime) never appear for FM.
 */
export function eventReadinessRows(er: Record<string, unknown>, vertical: string): Array<{ label: string; value: string }> {
  const v = toEventReadinessVertical(vertical)
  const L = QUESTION_LABELS[v]
  const B = BOOLEAN_ANSWERS[v]
  const isFT = v === 'food_trucks'
  const rows: Array<{ label: string; value: string }> = []

  rows.push({ label: L.vehicle_type!, value: optionLabel(SETUP_TYPE_OPTIONS[v], er.vehicle_type) })
  rows.push({ label: L.vehicle_length_feet!, value: typeof er.vehicle_length_feet === 'number' ? `${er.vehicle_length_feet} feet` : 'N/A' })
  rows.push({ label: L.requires_generator!, value: yesNo(er.requires_generator) })
  if (isFT) {
    if (er.requires_generator === true) {
      rows.push({ label: L.generator_type!, value: optionLabel(GENERATOR_TYPE_OPTIONS, er.generator_type) })
      rows.push({ label: L.generator_fuel!, value: optionLabel(GENERATOR_FUEL_OPTIONS, er.generator_fuel) })
    }
    rows.push({ label: L.max_runtime_hours!, value: typeof er.max_runtime_hours === 'number' ? `${er.max_runtime_hours} hours` : 'N/A' })
  }
  rows.push({
    label: L.strong_odors!,
    value: er.strong_odors === true ? `Yes — ${(er.odor_description as string | undefined) || ''}`.trim() : yesNo(er.strong_odors),
  })
  rows.push({ label: L.food_perishability!, value: optionLabel(PERISHABILITY_OPTIONS[v], er.food_perishability) })
  rows.push({ label: L.packaging!, value: (typeof er.packaging === 'string' && er.packaging) || 'N/A' })
  for (const key of ['utensils_required', 'seating_recommended'] as const) {
    const a = B[key]!
    rows.push({ label: L[key]!, value: er[key] === true ? a.yes : er[key] === false ? a.no : 'N/A' })
  }
  rows.push({ label: L.max_headcount_per_wave!, value: typeof er.max_headcount_per_wave === 'number' ? `${er.max_headcount_per_wave} ${HEADCOUNT_UNIT[v]}` : 'N/A' })
  rows.push({
    label: L.has_event_experience!,
    value: er.has_event_experience === true ? `Yes — ${(er.event_experience_description as string | undefined) || ''}`.trim() : yesNo(er.has_event_experience),
  })
  if (typeof er.additional_notes === 'string' && er.additional_notes.trim()) {
    rows.push({ label: L.additional_notes!, value: er.additional_notes })
  }
  return rows
}
