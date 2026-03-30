/**
 * Event Viability Scoring — v2 (Event-Type-Aware)
 *
 * Pure functions for evaluating event request viability.
 * No database, no auth, no side effects — fully testable.
 *
 * Three distinct scoring models based on product type:
 *   Product A (company_paid): Wave capacity math + budget analysis
 *   Product B (attendee_paid): Participation rate estimation + revenue opportunity
 *   Product C (crowd events): Foot traffic × buy rate model
 *
 * All assumptions are shown explicitly in the detail text so admin
 * can see HOW the score was calculated and adjust their judgment.
 *
 * See: event_system_deep_dive.md Parts 12-13 for design.
 */

// --- Types ---

export type ScoreLevel = 'green' | 'yellow' | 'red'

export interface ViabilityScore {
  level: ScoreLevel
  label: string
  detail: string
}

export interface EventViability {
  budget: ViabilityScore | null
  capacity: ViabilityScore
  duration: ViabilityScore
  revenueOpportunity: ViabilityScore | null  // Product B & C: estimated revenue per truck
  ticketedBonus: boolean                     // Ticketed events get a positive note
  assumptions: string[]                      // Explicit list of assumptions used
  overall: ScoreLevel
  overallLabel: string
}

export interface EventScoreInput {
  event_type: string | null          // corporate_lunch, team_building, grand_opening, festival, private_party, other
  payment_model: string | null       // company_paid, attendee_paid, hybrid
  total_food_budget_cents: number | null
  per_meal_budget_cents: number | null
  expected_meal_count: number | null
  headcount: number
  vendor_count: number
  event_start_time: string | null    // HH:MM format
  event_end_time: string | null      // HH:MM format
  is_recurring: boolean
  is_ticketed: boolean
  competing_food_options: string | null
  estimated_dwell_hours: number | null
}

export interface VendorMatchInput {
  vendor_id: string
  business_name: string
  listing_categories: string[]
  max_headcount_per_wave: number
  max_runtime_hours: number
  has_event_experience: boolean
  average_rating: number | null
  rating_count: number
  cancellation_rate: number
  tier: string
  pickup_lead_minutes?: number       // 15 or 30 — affects wave duration recommendation
  vehicle_length_feet?: number
  requires_generator?: boolean
  generator_type?: string            // 'quiet_inverter' | 'standard'
  strong_odors?: boolean
  food_perishability?: string        // FT: immediate/within_15_min/can_sit_30_plus, FM: refrigerated/shade_required/shelf_stable
  seating_recommended?: boolean      // FT: needs seating, FM: weather-sensitive (needs indoor)
}

export interface VendorMatchResult {
  vendor_id: string
  business_name: string
  cuisine_match: ScoreLevel
  capacity_fit: ScoreLevel
  runtime_fit: ScoreLevel
  deal_breakers: string[]            // red: reasons this vendor would ruin the event — excluded from auto-invite
  warnings: string[]                 // yellow: concerns that need admin attention but don't exclude
  platform_score: number
  tier: string
  experienced: boolean
  lead_time_advantage: boolean       // true if 15-min lead time (faster service)
  details: {
    cuisine_match_detail: string
    capacity_detail: string
    runtime_detail: string
    score_detail: string
    lead_time_detail: string
  }
}

// --- Constants ---

/** Average food truck meal price in cents */
const AVG_MEAL_PRICE_CENTS = 1350  // $13.50

/** Platform average throughput per vendor per 30-min wave */
const DEFAULT_AVG_THROUGHPUT = 30

/** Default wave duration in minutes (can be 15 if all vendors support it) */
const DEFAULT_WAVE_MINUTES = 30

