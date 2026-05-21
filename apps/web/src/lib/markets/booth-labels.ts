/**
 * Booth-label parsing + range validation (mig 144 — auto-assignment).
 *
 * The market manager declares a single market-wide range of booth labels
 * at onboarding: a start label (e.g., "1", "A1", "Booth-1") and an end
 * label that shares the same prefix. The system generates the full
 * sequence by incrementing the trailing integer, and the auto-assignment
 * RPC picks the smallest unused label at booking time.
 *
 * Both the route-layer validator (POST /api/market-manager/[marketId]
 * /booth-labels) and the BoothInventoryManager UI use these helpers so
 * client + server stay in sync. The RPC parses the same format in PL/pgSQL.
 *
 * Pure functions; no I/O.
 */

export interface ParsedBoothLabel {
  /** Everything before the trailing digits. Can be empty. */
  prefix: string
  /** The trailing positive integer. */
  number: number
}

/**
 * Splits a booth label into prefix + trailing integer. Returns null if
 * the label has no trailing integer or has a leading sign / decimal.
 *
 * Examples:
 *   parseBoothLabel("1")        → { prefix: "",       number: 1 }
 *   parseBoothLabel("11")       → { prefix: "",       number: 11 }
 *   parseBoothLabel("A1")       → { prefix: "A",      number: 1 }
 *   parseBoothLabel("Booth-7")  → { prefix: "Booth-", number: 7 }
 *   parseBoothLabel("ABC")      → null  (no trailing digits)
 *   parseBoothLabel("")         → null  (empty)
 *   parseBoothLabel("3.5")      → null  (non-integer)
 *   parseBoothLabel("-1")       → null  (we read trailing digits — would be "" / 1, treat as bad input)
 */
export function parseBoothLabel(label: string | null | undefined): ParsedBoothLabel | null {
  if (typeof label !== 'string') return null
  const trimmed = label.trim()
  if (trimmed.length === 0) return null

  // Trailing digits — non-greedy prefix capture then 1+ digits at end of string.
  const match = trimmed.match(/^(.*?)(\d+)$/)
  if (!match) return null

  const prefix = match[1]
  const numberStr = match[2]

  // Defensive: reject if the prefix ends with "-" + we'd otherwise parse
  // "abc-5" as negative — but JS regex above captures the "-" into prefix,
  // so number stays positive. Still, reject "-N" outright (prefix would be
  // empty and number positive — bad input from the user).
  if (prefix === '' && trimmed.startsWith('-')) return null

  const number = Number.parseInt(numberStr, 10)
  if (!Number.isFinite(number) || number < 0) return null

  return { prefix, number }
}

export interface RangeValidationContext {
  /** Sum of market_booth_inventory.count across all tiers at this market. */
  totalCount: number
}

/**
 * Validates a (start, end) pair against the market's inventory total.
 * Returns null when valid, otherwise a human-readable error string.
 *
 * Both labels must:
 *   - Parse successfully (parseBoothLabel returns non-null)
 *   - Share the same prefix
 *   - end.number >= start.number
 *   - end.number - start.number + 1 === totalCount
 *
 * Empty/whitespace inputs return an error (the route allows clearing
 * by passing nulls explicitly — this helper validates set values only).
 */
export function validateBoothLabelRange(
  start: string,
  end: string,
  ctx: RangeValidationContext
): string | null {
  const parsedStart = parseBoothLabel(start)
  if (!parsedStart) {
    return `First booth label "${start}" must end with a number. Examples: "1", "A1", "Booth-1".`
  }

  const parsedEnd = parseBoothLabel(end)
  if (!parsedEnd) {
    return `Last booth label "${end}" must end with a number. Examples: "8", "A8", "Booth-8".`
  }

  if (parsedStart.prefix !== parsedEnd.prefix) {
    return `First and last labels must share the same prefix. "${start}" starts with "${parsedStart.prefix}" but "${end}" starts with "${parsedEnd.prefix}".`
  }

  if (parsedEnd.number < parsedStart.number) {
    return `Last label number (${parsedEnd.number}) must be greater than or equal to first label number (${parsedStart.number}).`
  }

  const rangeCount = parsedEnd.number - parsedStart.number + 1
  if (rangeCount !== ctx.totalCount) {
    return `You declared booths ${start} through ${end} (${rangeCount} booth${rangeCount === 1 ? '' : 's'}), but your inventory adds up to ${ctx.totalCount} booth${ctx.totalCount === 1 ? '' : 's'}. Adjust either the range or your size-tier counts so they match.`
  }

  return null
}

/**
 * Builds the full label sequence for display/preview purposes (e.g., the
 * client UI showing "Generated: A1, A2, A3, …, A8"). Server-side label
 * generation lives inside the RPC and bypasses this helper.
 *
 * Returns empty array if the inputs don't form a valid range.
 */
export function generateBoothLabelSequence(start: string, end: string): string[] {
  const parsedStart = parseBoothLabel(start)
  const parsedEnd = parseBoothLabel(end)
  if (!parsedStart || !parsedEnd) return []
  if (parsedStart.prefix !== parsedEnd.prefix) return []
  if (parsedEnd.number < parsedStart.number) return []

  const labels: string[] = []
  for (let n = parsedStart.number; n <= parsedEnd.number; n++) {
    labels.push(`${parsedStart.prefix}${n}`)
  }
  return labels
}
