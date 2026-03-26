/**
 * Event Viability Scoring
 *
 * Pure functions for evaluating event request viability.
 * No database, no auth, no side effects — fully testable.
 *
 * These scores are displayed to admin on the event detail view
 * to help them make faster, better-informed decisions about
 * whether to approve a request and which vendors to invite.
 *
 * See: event_system_deep_dive.md Part 12.3 for scoring design.
 */

// --- Types ---

export type ScoreLevel = 'green' | 'yellow' | 'red'

export interface ViabilityScore {
  level: ScoreLevel
  label: string
  detail: string
}

export interface EventViability {
  budget: ViabilityScore | null     // null for attendee_paid (budget not relevant)
  capacity: ViabilityScore
  duration: ViabilityScore
  overall: ScoreLevel
  overallLabel: string
}

export interface EventScoreInput {
  payment_model: string | null       // company_paid, attendee_paid, hybrid
  total_food_budget_cents: number | null
  expected_meal_count: number | null
  headcount: number
  vendor_count: number
  event_start_time: string | null    // HH:MM format
  event_end_time: string | null      // HH:MM format
  is_recurring: boolean
}

export interface VendorMatchInput {
  vendor_id: string
  business_name: string
  listing_categories: string[]       // e.g. ['Mexican', 'BBQ']
  max_headcount_per_wave: number
  max_runtime_hours: number
  has_event_experience: boolean
  average_rating: number | null
  rating_count: number
  cancellation_rate: number          // 0-100
  tier: string
  vehicle_length_feet?: number
  requires_generator?: boolean
  strong_odors?: boolean
}

export interface VendorMatchResult {
  vendor_id: string
  business_name: string
  cuisine_match: ScoreLevel
  capacity_fit: ScoreLevel
  runtime_fit: ScoreLevel
  platform_score: number             // 0-5 composite
  tier: string
  experienced: boolean
  details: {
    cuisine_match_detail: string
    capacity_detail: string
    runtime_detail: string
    score_detail: string
  }
}

// --- Constants ---

/** Average food truck meal price in cents (used for budget realism check) */
const AVG_MEAL_PRICE_CENTS = 1350  // $13.50

/** Platform average throughput per vendor per 30-min wave */
const DEFAULT_AVG_THROUGHPUT = 30

/** Wave duration in minutes */
const WAVE_DURATION_MINUTES = 30

// --- Viability Scoring ---

/**
 * Calculate the number of 30-minute waves in an event
 */
export function calculateWaveCount(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 4 // Default assumption: 2-hour event = 4 waves

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)

  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  const durationMinutes = endMinutes - startMinutes

  if (durationMinutes <= 0) return 4 // Invalid times, use default

  return Math.ceil(durationMinutes / WAVE_DURATION_MINUTES)
}

/**
 * Calculate event duration in hours
 */
export function calculateEventHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 2 // Default assumption

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)

  const hours = (endH * 60 + endM - startH * 60 - startM) / 60
  return hours > 0 ? hours : 2
}

/**
 * Score budget viability (company_paid and hybrid only)
 *
 * Compares per-meal budget against typical food truck pricing.
 * Green: $10+ per meal (comfortable margin)
 * Yellow: $7-10 (tight but possible with limited menus)
 * Red: <$7 (unrealistic — most trucks can't serve below this)
 */
export function scoreBudget(
  totalBudgetCents: number | null,
  expectedMealCount: number | null
): ViabilityScore | null {
  if (totalBudgetCents == null || expectedMealCount == null || expectedMealCount === 0) {
    return null
  }

  const perMealCents = Math.round(totalBudgetCents / expectedMealCount)
  const perMealDollars = (perMealCents / 100).toFixed(2)

  if (perMealCents >= 1000) {
    return {
      level: 'green',
      label: 'Strong',
      detail: `$${perMealDollars}/meal — comfortable for food truck pricing`,
    }
  }

  if (perMealCents >= 700) {
    return {
      level: 'yellow',
      label: 'Tight',
      detail: `$${perMealDollars}/meal — possible with simpler menu options`,
    }
  }

  return {
    level: 'red',
    label: 'Unrealistic',
    detail: `$${perMealDollars}/meal — below typical food truck minimum. Discuss with organizer.`,
  }
}

/**
 * Score capacity viability
 *
 * Compares trucks requested vs trucks needed based on throughput math.
 * trucks_needed = expected_meals / (avg_throughput × num_waves)
 */