/** Estimated buyer rates by event type (what % of attendees actually order) */
const BUYER_RATES: Record<string, { low: number; high: number; label: string }> = {
  // Company-paid: everyone eats (company is paying)
  company_paid: { low: 0.9, high: 1.0, label: '90-100% (company paying)' },
  // Employee-paid: varies by time and context
  attendee_paid_lunch: { low: 0.6, high: 0.8, label: '60-80% (lunch hour)' },
  attendee_paid_other: { low: 0.3, high: 0.5, label: '30-50% (non-lunch)' },
  // Crowd events: public foot traffic
  crowd: { low: 0.1, high: 0.3, label: '10-30% (public event)' },
  crowd_ticketed: { low: 0.15, high: 0.4, label: '15-40% (ticketed event)' },
}

/** Revenue opportunity thresholds per truck */
const REVENUE_THRESHOLDS = {
  strong: 60000,   // $600+
  moderate: 30000, // $300-600
  // Below $300 = low
}

// --- Helpers ---

/**
 * Determine the product model from event_type + payment_model
 */
export function getProductModel(
  eventType: string | null,
  paymentModel: string | null
): 'company_paid' | 'attendee_paid' | 'crowd' {
  if (paymentModel === 'company_paid' || paymentModel === 'hybrid') return 'company_paid'

  // Crowd event types — even if marked attendee_paid, these are crowd-style
  const crowdTypes = ['grand_opening', 'festival']
  if (eventType && crowdTypes.includes(eventType)) return 'crowd'

  if (paymentModel === 'attendee_paid') return 'attendee_paid'

  // Default based on event type
  if (eventType === 'corporate_lunch' || eventType === 'team_building') return 'company_paid'
  if (eventType === 'private_party') return 'attendee_paid'

  return 'attendee_paid' // safe default
}

/**
 * Determine if this is a lunch-hour event (affects buyer rate for Product B)
 */
function isLunchEvent(startTime: string | null): boolean {
  if (!startTime) return true // assume lunch if unknown
  const hour = parseInt(startTime.split(':')[0])
  return hour >= 11 && hour <= 13
}

export function calculateWaveCount(startTime: string | null, endTime: string | null, waveDurationMin: number = DEFAULT_WAVE_MINUTES): number {
  if (!startTime || !endTime) return Math.ceil(120 / waveDurationMin) // Default: 2hr event

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM)

  if (durationMinutes <= 0) return Math.ceil(120 / waveDurationMin)
  return Math.ceil(durationMinutes / waveDurationMin)
}

export function calculateEventHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 2
  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60
  return hours > 0 ? Math.round(hours * 10) / 10 : 2
}

// --- Budget Scoring ---

export function scoreBudget(
  totalBudgetCents: number | null,
  perMealBudgetCents: number | null,
  expectedMealCount: number | null
): ViabilityScore | null {
  // Determine per-meal from whichever input we have
  let perMealCents: number | null = null
  if (perMealBudgetCents != null && perMealBudgetCents > 0) {
    perMealCents = perMealBudgetCents
  } else if (totalBudgetCents != null && expectedMealCount != null && expectedMealCount > 0) {
    perMealCents = Math.round(totalBudgetCents / expectedMealCount)
  }

  if (perMealCents == null) return null

  const perMealDollars = (perMealCents / 100).toFixed(2)
  const avgDollars = (AVG_MEAL_PRICE_CENTS / 100).toFixed(2)

  if (perMealCents >= 1000) {
    return {
      level: 'green',
      label: 'Strong',
      detail: `$${perMealDollars}/meal budget — comfortable (platform avg: $${avgDollars}/meal)`,
    }
  }
  if (perMealCents >= 700) {
    return {
      level: 'yellow',
      label: 'Tight',
      detail: `$${perMealDollars}/meal budget — possible with simpler menus (platform avg: $${avgDollars}/meal)`,
    }
  }
  return {
    level: 'red',
    label: 'Unrealistic',
    detail: `$${perMealDollars}/meal budget — below typical food truck minimum (platform avg: $${avgDollars}/meal). Discuss with organizer.`,
  }
}

// --- Capacity Scoring (Product-Type-Aware) ---

