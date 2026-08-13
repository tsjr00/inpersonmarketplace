/**
 * PAIRED-RULES COVERAGE — the mechanical half of lib/paired-rules.ts.
 *
 * Runs in pre-commit. Fails the commit when:
 *   1. a `@paired-rule <key>` tag in the tree names a rule that is not
 *      registered (orphan tag — someone invented a key or typo'd one),
 *   2. a registered rule has fewer than TWO tagged sites (a pair that lost a
 *      side is exactly the failure this system exists to catch — deleting a
 *      surface must force de-registering the rule, visibly, in the same diff),
 *   3. a registered rule's behavioural-test pointer is dead (file missing or
 *      marker string absent) — registration without a behavioural test is
 *      decoration, so the pointer must stay real.
 *
 * What this deliberately does NOT do: verify the surfaces actually AGREE.
 * That is the behavioural test's job (clause 3 guarantees one exists). This
 * test only guarantees the wiring cannot rot silently.
 *
 * Scope: apps/web/src plus supabase/migrations (including applied/), because
 * app ↔ SQL pairs are the ones that can never share an implementation — the
 * SQL side of a pair is tagged in the migration file that defines it.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { PAIRED_RULES } from '../paired-rules'

const WEB_ROOT = path.resolve(__dirname, '../..')          // apps/web/src
const MIGRATIONS_ROOT = path.resolve(__dirname, '../../../../../supabase/migrations')

const TAG_RE = /@paired-rule\s+([a-z0-9-]+)/g

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, out)
    else if (exts.some(e => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

/** key → list of "relative/path:line" tag sites */
function collectTags(): Map<string, string[]> {
  const sites = new Map<string, string[]>()
  const files = [
    ...walk(WEB_ROOT, ['.ts', '.tsx']),
    ...walk(MIGRATIONS_ROOT, ['.sql']),
  ]
  for (const file of files) {
    // The registry and this test talk ABOUT tags; their mentions are not sites.
    if (file.endsWith('paired-rules.ts') || file.endsWith('paired-rules-coverage.test.ts')) continue
    const text = fs.readFileSync(file, 'utf-8')
    if (!text.includes('@paired-rule')) continue
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(TAG_RE)) {
        const key = m[1]
        if (!sites.has(key)) sites.set(key, [])
        sites.get(key)!.push(`${path.relative(path.resolve(WEB_ROOT, '..'), file)}:${i + 1}`)
      }
    }
  }
  return sites
}

const tagSites = collectTags()
const registeredKeys = new Set(PAIRED_RULES.map(r => r.key))

describe('Paired-rules coverage', () => {
  it('every @paired-rule tag in the tree names a registered rule', () => {
    const orphans: string[] = []
    for (const [key, sites] of tagSites) {
      if (!registeredKeys.has(key)) orphans.push(`${key} (${sites.join(', ')})`)
    }
    expect(orphans,
      'Orphan @paired-rule tag(s) — register the rule in lib/paired-rules.ts or fix the key'
    ).toEqual([])
  })

  it('every registered rule has at least two tagged sites', () => {
    const short: string[] = []
    for (const rule of PAIRED_RULES) {
      const count = tagSites.get(rule.key)?.length ?? 0
      if (count < 2) {
        short.push(`${rule.key}: ${count} site(s) — ${count === 0 ? 'no tags found' : `only ${tagSites.get(rule.key)!.join(', ')}`}`)
      }
    }
    expect(short,
      'A pair lost a side. Either re-tag the surface that lost its tag, or — if a surface was ' +
      'genuinely removed — de-register the rule in lib/paired-rules.ts IN THIS COMMIT so the diff shows it'
    ).toEqual([])
  })

  it('every registered rule points at a real behavioural test', () => {
    const dead: string[] = []
    for (const rule of PAIRED_RULES) {
      const testPath = path.resolve(WEB_ROOT, '..', rule.behaviouralTest.file)
      if (!fs.existsSync(testPath)) {
        dead.push(`${rule.key}: file missing (${rule.behaviouralTest.file})`)
        continue
      }
      const text = fs.readFileSync(testPath, 'utf-8')
      if (!text.includes(rule.behaviouralTest.marker)) {
        dead.push(`${rule.key}: marker "${rule.behaviouralTest.marker}" not found in ${rule.behaviouralTest.file}`)
      }
    }
    expect(dead,
      'A behavioural-test pointer is dead. The behavioural test is what actually pins the pair — ' +
      'restore it or update the pointer; do not delete the pointer'
    ).toEqual([])
  })

  it('registered keys are unique and kebab-case', () => {
    const keys = PAIRED_RULES.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})