export function scoreCapacity(
  expectedMealCount: number | null,
  headcount: number,
  vendorCount: number,
  numWaves: number,
  avgThroughput: number = DEFAULT_AVG_THROUGHPUT
): ViabilityScore {
  const meals = expectedMealCount || headcount
  const trucksNeeded = Math.ceil(meals / (avgThroughput * numWaves))
  const ratio = vendorCount / trucksNeeded

  if (ratio >= 1) {
    return {
      level: 'green',
      label: 'Good',
      detail: `${vendorCount} trucks requested, ~${trucksNeeded} needed for ${meals} meals across ${numWaves} waves`,
    }
  }

  if (ratio >= 0.75) {
    return {
      level: 'yellow',
      label: 'Tight',
      detail: `${vendorCount} trucks requested but ~${trucksNeeded} recommended for ${meals} meals. May cause longer wait times.`,
    }
  }

  return {
    level: 'red',
    label: 'Understaffed',
    detail: `${vendorCount} trucks requested but ~${trucksNeeded} needed for ${meals} meals. Significantly understaffed — discuss with organizer.`,
  }
}

/**
 * Score event duration viability
 *
 * Checks whether event duration is realistic for vendor operations.
 * Most food trucks can run 4-8 hours comfortably.
 */
export function scoreDuration(eventHours: number): ViabilityScore {
  if (eventHours <= 6) {
    return {
      level: 'green',
      label: 'Standard',
      detail: `${eventHours}hr event — well within typical vendor operating window`,
    }
  }

  if (eventHours <= 8) {
    return {
      level: 'yellow',
      label: 'Long',
      detail: `${eventHours}hr event — manageable but verify vendor runtime capacity`,
    }
  }

  return {
    level: 'red',
    label: 'Extended',
    detail: `${eventHours}hr event — exceeds typical vendor capacity. May need shift rotations or multiple vendor sets.`,
  }
}

/**
 * Calculate overall event viability from individual scores
 */
export function calculateViability(input: EventScoreInput): EventViability {
  const numWaves = calculateWaveCount(input.event_start_time, input.event_end_time)
  const eventHours = calculateEventHours(input.event_start_time, input.event_end_time)

  const isCompanyPaid = input.payment_model === 'company_paid' || input.payment_model === 'hybrid'

  const budget = isCompanyPaid
    ? scoreBudget(input.total_food_budget_cents, input.expected_meal_count)
    : null

  const capacity = scoreCapacity(
    input.expected_meal_count,
    input.headcount,
    input.vendor_count,
    numWaves
  )

  const duration = scoreDuration(eventHours)

  // Overall: worst of all applicable scores
  const scores = [capacity.level, duration.level]
  if (budget) scores.push(budget.level)

  let overall: ScoreLevel = 'green'
  if (scores.includes('red')) overall = 'red'
  else if (scores.includes('yellow')) overall = 'yellow'

  const overallLabels: Record<ScoreLevel, string> = {
    green: 'Strong — ready to proceed',
    yellow: 'Review — some areas need attention',
    red: 'Concerns — discuss with organizer before proceeding',
  }

  // Recurring events get a boost in the label
  const recurringNote = input.is_recurring ? ' (recurring — higher strategic value)' : ''

  return {
    budget,
    capacity,
    duration,
    overall,
    overallLabel: overallLabels[overall] + recurringNote,
  }
}

// --- Vendor Matching ---

/**
 * Score how well a vendor's cuisine matches the event's preferences.
 * Uses simple keyword matching — not NLP, just practical string comparison.
 */
