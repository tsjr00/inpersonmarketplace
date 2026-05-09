/**
 * Types for the market booth inventory system (migration 134).
 *
 * The inventory table tracks WHAT booths exist at a market and what they
 * cost per week. Vendor-to-booth assignments live separately on
 * `market_vendors.booth_number`.
 */

/** Row shape returned from `market_booth_inventory` table. */
export interface BoothInventoryRow {
  id: string
  market_id: string
  size_label: string
  dimensions: string | null
  count: number
  weekly_price_cents: number
  created_at: string
  updated_at: string
}

/** Input shape used by manager onboarding / admin assignment to add or
 *  update a size tier. Manager picks size_label, dimensions, count, and
 *  weekly price per row. */
export interface BoothInventoryInput {
  size_label: string
  dimensions?: string | null
  count: number
  weekly_price_cents: number
}

/** Aggregate summary used on the manager dashboard's overview card. */
export interface BoothInventorySummary {
  total_booths: number
  size_tier_count: number
  size_labels: string[]
  /** Sum of (count × weekly_price_cents) across all rows — what the
   *  manager could collect per week if every booth rents. */
  max_weekly_revenue_cents: number
}

/** Roll the per-row inventory into a summary suitable for a dashboard
 *  overview card. Pure function; no I/O. */
export function summarizeBoothInventory(rows: BoothInventoryRow[]): BoothInventorySummary {
  let total_booths = 0
  let max_weekly_revenue_cents = 0
  const size_labels: string[] = []
  for (const row of rows) {
    total_booths += row.count
    max_weekly_revenue_cents += row.count * row.weekly_price_cents
    size_labels.push(row.size_label)
  }
  return {
    total_booths,
    size_tier_count: rows.length,
    size_labels,
    max_weekly_revenue_cents,
  }
}

/** Validation rules for manager-supplied input. Returns null if valid,
 *  otherwise a human-readable error message. Application layer (admin
 *  UI + manager onboarding) should run this before insert. */
export function validateBoothInventoryInput(input: BoothInventoryInput): string | null {
  const trimmedLabel = input.size_label?.trim() ?? ''
  if (trimmedLabel.length === 0) return 'Size label is required'
  if (trimmedLabel.length > 50) return 'Size label must be 50 characters or fewer'
  if (!Number.isInteger(input.count) || input.count < 0) return 'Count must be a non-negative integer'
  if (input.count > 1000) return 'Count over 1000 looks unusual — check the value'
  if (!Number.isInteger(input.weekly_price_cents) || input.weekly_price_cents < 0) {
    return 'Weekly price must be a non-negative integer (in cents)'
  }
  if (input.weekly_price_cents > 1_000_000) return 'Weekly price over $10,000 looks unusual — check the value'
  return null
}