function scoreCapacityCompanyPaid(
  meals: number,
  vendorCount: number,
  numWaves: number,
  waveDurationMin: number,
  avgThroughput: number = DEFAULT_AVG_THROUGHPUT
): ViabilityScore {
  const trucksNeeded = Math.ceil(meals / (avgThroughput * numWaves))
  const ratio = vendorCount / trucksNeeded

  const waveExplanation = `${numWaves} × ${waveDurationMin}-min waves`

  if (ratio >= 1) {
    return {
      level: 'green',
      label: 'Good',
      detail: `${vendorCount} trucks requested, ~${trucksNeeded} needed (${meals} meals ÷ ${avgThroughput} per truck per wave × ${waveExplanation})`,
    }
  }
  if (ratio >= 0.75) {
    return {
      level: 'yellow',
      label: 'Tight',
      detail: `${vendorCount} trucks requested, ~${trucksNeeded} recommended (${meals} meals, ${waveExplanation}). May cause longer wait times.`,
    }
  }
  return {
    level: 'red',
    label: 'Understaffed',
    detail: `${vendorCount} trucks requested, ~${trucksNeeded} needed (${meals} meals, ${waveExplanation}). Discuss with organizer.`,
  }
}

function scoreCapacityAttendeePaid(
  headcount: number,
  expectedMealCount: number | null,
  vendorCount: number,
  eventHours: number,
  isLunch: boolean
): ViabilityScore {
  const buyerRate = isLunch ? BUYER_RATES.attendee_paid_lunch : BUYER_RATES.attendee_paid_other
  const estimatedOrders = expectedMealCount || Math.round(headcount * (buyerRate.low + buyerRate.high) / 2)
  const orderRange = `${Math.round(headcount * buyerRate.low)}-${Math.round(headcount * buyerRate.high)}`
  const ordersPerTruck = Math.round(estimatedOrders / vendorCount)

  if (ordersPerTruck <= 60) {
    return {
      level: 'green',
      label: 'Manageable',
      detail: `~${ordersPerTruck} orders/truck estimated (${headcount} guests × ${buyerRate.label} = ${orderRange} orders, ${vendorCount} trucks, ${eventHours}hr)`,
    }
  }
  if (ordersPerTruck <= 100) {
    return {
      level: 'yellow',
      label: 'Busy',
      detail: `~${ordersPerTruck} orders/truck (${headcount} guests × ${buyerRate.label}). Manageable but expect lines.`,
    }
  }
  return {
    level: 'red',
    label: 'Overloaded',
    detail: `~${ordersPerTruck} orders/truck — likely too many. Consider more trucks or shorter event.`,
  }
}

function scoreCapacityCrowd(
  headcount: number,
  expectedMealCount: number | null,
  vendorCount: number,
  isTicketed: boolean,
  dwellHours: number | null,
  eventHours: number
): ViabilityScore {
  const buyerRate = isTicketed ? BUYER_RATES.crowd_ticketed : BUYER_RATES.crowd
  const estimatedOrders = expectedMealCount || Math.round(headcount * (buyerRate.low + buyerRate.high) / 2)
  const orderRange = `${Math.round(headcount * buyerRate.low)}-${Math.round(headcount * buyerRate.high)}`
  const ordersPerTruck = Math.round(estimatedOrders / vendorCount)

  const dwellNote = dwellHours ? ` Avg dwell: ${dwellHours}hr.` : ''
  const ticketNote = isTicketed ? ' Ticketed event — better pre-order potential.' : ''

  if (ordersPerTruck >= 20) {
    return {
      level: 'green',
      label: 'Viable',
      detail: `~${ordersPerTruck} orders/truck estimated (${headcount} visitors × ${buyerRate.label} = ${orderRange} orders).${ticketNote}${dwellNote}`,
    }
  }
  if (ordersPerTruck >= 10) {
    return {
      level: 'yellow',
      label: 'Marginal',
      detail: `~${ordersPerTruck} orders/truck — moderate volume. This is primarily a visibility/marketing opportunity for vendors.${ticketNote}${dwellNote}`,
    }
  }
  return {
    level: 'red',
    label: 'Low Volume',
    detail: `~${ordersPerTruck} orders/truck — may not be worth vendors' time. Consider fewer trucks or ensure strong organizer promotion.${ticketNote}${dwellNote}`,
  }
}