export function scoreCuisineMatch(
  vendorCategories: string[],
  cuisinePreferences: string | null
): { level: ScoreLevel; detail: string } {
  if (!cuisinePreferences || cuisinePreferences.trim() === '') {
    return { level: 'green', detail: 'No cuisine preference specified — all vendors match' }
  }

  const prefLower = cuisinePreferences.toLowerCase()
  const vendorCatsLower = vendorCategories.map(c => c.toLowerCase())

  // Check for direct matches
  const matches = vendorCatsLower.filter(cat => prefLower.includes(cat))

  if (matches.length > 0) {
    return { level: 'green', detail: `Matches: ${matches.join(', ')}` }
  }

  // Check for partial/related matches (common food truck categories)
  const CUISINE_SYNONYMS: Record<string, string[]> = {
    'bbq': ['barbecue', 'smoked', 'brisket', 'ribs'],
    'mexican': ['tacos', 'burritos', 'tex-mex', 'latin'],
    'asian': ['chinese', 'japanese', 'thai', 'korean', 'vietnamese', 'sushi', 'ramen'],
    'american': ['burgers', 'sandwiches', 'comfort food', 'classic'],
    'italian': ['pizza', 'pasta', 'mediterranean'],
    'seafood': ['fish', 'shrimp', 'lobster'],
  }

  for (const cat of vendorCatsLower) {
    const synonyms = CUISINE_SYNONYMS[cat] || []
    if (synonyms.some(s => prefLower.includes(s))) {
      return { level: 'green', detail: `Related match: ${cat}` }
    }
    // Also check reverse — pref keyword in synonym lists
    for (const [key, syns] of Object.entries(CUISINE_SYNONYMS)) {
      if (prefLower.includes(key) && syns.some(s => cat.includes(s))) {
        return { level: 'green', detail: `Related match: ${cat} ↔ ${key}` }
      }
    }
  }

  return { level: 'yellow', detail: 'No direct cuisine match — admin judgment needed' }
}

/**
 * Calculate vendor match scores for an event
 */
export function scoreVendorMatch(
  vendor: VendorMatchInput,
  event: {
    cuisine_preferences: string | null
    headcount: number
    expected_meal_count: number | null
    vendor_count: number
    event_start_time: string | null
    event_end_time: string | null
  }
): VendorMatchResult {
  const numWaves = calculateWaveCount(event.event_start_time, event.event_end_time)
  const eventHours = calculateEventHours(event.event_start_time, event.event_end_time)
  const mealsPerVendor = Math.ceil((event.expected_meal_count || event.headcount) / event.vendor_count)

  // Cuisine match
  const cuisine = scoreCuisineMatch(vendor.listing_categories, event.cuisine_preferences)

  // Capacity fit
  const vendorCapacity = vendor.max_headcount_per_wave * numWaves
  let capacity_fit: ScoreLevel
  let capacity_detail: string
  if (vendorCapacity >= mealsPerVendor) {
    capacity_fit = 'green'
    capacity_detail = `Can serve ${vendorCapacity} meals (${vendor.max_headcount_per_wave}/wave × ${numWaves} waves) — need ~${mealsPerVendor}`
  } else if (vendorCapacity >= mealsPerVendor * 0.8) {
    capacity_fit = 'yellow'
    capacity_detail = `Capacity ${vendorCapacity} is tight for ~${mealsPerVendor} allocated meals`
  } else {
    capacity_fit = 'red'
    capacity_detail = `Capacity ${vendorCapacity} is under the ~${mealsPerVendor} allocated meals`
  }

  // Runtime fit
  let runtime_fit: ScoreLevel
  let runtime_detail: string
  if (vendor.max_runtime_hours >= eventHours) {
    runtime_fit = 'green'
    runtime_detail = `Can run ${vendor.max_runtime_hours}hr — event is ${eventHours}hr`
  } else if (vendor.max_runtime_hours >= eventHours - 1) {
    runtime_fit = 'yellow'
    runtime_detail = `Max runtime ${vendor.max_runtime_hours}hr is close to ${eventHours}hr event`
  } else {
    runtime_fit = 'red'
    runtime_detail = `Max runtime ${vendor.max_runtime_hours}hr — event is ${eventHours}hr`
  }

  // Platform score (0-5 composite)
  // Weight: 60% rating, 40% reliability
  const ratingScore = vendor.average_rating || 3.0  // default 3 if no ratings
  const ratingWeight = Math.min(vendor.rating_count / 20, 1) // full weight at 20+ reviews
  const reliabilityScore = 5 * (1 - vendor.cancellation_rate / 100)
  const platformScore = Math.round(
    ((ratingScore * ratingWeight + 3.0 * (1 - ratingWeight)) * 0.6 + reliabilityScore * 0.4) * 10
  ) / 10

  return {
    vendor_id: vendor.vendor_id,
    business_name: vendor.business_name,
    cuisine_match: cuisine.level,
    capacity_fit,
    runtime_fit,
    platform_score: platformScore,
    tier: vendor.tier,
    experienced: vendor.has_event_experience,
    details: {
      cuisine_match_detail: cuisine.detail,
      capacity_detail,
      runtime_detail,
      score_detail: `Rating: ${vendor.average_rating?.toFixed(1) || 'N/A'} (${vendor.rating_count} reviews) • Cancellation: ${vendor.cancellation_rate}%`,
    },
  }
}
