/**
 * Types for the market booth inventory system (migration 134).
 *
 * The inventory table tracks WHAT booths exist at a market and what they
 * cost per week. Vendor-to-booth assignments live separately on
 * `market_vendors.booth_number`.
 *
 * ⚠️ TAX DESIGN CONSTRAINT — ONE BUNDLED PRICE PER SPACE. DO NOT ADD LINE-ITEM
 * AMENITY CHARGES (power, water, tables, chairs, canopies, electricity, etc.).
 *
 * Texas Comptroller Pub. 96-211: "Booth fees, floor space fees and rental
 * charges for a space to sell or display taxable items are not subject to
 * sales tax." BUT the Comptroller's Tax Policy News (July 2021) is equally
 * explicit that this protection is lost per line item: "When stated separately
 * from booth fees, an event promoter must collect tax on the rental of tables,
 * chairs, electricity and power strips."
 *
 * So a separately-stated amenity charge is TAXABLE even though the space
 * itself is not — it would drag a currently tax-free product surface into
 * sales-tax collection, filing and audit scope. Operators are instructed to
 * price amenities INTO the space price. Amenities may be modeled as
 * descriptive ATTRIBUTES of a space (e.g. park spots carry power/water
 * booleans) — never as a priced add-on.
 *
 * If a future requirement genuinely needs a separate amenity charge, that is a
 * tax decision before it is a product decision: escalate, don't implement.
 */

/** Row shape returned from `market_booth_inventory` table.
 *
 *  Mig 258 (booth numbering Option U, owner 2026-09-20): a tier OWNS its booth
 *  labels — either a RANGE (label_prefix + label_start…label_end → "A1"…"A4")
 *  or a LIST (labels[] — the exact labels an existing market already paints).
 *  `count` is DERIVED from the labels by the DB trigger; a tier with no labels
 *  is not bookable until the manager numbers it. */
export interface BoothInventoryRow {
  id: string
  market_id: string
  size_label: string
  dimensions: string | null
  count: number
  weekly_price_cents: number
  created_at: string
  updated_at: string
  label_prefix?: string | null
  label_start?: number | null
  label_end?: number | null
  labels?: string[] | null
}

/** How a market numbers its booths (markets.booth_numbering_scheme, mig 258 N-10):
 *  'lettered' = a new market — every tier is a lettered range (A1…, B1…);
 *  'existing' = the market keeps the labels it already uses (prefix optional,
 *  lists allowed). null = not answered yet; tiers cannot be numbered until it is. */
export type BoothNumberingScheme = 'lettered' | 'existing'

/** Picker feed (GET booth-labels?inventory_id=…): one row per label of a size for a week. */
export type BoothLabelState = 'free' | 'placeholder' | 'booked' | 'assigned' | 'pinned' | 'own'
export interface BoothLabelStateRow {
  label: string
  state: BoothLabelState
  /** Business name of the holder for placeholder/booked/assigned/pinned. */
  holder?: string
  /** For 'assigned': the Saturday the holder is paid through. */
  paidThrough?: string
}

/** The two label shapes a tier can carry (mig 258). */
export type TierLabelsInput =
  | { shape: 'range'; prefix: string; start: number; end: number }
  | { shape: 'list'; labels: string[] }
  | null

/** Input shape used by manager onboarding / admin assignment to add or
 *  update a size tier. Manager picks size_label, dimensions, weekly price and
 *  (mig 258) the tier's booth labels; `count` is derived from the labels when
 *  they are set and only typed directly for a not-yet-numbered tier. */
export interface BoothInventoryInput {
  size_label: string
  dimensions?: string | null
  count: number
  weekly_price_cents: number
  labels?: TierLabelsInput
}

/** Materialize a tier's labels in order — the TS mirror of the DB function
 *  `booth_tier_labels(uuid)` (mig 258). Empty when the tier has no labels. */
export function tierLabels(row: Pick<BoothInventoryRow, 'label_prefix' | 'label_start' | 'label_end' | 'labels'>): string[] {
  if (Array.isArray(row.labels) && row.labels.length > 0) return [...row.labels]
  if (typeof row.label_start === 'number' && typeof row.label_end === 'number' && row.label_end >= row.label_start) {
    const prefix = row.label_prefix ?? ''
    const out: string[] = []
    for (let n = row.label_start; n <= row.label_end; n++) out.push(`${prefix}${n}`)
    return out
  }
  return []
}

/** "A1–A4" · "Pavilion, Corner" · "" (no labels). For the tier list + the map line. */
export function describeTierLabels(row: Pick<BoothInventoryRow, 'label_prefix' | 'label_start' | 'label_end' | 'labels'>): string {
  if (Array.isArray(row.labels) && row.labels.length > 0) {
    return row.labels.length <= 6 ? row.labels.join(', ') : `${row.labels.slice(0, 5).join(', ')}, … (${row.labels.length})`
  }
  if (typeof row.label_start === 'number' && typeof row.label_end === 'number') {
    const p = row.label_prefix ?? ''
    return row.label_start === row.label_end ? `${p}${row.label_start}` : `${p}${row.label_start}–${p}${row.label_end}`
  }
  return ''
}