// --- Revenue Opportunity (Products B & C) ---

function scoreRevenueOpportunity(
  estimatedOrdersPerTruck: number
): ViabilityScore {
  const estRevenue = estimatedOrdersPerTruck * AVG_MEAL_PRICE_CENTS
  const estDollars = (estRevenue / 100).toFixed(0)

  if (estRevenue >= REVENUE_THRESHOLDS.strong) {
    return {
      level: 'green',
      label: 'Strong',
      detail: `~$${estDollars}/truck estimated revenue (${estimatedOrdersPerTruck} orders × $${(AVG_MEAL_PRICE_CENTS/100).toFixed(2)} avg)`,
    }
  }
  if (estRevenue >= REVENUE_THRESHOLDS.moderate) {
    return {
      level: 'yellow',
      label: 'Moderate',
      detail: `~$${estDollars}/truck — decent opportunity but depends on promotion and turnout`,
    }
  }
  return {
    level: 'red',
    label: 'Low',
    detail: `~$${estDollars}/truck — vendors may not break even. Consider this a visibility opportunity, not a revenue event.`,
  }
}

// --- Duration Scoring ---

export function scoreDuration(eventHours: number): ViabilityScore {
  if (eventHours <= 6) {
    return {
      level: 'green',
      label: 'Standard',
      detail: `${eventHours}hr event — within typical vendor operating window`,
    }
  }
  if (eventHours <= 8) {
    return {
      level: 'yellow',
      label: 'Long',
      detail: `${eventHours}hr event — verify vendor runtime capacity`,
    }
  }
  return {
    level: 'red',
    label: 'Extended',
    detail: `${eventHours}hr event — may need shift rotations or multiple vendor sets`,
  }
}

// --- Main Viability Calculator ---

