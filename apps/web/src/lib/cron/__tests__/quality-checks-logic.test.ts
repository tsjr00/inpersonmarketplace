/**
 * Quality Checks Logic Tests
 *
 * Tests pure functions extracted from vendor-quality-checks route.
 * Covers: IR-R21 (vendor quality alerts), IR-R26 (finding dedup)
 *
 * Run: npx vitest run src/lib/cron/__tests__/quality-checks-logic.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildDismissalKeySet,
  filterUndismissedFindings,
  groupFindingsByVendor,
  formatFindingsSummary,
} from '../quality-checks-logic'

interface TestFinding {
  vendor_profile_id: string
  vertical_id: string
  check_type: string
  reference_key: string
  severity: string
  title: string
  description: string
}

function makeFinding(overrides: Partial<TestFinding> = {}): TestFinding {
  return {
    vendor_profile_id: 'v1',
    vertical_id: 'food_trucks',
    check_type: 'schedule_conflict',
    reference_key: 'listing-abc',
    severity: 'action_required',
    title: 'Schedule conflict found',
    description: 'Two listings overlap on Saturday',
    ...overrides,
  }
}

describe('buildDismissalKeySet', () => {
  it('builds keys in vendor:type:ref format', () => {
    const dismissals = [
      { vendor_profile_id: 'v1', check_type: 'schedule_conflict', reference_key: 'listing-abc' },
    ]
    const keys = buildDismissalKeySet(dismissals)
    expect(keys.has('v1:schedule_conflict:listing-abc')).toBe(true)
    expect(keys.size).toBe(1)
  })

  it('handles empty dismissals', () => {
    expect(buildDismissalKeySet([]).size).toBe(0)
  })

  it('deduplicates identical dismissals', () => {
    const dismissals = [
      { vendor_profile_id: 'v1', check_type: 'a', reference_key: 'x' },
      { vendor_profile_id: 'v1', check_type: 'a', reference_key: 'x' },
    ]
    expect(buildDismissalKeySet(dismissals).size).toBe(1)
  })
})

describe('filterUndismissedFindings', () => {
  it('filters out dismissed findings', () => {
    const dismissed = new Set(['v1:schedule_conflict:listing-abc'])
    const findings = [
      makeFinding(),
      makeFinding({ vendor_profile_id: 'v2', reference_key: 'listing-xyz' }),
    ]
    const result = filterUndismissedFindings(findings, dismissed)
    expect(result).toHaveLength(1)
    expect(result[0].vendor_profile_id).toBe('v2')
  })

  it('keeps all findings when nothing dismissed', () => {
    const findings = [makeFinding(), makeFinding({ reference_key: 'other' })]
    const result = filterUndismissedFindings(findings, new Set())
    expect(result).toHaveLength(2)
  })
})

describe('groupFindingsByVendor', () => {
  it('groups findings by vendor_profile_id', () => {
    const findings = [
      makeFinding({ vendor_profile_id: 'v1' }),
      makeFinding({ vendor_profile_id: 'v1', reference_key: 'other' }),
      makeFinding({ vendor_profile_id: 'v2' }),
    ]
    const groups = groupFindingsByVendor(findings)
    expect(groups.size).toBe(2)
    expect(groups.get('v1')!.count).toBe(2)
    expect(groups.get('v1')!.findings).toHaveLength(2)
    expect(groups.get('v2')!.count).toBe(1)
  })

  it('preserves vertical from first finding', () => {
    const findings = [
      makeFinding({ vendor_profile_id: 'v1', vertical_id: 'food_trucks' }),
    ]
    const groups = groupFindingsByVendor(findings)
    expect(groups.get('v1')!.vertical).toBe('food_trucks')
  })

  it('empty findings → empty map', () => {
    expect(groupFindingsByVendor([]).size).toBe(0)
  })
})

describe('formatFindingsSummary', () => {
  it('formats with severity icons', () => {
    const findings = [
      makeFinding({ severity: 'action_required', title: 'Problem A' }),
      makeFinding({ severity: 'heads_up', title: 'Note B' }),
      makeFinding({ severity: 'suggestion', title: 'Tip C' }),
    ]
    const summary = formatFindingsSummary(findings)
    expect(summary).toBe('[!] Problem A\n[i] Note B\n[~] Tip C')
  })

  it('limits to 5 items by default', () => {
    const findings = Array.from({ length: 8 }, (_, i) =>
      makeFinding({ title: `Finding ${i}`, reference_key: `ref-${i}` })
    )
    const lines = formatFindingsSummary(findings).split('\n')
    expect(lines).toHaveLength(5)
  })

  it('respects custom maxItems', () => {
    const findings = Array.from({ length: 8 }, (_, i) =>
      makeFinding({ title: `F${i}`, reference_key: `r-${i}` })
    )
    const lines = formatFindingsSummary(findings, 3).split('\n')
    expect(lines).toHaveLength(3)
  })

  it('unknown severity → dash', () => {
    const findings = [makeFinding({ severity: 'other', title: 'X' })]
    expect(formatFindingsSummary(findings)).toBe('- X')
  })
})