/** Client + route validation of a tier's labels for the market's scheme —
 *  the same rules the DB trigger enforces (P0009 shape · P0013 letter), phrased
 *  for the manager. Returns null when valid. Overlap with other tiers and
 *  occupied-label checks are the DB's (they need the live rows). */
export function validateTierLabelsInput(labels: TierLabelsInput, scheme: BoothNumberingScheme | null): string | null {
  if (labels === null) return null
  if (!scheme) return 'Answer "new market or existing numbers?" first — it decides how booths can be numbered.'
  if (labels.shape === 'range') {
    const prefix = labels.prefix.trim()
    if (!Number.isInteger(labels.start) || !Number.isInteger(labels.end)) return 'First and last numbers must be whole numbers.'
    if (labels.start < 0) return 'Numbers start at 0 or above.'
    if (labels.end < labels.start) return `Last number (${labels.end}) is before first number (${labels.start}).`
    if (labels.end - labels.start + 1 > 500) return 'A size can hold at most 500 booths.'
    if (scheme === 'lettered' && !/^[A-Za-z]+$/.test(prefix)) return 'A new market numbers each size with a letter — e.g. A for A1, A2, A3.'
    if (prefix.length > 20) return 'The prefix is too long (20 characters max).'
    return null
  }
  if (scheme === 'lettered') return 'A new market numbers each size as a lettered range (A1, A2…) — lists are for markets keeping existing numbers.'
  const cleaned = labels.labels.map((l) => l.trim()).filter((l) => l.length > 0)
  if (cleaned.length === 0) return 'Enter at least one booth label.'
  if (cleaned.length > 500) return 'A size can hold at most 500 booths.'
  if (cleaned.some((l) => l.length > 50)) return 'Each label must be 50 characters or fewer.'
  const seen = new Set<string>()
  for (const l of cleaned) {
    if (seen.has(l)) return `"${l}" appears twice.`
    seen.add(l)
  }
  return null
}

/** Parse the manager's comma/newline-separated list into labels. */
export function parseLabelList(text: string): string[] {
  return text.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 0)
}

/** Read the label input off a request body (both inventory routes). null = "no labels / leave unnumbered". */
export function labelsInputFromBody(body: Record<string, unknown> | null | undefined): TierLabelsInput {
  const raw = body?.labels as Record<string, unknown> | null | undefined
  if (!raw || typeof raw !== 'object') return null
  if (raw.shape === 'range') {
    return {
      shape: 'range',
      prefix: typeof raw.prefix === 'string' ? raw.prefix.trim() : '',
      start: Number(raw.start),
      end: Number(raw.end),
    }
  }
  if (raw.shape === 'list') {
    const arr = Array.isArray(raw.labels) ? raw.labels : []
    return { shape: 'list', labels: arr.filter((x): x is string => typeof x === 'string') }
  }
  return null
}

/** The four label columns for an INSERT/UPDATE (mig 258). null input → all NULL (unnumbered tier). */
export function labelColumnsFor(labels: TierLabelsInput): {
  label_prefix: string | null; label_start: number | null; label_end: number | null; labels: string[] | null
} {
  if (!labels) return { label_prefix: null, label_start: null, label_end: null, labels: null }
  if (labels.shape === 'range') return { label_prefix: labels.prefix.trim(), label_start: labels.start, label_end: labels.end, labels: null }
  return { label_prefix: null, label_start: null, label_end: null, labels: labels.labels.map((l) => l.trim()).filter((l) => l.length > 0) }
}

/** The DB trigger's error codes (mig 258) → the sentence the manager reads. */
export function friendlyTierLabelError(code: string | undefined, message: string | undefined, sizeLabel: string): string | null {
  const msg = message ?? ''
  switch (code) {
    case 'P0009': return msg.replace(/^TIER_LABELS_SHAPE:\s*/, '') || 'Those booth numbers are not a valid range or list.'
    case 'P0010': return msg.replace(/^TIER_LABEL_OVERLAP:\s*/, '') || 'One of those numbers already belongs to another size.'
    case 'P0011': return (msg.replace(/^TIER_LABEL_OCCUPIED:\s*/, '') || 'A number you removed is still held or booked.') + ` Free it, then change the ${sizeLabel} numbers.`
    case 'P0013': return msg.replace(/^TIER_LETTER_REQUIRED:\s*/, '') || 'A new market numbers each size with a letter (A1, A2…).'
    case 'P0014': return 'Answer "new market or existing numbers?" at the top of this card before numbering booths.'
    default: return null
  }
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
  // Mig 258: with labels the count is derived (the trigger overwrites it), so
  // it is only validated for a not-yet-numbered tier.
  if (!input.labels) {
    if (!Number.isInteger(input.count) || input.count < 0) return 'Count must be a non-negative integer'
    if (input.count > 1000) return 'Count over 1000 looks unusual — check the value'
  }
  if (!Number.isInteger(input.weekly_price_cents) || input.weekly_price_cents < 0) {
    return 'Weekly price must be a non-negative integer (in cents)'
  }
  if (input.weekly_price_cents > 1_000_000) return 'Weekly price over $10,000 looks unusual — check the value'
  return null
}