export function calculateViability(input: EventScoreInput): EventViability {
  const productModel = getProductModel(input.event_type, input.payment_model)
  const eventHours = calculateEventHours(input.event_start_time, input.event_end_time)
  const isLunch = isLunchEvent(input.event_start_time)
  const assumptions: string[] = []

  // Track assumptions
  if (!input.event_start_time || !input.event_end_time) {
    assumptions.push('Event times not specified — assuming 2-hour event')
  } else {
    assumptions.push(`Event duration: ${eventHours}hr (${input.event_start_time} — ${input.event_end_time})`)
  }

  // --- Budget (company_paid only) ---
  let budget: ViabilityScore | null = null
  if (productModel === 'company_paid') {
    budget = scoreBudget(input.total_food_budget_cents, input.per_meal_budget_cents, input.expected_meal_count)
    if (!budget && !input.total_food_budget_cents && !input.per_meal_budget_cents) {
      assumptions.push('No budget provided — budget score unavailable')
    }
  }

  // --- Capacity (model-specific) ---
  let capacity: ViabilityScore
  let revenueOpportunity: ViabilityScore | null = null

  if (productModel === 'company_paid') {
    const waveDurationMin = DEFAULT_WAVE_MINUTES
    const numWaves = calculateWaveCount(input.event_start_time, input.event_end_time, waveDurationMin)
    assumptions.push(`Wave calculation: ${numWaves} waves (${eventHours}hr ÷ ${waveDurationMin}-min per wave)`)
    assumptions.push(`Throughput assumption: ~${DEFAULT_AVG_THROUGHPUT} meals per truck per wave (platform average)`)

    const meals = input.expected_meal_count || input.headcount
    if (!input.expected_meal_count) {
      assumptions.push(`Expected meals = headcount (${input.headcount}) — company pays for all`)
    }

    capacity = scoreCapacityCompanyPaid(meals, input.vendor_count, numWaves, waveDurationMin)
  } else if (productModel === 'attendee_paid') {
    assumptions.push(`Buyer rate estimate: ${isLunch ? BUYER_RATES.attendee_paid_lunch.label : BUYER_RATES.attendee_paid_other.label}`)
    if (input.expected_meal_count) {
      assumptions.push(`Organizer-provided expected orders: ${input.expected_meal_count}`)
    }
    if (input.competing_food_options) {
      assumptions.push(`Competing food noted: "${input.competing_food_options}" — may reduce buyer rate`)
    }
    assumptions.push('Waves not assumed — employee-paid events typically use open ordering')

    capacity = scoreCapacityAttendeePaid(input.headcount, input.expected_meal_count, input.vendor_count, eventHours, isLunch)

    // Revenue opportunity
    const buyerRate = isLunch ? BUYER_RATES.attendee_paid_lunch : BUYER_RATES.attendee_paid_other
    const estOrders = input.expected_meal_count || Math.round(input.headcount * (buyerRate.low + buyerRate.high) / 2)
    revenueOpportunity = scoreRevenueOpportunity(Math.round(estOrders / input.vendor_count))
  } else {
    // Crowd event
    const buyerRate = input.is_ticketed ? BUYER_RATES.crowd_ticketed : BUYER_RATES.crowd
    assumptions.push(`Buyer rate estimate: ${buyerRate.label}`)
    if (input.expected_meal_count) {
      assumptions.push(`Organizer-provided expected food buyers: ${input.expected_meal_count}`)
    }
    if (input.estimated_dwell_hours) {
      assumptions.push(`Estimated dwell time: ${input.estimated_dwell_hours}hr`)
    }
    assumptions.push('Waves not applicable for crowd events — open ordering model')

    capacity = scoreCapacityCrowd(
      input.headcount,
      input.expected_meal_count,
      input.vendor_count,
      input.is_ticketed,
      input.estimated_dwell_hours,
      eventHours
    )

    const estOrders = input.expected_meal_count || Math.round(input.headcount * (buyerRate.low + buyerRate.high) / 2)
    revenueOpportunity = scoreRevenueOpportunity(Math.round(estOrders / input.vendor_count))
  }

  // --- Duration ---
  const duration = scoreDuration(eventHours)

  // --- Ticketed bonus ---
  const ticketedBonus = input.is_ticketed

  // --- Overall ---
  const scores = [capacity.level, duration.level]
  if (budget) scores.push(budget.level)
  if (revenueOpportunity) scores.push(revenueOpportunity.level)

  let overall: ScoreLevel = 'green'
  if (scores.includes('red')) overall = 'red'
  else if (scores.includes('yellow')) overall = 'yellow'

  const overallLabels: Record<ScoreLevel, string> = {
    green: 'Strong — ready to proceed',
    yellow: 'Review — some areas need attention',
    red: 'Concerns — discuss with organizer before proceeding',
  }

  const notes: string[] = []
  if (input.is_recurring) notes.push('Recurring — higher strategic value')
  if (ticketedBonus) notes.push('Ticketed — better pre-order potential')
  const noteStr = notes.length ? ` (${notes.join(', ')})` : ''

  return {
    budget,
    capacity,
    duration,
    revenueOpportunity,
    ticketedBonus,
    assumptions,
    overall,
    overallLabel: overallLabels[overall] + noteStr,
  }
}

// --- Vendor Matching ---

