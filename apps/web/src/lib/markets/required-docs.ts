/**
 * Structured park required-documents list — tester finding 2026-07-23.
 *
 * Replaces the free-text markets.required_docs_note (mig 192) with a checkbox
 * list of the standard food-truck permits plus repeatable "Other" entries.
 * The standard labels come from the SAME onboarding source the vendor uploads
 * against (FOOD_TRUCK_PERMIT_REQUIREMENTS), so the operator's checklist and the
 * vendor's onboarding speak the same language by construction — exactly the
 * tester's ask ("make the language consistent in the onboarding for the vendor").
 *
 * Storage: markets.required_docs JSONB (mig 206), an array of entries. Display
 * only — the docs are not required to book (book-then-vet); this just tells the
 * truck what to bring. Enforcement stays human review, deliberately.
 *
 * FT-park-only: this feature exists on food_trucks markets, so the FT permit
 * taxonomy is the right (and only) source.
 */

import { FOOD_TRUCK_PERMIT_REQUIREMENTS } from '@/lib/onboarding/category-requirements'

/** A standard permit key from the onboarding taxonomy, or the custom bucket. */
export type RequiredDocKey =
  | 'mfu_permit'
  | 'cfm_certificate'
  | 'food_handler_card'
  | 'fire_safety_certificate'
  | 'commissary_agreement'
  | 'other'

/**
 * One required-document entry. Standard entries carry only their key (the label
 * is looked up from the taxonomy so it stays in sync). "Other" entries carry a
 * free-text label the operator typed.
 */
export interface RequiredDocEntry {
  key: RequiredDocKey
  /** Only meaningful (and required) when key === 'other'. */
  label?: string
}

/** The five standard options, label + help text pulled from onboarding. */
export const PARK_REQUIRED_DOC_OPTIONS: ReadonlyArray<{
  key: Exclude<RequiredDocKey, 'other'>
  label: string
  description: string
}> = FOOD_TRUCK_PERMIT_REQUIREMENTS.map((r) => ({
  key: r.docType as Exclude<RequiredDocKey, 'other'>,
  label: r.label,
  description: r.description,
}))

const STANDARD_KEYS = new Set<string>(PARK_REQUIRED_DOC_OPTIONS.map((o) => o.key))

/** Max custom "Other" entries an operator can add — keeps the list sane. */
export const MAX_CUSTOM_DOCS = 10
/** Max length of a single custom "Other" label. */
export const MAX_CUSTOM_DOC_LABEL = 120

/**
 * Human-readable label for any entry — standard keys resolve through the
 * taxonomy; "other" uses its typed label (falling back to a generic word).
 */
export function requiredDocLabel(entry: RequiredDocEntry): string {
  if (entry.key === 'other') return entry.label?.trim() || 'Other document'
  const opt = PARK_REQUIRED_DOC_OPTIONS.find((o) => o.key === entry.key)
  return opt?.label ?? entry.key
}

/**
 * Normalize/validate a raw stored or posted value into a clean entry array.
 * Drops unknown keys, de-dupes standard keys, trims + caps custom labels, and
 * drops "other" entries with no label. Tolerant by design — a malformed or
 * missing column (pre-migration) yields [].
 */
export function parseRequiredDocs(raw: unknown): RequiredDocEntry[] {
  if (!Array.isArray(raw)) return []
  const out: RequiredDocEntry[] = []
  const seenStandard = new Set<string>()
  let customCount = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = (item as { key?: unknown }).key
    if (typeof key !== 'string') continue
    if (key === 'other') {
      const label = (item as { label?: unknown }).label
      const clean = typeof label === 'string' ? label.trim().slice(0, MAX_CUSTOM_DOC_LABEL) : ''
      if (!clean) continue
      if (customCount >= MAX_CUSTOM_DOCS) continue
      customCount++
      out.push({ key: 'other', label: clean })
    } else if (STANDARD_KEYS.has(key)) {
      if (seenStandard.has(key)) continue
      seenStandard.add(key)
      out.push({ key: key as Exclude<RequiredDocKey, 'other'> })
    }
    // unknown keys are dropped
  }
  return out
}
