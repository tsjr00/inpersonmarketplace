/**
 * Types and helpers for the opt-in vendor agreement statement system
 * (migration 136). Backs the manager onboarding "agreement statements"
 * step and (in Phase B) the co-branded vendor signup acceptance flow.
 */

export type OptinCategory =
  | 'product_quality'
  | 'conduct'
  | 'insurance'
  | 'fees'
  | 'compliance'

export const OPTIN_CATEGORIES: ReadonlyArray<{ id: OptinCategory; label: string }> = [
  { id: 'product_quality', label: 'Product & Quality' },
  { id: 'conduct', label: 'Conduct' },
  { id: 'insurance', label: 'Insurance & Liability' },
  { id: 'fees', label: 'Fees & Payment' },
  { id: 'compliance', label: 'Compliance' },
]

/** Row shape from `market_optin_statement_catalog`. */
export interface OptinStatement {
  id: string
  category: OptinCategory
  statement: string
  placeholders: string[]
  active: boolean
  sort_order: number
}

/** Row shape from `market_optin_selections`. */
export interface OptinSelection {
  id: string
  market_id: string
  statement_id: string
  placeholder_values: Record<string, string | number>
  selected_at: string
}

/**
 * Substitutes {placeholder} tokens in a statement with manager-supplied
 * values. Tokens with no value pass through unchanged so it's visually
 * obvious which placeholders still need filling.
 *
 * Example:
 *   renderOptinStatement(
 *     'sourced within {distance_miles} miles',
 *     { distance_miles: 50 }
 *   )
 *   → 'sourced within 50 miles'
 */
export function renderOptinStatement(
  template: string,
  values: Record<string, string | number | undefined | null>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const v = values[key]
    if (v === undefined || v === null || v === '') return match
    return String(v)
  })
}

/** Validates that every placeholder declared by the statement has a value
 *  in the manager's input. Returns null if valid, otherwise a
 *  human-readable error referencing the missing placeholder. */
export function validateOptinSelection(
  statement: OptinStatement,
  values: Record<string, string | number>
): string | null {
  for (const ph of statement.placeholders) {
    const v = values[ph]
    if (
      v === undefined ||
      v === null ||
      (typeof v === 'string' && v.trim() === '')
    ) {
      return `Missing value for {${ph}}`
    }
  }
  return null
}

/** Groups statements by category in the canonical OPTIN_CATEGORIES order. */
export function groupStatementsByCategory(
  statements: OptinStatement[]
): Array<{ category: OptinCategory; label: string; statements: OptinStatement[] }> {
  const map = new Map<OptinCategory, OptinStatement[]>()
  for (const s of statements) {
    if (!map.has(s.category)) map.set(s.category, [])
    map.get(s.category)!.push(s)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }
  return OPTIN_CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({
    category: c.id,
    label: c.label,
    statements: map.get(c.id) || [],
  }))
}
