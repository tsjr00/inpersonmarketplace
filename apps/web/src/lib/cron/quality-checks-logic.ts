/**
 * Quality Checks Logic — Dedup + Grouping
 *
 * Extracted from: src/app/api/cron/vendor-quality-checks/route.ts
 * Purpose: Build dismissal sets, filter findings, group by vendor,
 * and format notification summaries.
 *
 * Pure functions — no DB, no side effects.
 */

/** Minimal shape needed by these functions (compatible with QualityFinding from quality-checks.ts) */
interface FindingLike {
  vendor_profile_id: string
  vertical_id: string
  check_type: string
  reference_key: string
  severity: string
  title: string
}

/**
 * Build a Set of "vendorId:checkType:refKey" strings from recent dismissals.
 */
export function buildDismissalKeySet(
  dismissals: Array<{ vendor_profile_id: string; check_type: string; reference_key: string }>,
): Set<string> {
  return new Set(
    dismissals.map(d => `${d.vendor_profile_id}:${d.check_type}:${d.reference_key}`)
  )
}

/**
 * Filter out findings that appear in the dismissal set.
 */
export function filterUndismissedFindings<T extends { vendor_profile_id: string; check_type: string; reference_key: string }>(
  findings: T[],
  dismissedKeys: Set<string>,
): T[] {
  return findings.filter(
    f => !dismissedKeys.has(`${f.vendor_profile_id}:${f.check_type}:${f.reference_key}`)
  )
}

/**
 * Group findings by vendor_profile_id. Returns a Map with vendor ID as key
 * and { vertical, count, findings[] } as value.
 */
export function groupFindingsByVendor<T extends FindingLike>(
  findings: T[],
): Map<string, { vertical: string; count: number; findings: T[] }> {
  const map = new Map<string, { vertical: string; count: number; findings: T[] }>()
  for (const f of findings) {
    const existing = map.get(f.vendor_profile_id)
    if (existing) {
      existing.count++
      existing.findings.push(f)
    } else {
      map.set(f.vendor_profile_id, {
        vertical: f.vertical_id,
        count: 1,
        findings: [f],
      })
    }
  }
  return map
}

/** Severity icons for notification summaries */
const SEVERITY_ICONS: Record<string, string> = {
  action_required: '[!]',
  heads_up: '[i]',
  suggestion: '[~]',
}

/**
 * Format a list of findings into a readable summary string.
 * Limited to maxItems (default 5) findings.
 */
export function formatFindingsSummary(
  findings: FindingLike[],
  maxItems = 5,
): string {
  return findings
    .slice(0, maxItems)
    .map(f => `${SEVERITY_ICONS[f.severity] || '-'} ${f.title}`)
    .join('\n')
}
