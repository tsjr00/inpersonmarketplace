/**
 * TIC (Taxability Information Code) Mapping
 *
 * Maps our product categories to TaxCloud TIC codes.
 * TIC codes determine how each item is taxed in the destination state.
 *
 * IMPORTANT: These codes should be verified against TaxCloud's current
 * TIC list at https://app.taxcloud.com/tic after creating the account.
 * TIC definitions are maintained by the states and can change.
 *
 * For Texas:
 * - Prepared food for immediate consumption = TAXABLE (TX Tax Code 151.314)
 * - Food and food ingredients for home consumption = EXEMPT
 * - Non-food items (plants, crafts, art, etc.) = TAXABLE
 *
 * Reference: https://docs.taxcloud.com/guides/core-concepts/taxability-information-codes-ti-cs
 */

// ── Common TIC Codes ─────────────────────────────────────────────────────
//
// TODO: Verify these codes in TaxCloud dashboard after account creation.
// The codes below are based on SSUTA standard TIC categories.
// TaxCloud may use slightly different numbering — confirm before go-live.

export const TIC_CODES = {
  /** General tangible personal property — fully taxable in all states */
  GENERAL_TAXABLE: 0,

  /** Food and food ingredients for home consumption — exempt in most states including TX */
  FOOD_AND_INGREDIENTS: 40030,

  /** Prepared food for immediate consumption — taxable in TX and most states */
  PREPARED_FOOD: 41010,

  /** Candy — taxable in many states (separate from food ingredients) */
  CANDY: 40010,

  /** Dietary supplements — taxable in most states */
  DIETARY_SUPPLEMENTS: 40020,

  /** Clothing — taxable in TX (some states exempt) */
  CLOTHING: 20010,
} as const

// ── Category → TIC Mapping ──────────────────────────────────────────────

/**
 * Maps our marketplace product categories to TIC codes.
 *
 * Uses the `is_taxable` flag on the listing as the primary signal,
 * with category as a fallback for determining the correct TIC.
 *
 * For FT (food trucks): all items are prepared food (TIC 41010)
 * For FM (farmers market): depends on category + is_taxable flag
 */

// FM categories that are ALWAYS food ingredients (exempt when is_taxable=false)
const FOOD_INGREDIENT_CATEGORIES = [
  'Produce',
  'Dairy & Eggs',
  'Pantry Staples',
]

// FM categories that are ALWAYS prepared food (taxable)
const PREPARED_FOOD_CATEGORIES = [
  'Prepared Foods',
]

// FM categories that are NEVER food (always general taxable)
const NON_FOOD_CATEGORIES = [
  'Plants & Flowers',
  'Wellness & Personal Care',
  'Art & Handmade',
  'Home & Living',
]

// FM categories where taxability depends on preparation method
// (is_taxable flag on the listing determines which TIC to use)
const CONDITIONAL_FOOD_CATEGORIES = [
  'Meat & Seafood',
  'Baked Goods',
]

/**
 * Get the TIC code for a listing based on its vertical, category, and taxability.
 *
 * @param vertical - 'food_trucks' or 'farmers_market'
 * @param category - Product category from the listing
 * @param isTaxable - The is_taxable flag from the listing
 * @returns TIC code to send to TaxCloud
 */
export function getTICForListing(
  vertical: string,
  category: string | null,
  isTaxable: boolean
): number {
  // FT: everything is prepared food for immediate consumption
  if (vertical === 'food_trucks') {
    return TIC_CODES.PREPARED_FOOD
  }

  // FM: map by category
  if (!category) {
    // No category — use is_taxable flag as fallback
    return isTaxable ? TIC_CODES.GENERAL_TAXABLE : TIC_CODES.FOOD_AND_INGREDIENTS
  }

  if (PREPARED_FOOD_CATEGORIES.includes(category)) {
    return TIC_CODES.PREPARED_FOOD
  }

  if (NON_FOOD_CATEGORIES.includes(category)) {
    return TIC_CODES.GENERAL_TAXABLE
  }

  if (FOOD_INGREDIENT_CATEGORIES.includes(category)) {
    // Food ingredients — exempt when sold for home consumption
    // The is_taxable flag should already be false for these, but TIC is what matters
    return TIC_CODES.FOOD_AND_INGREDIENTS
  }

  if (CONDITIONAL_FOOD_CATEGORIES.includes(category)) {
    // Meat & Baked Goods: taxable if prepared for immediate consumption,
    // exempt if sold for home consumption. is_taxable flag determines this.
    return isTaxable ? TIC_CODES.PREPARED_FOOD : TIC_CODES.FOOD_AND_INGREDIENTS
  }

  // Unknown category — fall back to is_taxable flag
  return isTaxable ? TIC_CODES.GENERAL_TAXABLE : TIC_CODES.FOOD_AND_INGREDIENTS
}