export function scoreCuisineMatch(
  vendorCategories: string[],
  cuisinePreferences: string | null
): { level: ScoreLevel; detail: string } {
  if (!cuisinePreferences || cuisinePreferences.trim() === '') {
    return { level: 'green', detail: 'No cuisine preference specified — all vendors match' }
  }

  const prefLower = cuisinePreferences.toLowerCase()
  const vendorCatsLower = vendorCategories.map(c => c.toLowerCase())

  const matches = vendorCatsLower.filter(cat => prefLower.includes(cat))
  if (matches.length > 0) {
    return { level: 'green', detail: `Matches: ${matches.join(', ')}` }
  }

  // FT cuisine synonyms
  const FT_SYNONYMS: Record<string, string[]> = {
    'bbq': ['barbecue', 'smoked', 'brisket', 'ribs'],
    'mexican': ['tacos', 'burritos', 'tex-mex', 'latin'],
    'asian': ['chinese', 'japanese', 'thai', 'korean', 'vietnamese', 'sushi', 'ramen'],
    'american': ['burgers', 'sandwiches', 'comfort food', 'classic'],
    'italian': ['pizza', 'pasta', 'mediterranean'],
    'seafood': ['fish', 'shrimp', 'lobster'],
  }

  // FM category synonyms
  const FM_SYNONYMS: Record<string, string[]> = {
    'produce': ['vegetables', 'fruit', 'fresh', 'organic', 'farm', 'greens', 'tomatoes', 'berries'],
    'meat & poultry': ['beef', 'chicken', 'pork', 'sausage', 'jerky', 'lamb', 'turkey', 'bacon'],
    'dairy & eggs': ['cheese', 'milk', 'butter', 'yogurt', 'eggs', 'cream'],
    'baked goods': ['bread', 'pastry', 'cookies', 'cake', 'muffins', 'pie', 'scones', 'sourdough'],
    'pantry': ['jam', 'jelly', 'honey', 'sauce', 'salsa', 'pickles', 'preserves', 'spices', 'oil', 'vinegar'],
    'prepared foods': ['ready to eat', 'meals', 'tamales', 'soup', 'dips', 'hummus', 'salad'],
    'plants & flowers': ['plants', 'flowers', 'herbs', 'succulents', 'bouquet', 'garden'],
    'health & wellness': ['soap', 'candles', 'lotion', 'essential oils', 'wellness', 'natural'],
    'art & decor': ['art', 'pottery', 'woodwork', 'handmade', 'crafts', 'jewelry', 'decor'],
    'home & functional': ['cutting board', 'kitchen', 'textiles', 'bags', 'baskets'],
  }

  const CUISINE_SYNONYMS = { ...FT_SYNONYMS, ...FM_SYNONYMS }

  for (const cat of vendorCatsLower) {
    const synonyms = CUISINE_SYNONYMS[cat] || []
    if (synonyms.some(s => prefLower.includes(s))) {
      return { level: 'green', detail: `Related match: ${cat}` }
    }
    for (const [key, syns] of Object.entries(CUISINE_SYNONYMS)) {
      if (prefLower.includes(key) && syns.some(s => cat.includes(s))) {
        return { level: 'green', detail: `Related match: ${cat} \u2194 ${key}` }
      }
    }
  }

  // If organizer specified preferences and we found nothing, that's a real mismatch
  // Yellow if preferences were vague (short text), red if specific (multiple words/categories)
  const wordCount = cuisinePreferences.trim().split(/[\s,]+/).length
  if (wordCount >= 3) {
    return { level: 'red', detail: `No match for "${cuisinePreferences}" — vendor categories: ${vendorCategories.join(', ') || 'none'}` }
  }
  return { level: 'yellow', detail: 'No direct match — may still be a fit' }
}

