/**
 * Type definitions + category metadata for the post-market survey
 * system (mig 147 / Phase E).
 *
 * Categories are organized so:
 *   - Aggregation queries on the manager dashboard can iterate
 *     CATEGORY_DEFINITIONS to render "avg rating · N responses" cards
 *     per category
 *   - The survey form pages iterate the same list to render question
 *     cards in a consistent order
 *   - Funder reports (future) can use the `funderRelevance` flag to
 *     pick "headline" categories
 */

export type SurveyKind = 'vendor' | 'buyer'

/**
 * Shape of a row from the market_surveys table. NULL-able fields
 * reflect the pre-submission state. The discriminator field `kind`
 * is what tells you which rating_* columns to read.
 */
export interface MarketSurveyRow {
  id: string

  kind: SurveyKind
  vendor_profile_id: string | null
  buyer_user_id: string | null

  market_id: string
  market_date: string // YYYY-MM-DD

  access_token: string | null
  expires_at: string // ISO 8601

  rating_overall: number | null

  // Vendor-only
  rating_foot_traffic: number | null
  rating_sales: number | null
  rating_market_organization: number | null
  rating_manager_support: number | null

  // Buyer-only
  rating_variety: number | null
  rating_quality: number | null
  rating_atmosphere: number | null
  rating_layout: number | null
  rating_accessibility: number | null

  comment: string | null
  submitted_at: string | null

  notified_at: string | null
  created_at: string
}

/**
 * Category metadata. Each category has:
 *   - dbColumn: the column name on market_surveys
 *   - label: short display label (form questions + dashboard cards)
 *   - description: longer text shown under the rating widget
 *   - kinds: which audiences see this category (the "overall" rating
 *     is shared; everything else is kind-specific)
 *   - funderRelevant: TRUE = this category is one we'd surface in a
 *     funder report. Used by future export tooling.
 */
export interface CategoryDefinition {
  dbColumn: keyof MarketSurveyRow
  label: string
  description: string
  kinds: readonly SurveyKind[]
  funderRelevant: boolean
}

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  // Shared
  {
    dbColumn: 'rating_overall',
    label: 'Overall experience',
    description: 'Your overall rating of this market day',
    kinds: ['vendor', 'buyer'],
    funderRelevant: true,
  },

  // Buyer-only — 5 categories
  {
    dbColumn: 'rating_variety',
    label: 'Variety of vendors',
    description: 'Range and diversity of products available',
    kinds: ['buyer'],
    funderRelevant: true,
  },
  {
    dbColumn: 'rating_quality',
    label: 'Product quality & freshness',
    description: 'Quality of what was offered or what you bought',
    kinds: ['buyer'],
    funderRelevant: true,
  },
  {
    dbColumn: 'rating_atmosphere',
    label: 'Atmosphere & community feel',
    description: 'Vibe, music, sense of community',
    kinds: ['buyer'],
    funderRelevant: true,
  },
  {
    dbColumn: 'rating_layout',
    label: 'Layout & organization',
    description: 'How easy the market was to navigate',
    kinds: ['buyer'],
    funderRelevant: false,
  },
  {
    dbColumn: 'rating_accessibility',
    label: 'Accessibility',
    description: 'Parking, mobility access, restrooms',
    kinds: ['buyer'],
    funderRelevant: true,
  },

  // Vendor-only — 4 categories (plus the shared overall = 5 total for vendor)
  {
    dbColumn: 'rating_foot_traffic',
    label: 'Foot traffic',
    description: 'Number of shoppers at the market',
    kinds: ['vendor'],
    funderRelevant: true,
  },
  {
    dbColumn: 'rating_sales',
    label: 'Sales for the day',
    description: 'How well your products sold',
    kinds: ['vendor'],
    funderRelevant: true,
  },
  {
    dbColumn: 'rating_market_organization',
    label: 'Market organization',
    description: 'Setup, layout, signage, scheduling',
    kinds: ['vendor'],
    funderRelevant: false,
  },
  {
    dbColumn: 'rating_manager_support',
    label: 'Market manager support',
    description: 'Communication and on-site help from the manager',
    kinds: ['vendor'],
    funderRelevant: false,
  },
] as const

/**
 * Helper: get the category definitions for a given audience, in the
 * order they should appear on the form. "Overall" always comes LAST
 * so the buyer/vendor anchors their final headline rating after
 * thinking through the specifics.
 */
export function getCategoriesForKind(kind: SurveyKind): CategoryDefinition[] {
  const specific = CATEGORY_DEFINITIONS.filter(
    (c) => c.kinds.includes(kind) && c.dbColumn !== 'rating_overall'
  )
  const overall = CATEGORY_DEFINITIONS.find((c) => c.dbColumn === 'rating_overall')!
  return [...specific, overall]
}

/**
 * Validates a submission payload against the schema's expectations for
 * a given kind. Returns null on success, or a string describing the
 * first problem found.
 */
export function validateSurveySubmission(
  kind: SurveyKind,
  payload: Partial<Pick<
    MarketSurveyRow,
    | 'rating_overall'
    | 'rating_foot_traffic'
    | 'rating_sales'
    | 'rating_market_organization'
    | 'rating_manager_support'
    | 'rating_variety'
    | 'rating_quality'
    | 'rating_atmosphere'
    | 'rating_layout'
    | 'rating_accessibility'
    | 'comment'
  >>
): string | null {
  const required = getCategoriesForKind(kind)
  for (const cat of required) {
    const value = payload[cat.dbColumn as keyof typeof payload] as number | null | undefined
    if (value === null || value === undefined) {
      return `${cat.label} is required.`
    }
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return `${cat.label} must be an integer between 1 and 5.`
    }
  }

  if (payload.comment !== undefined && payload.comment !== null) {
    if (typeof payload.comment !== 'string') {
      return 'Comment must be a string.'
    }
    if (payload.comment.length > 2000) {
      return 'Comment must be 2000 characters or fewer.'
    }
  }

  return null
}

/**
 * Builds the UPDATE payload to set on a market_surveys row when a
 * submission arrives. The category columns that don't apply to this
 * kind stay NULL (already their default). submitted_at gets the
 * current timestamp.
 */
export function buildSubmissionUpdate(
  kind: SurveyKind,
  payload: Parameters<typeof validateSurveySubmission>[1]
): Record<string, number | string | null> {
  const update: Record<string, number | string | null> = {
    submitted_at: new Date().toISOString(),
    comment: (payload.comment as string | null) ?? null,
  }
  for (const cat of getCategoriesForKind(kind)) {
    update[cat.dbColumn] = (payload[cat.dbColumn as keyof typeof payload] as number | undefined) ?? null
  }
  return update
}