export function scoreVendorMatch(
  vendor: VendorMatchInput,
  event: {
    cuisine_preferences: string | null
    headcount: number
    expected_meal_count: number | null
    vendor_count: number
    event_start_time: string | null
    event_end_time: string | null
    children_present?: boolean
    event_type?: string | null
  }
): VendorMatchResult {
  const numWaves = calculateWaveCount(event.event_start_time, event.event_end_time)
  const eventHours = calculateEventHours(event.event_start_time, event.event_end_time)
  const mealsPerVendor = Math.ceil((event.expected_meal_count || event.headcount) / event.vendor_count)

  const cuisine = scoreCuisineMatch(vendor.listing_categories, event.cuisine_preferences)

  const vendorCapacity = vendor.max_headcount_per_wave * numWaves
  let capacity_fit: ScoreLevel
  let capacity_detail: string
  if (vendorCapacity >= mealsPerVendor) {
    capacity_fit = 'green'
    capacity_detail = `Can serve ${vendorCapacity} meals (${vendor.max_headcount_per_wave}/wave \u00d7 ${numWaves} waves) — need ~${mealsPerVendor}`
  } else if (vendorCapacity >= mealsPerVendor * 0.8) {
    capacity_fit = 'yellow'
    capacity_detail = `Capacity ${vendorCapacity} is tight for ~${mealsPerVendor} allocated meals`
  } else {
    capacity_fit = 'red'
    capacity_detail = `Capacity ${vendorCapacity} is under the ~${mealsPerVendor} allocated meals`
  }

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

  // Lead time advantage: 15-min vendors are more valuable for events
  const leadTime = vendor.pickup_lead_minutes || 30
  const lead_time_advantage = leadTime <= 15
  const lead_time_detail = lead_time_advantage
    ? '15-min service — faster throughput, better for events'
    : '30-min service — standard throughput'

  // --- Deal-breaker checks (data-driven, based on captured fields) ---
  const deal_breakers: string[] = []

  // Strong odors at children's events — cooking smells can be overwhelming for kids
  if (vendor.strong_odors && event.children_present) {
    deal_breakers.push('Strong cooking odors at event with children present')
  }

  // Standard (loud) generator at corporate/indoor-likely events
  if (vendor.requires_generator && vendor.generator_type === 'standard') {
    const quietRequired = ['corporate_lunch', 'team_building', 'private_party']
    if (event.event_type && quietRequired.includes(event.event_type)) {
      deal_breakers.push('Loud generator at corporate/private event (quiet inverter required)')
    }
  }

  // Perishable products + long event = food safety risk
  const isLongEvent = eventHours >= 4
  if (isLongEvent && vendor.food_perishability === 'immediate') {
    deal_breakers.push('Immediate-perishability food at 4+ hour event — food safety risk')
  }

  // Warnings (tracked but not deal-breakers)
  const warnings: string[] = []

  if (isLongEvent && vendor.food_perishability === 'refrigerated') {
    warnings.push('Refrigerated products at 4+ hour event — verify vendor has power/cooling plan')
  }

  // Weather-sensitive FM vendor at likely outdoor event — flag but don't exclude
  const outdoorTypes = ['festival', 'grand_opening']
  if (vendor.seating_recommended && event.event_type && outdoorTypes.includes(event.event_type)) {
    warnings.push('Weather-sensitive setup at likely outdoor event — confirm covered space available')
  }

  // High cancellation rate = unreliable for events (events can't recover from no-shows)
  if (vendor.cancellation_rate >= 25) {
    deal_breakers.push(`High cancellation rate (${vendor.cancellation_rate}%) — event reliability risk`)
  }

  const ratingScore = vendor.average_rating || 3.0
  const ratingWeight = Math.min(vendor.rating_count / 20, 1)
  const reliabilityScore = 5 * (1 - vendor.cancellation_rate / 100)
  // Lead time bonus: 15-min vendors get +0.3 to platform score
  const leadBonus = lead_time_advantage ? 0.3 : 0
  const platformScore = Math.round(
    ((ratingScore * ratingWeight + 3.0 * (1 - ratingWeight)) * 0.6 + reliabilityScore * 0.4 + leadBonus) * 10
  ) / 10

  return {
    vendor_id: vendor.vendor_id,
    business_name: vendor.business_name,
    cuisine_match: cuisine.level,
    capacity_fit,
    runtime_fit,
    deal_breakers,
    warnings,
    platform_score: Math.min(platformScore, 5.0),
    tier: vendor.tier,
    experienced: vendor.has_event_experience,
    lead_time_advantage,
    details: {
      cuisine_match_detail: cuisine.detail,
      capacity_detail,
      runtime_detail,
      score_detail: `Rating: ${vendor.average_rating?.toFixed(1) || 'N/A'} (${vendor.rating_count} reviews) \u2022 Cancellation: ${vendor.cancellation_rate}%`,
      lead_time_detail,
    },
  }
}
