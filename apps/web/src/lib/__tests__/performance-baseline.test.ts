/**
 * Performance Baseline Tests
 *
 * PURPOSE: Prevent performance regressions by enforcing structural metrics
 * that are deterministic and measurable from code analysis alone.
 *
 * These tests verify:
 * 1. Database query count per page does not increase
 * 2. Sequential query depth (waterfall) does not increase
 * 3. Parallelization (Promise.all) is not removed
 * 4. Performance infrastructure files exist and are maintained
 * 5. Loading skeletons are not removed (they are not the problem)
 *
 * ABSOLUTE RULE: These tests assert what the performance baseline SHOULD be.
 * If the code violates a baseline, THAT IS A REGRESSION — not a reason to
 * update the test. See .claude/rules/no-performance-regression.md.
 *
 * To update baselines: Record before/after measurements, get user approval,
 * update PERFORMANCE_BASELINE.md, THEN update these tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const APPS_WEB = path.resolve(__dirname, '..', '..', '..')
const SRC = path.join(APPS_WEB, 'src')

// Helper: read a source file
function readPage(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), 'utf-8')
}

// Helper: count occurrences of a pattern in source
function countPattern(source: string, pattern: RegExp): number {
  return (source.match(pattern) || []).length
}

// Helper: check if a file exists
function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(APPS_WEB, relativePath))
}

// ─── PERF-R1: Browse Page Query Structure ──────────────────────────

describe('PERF-R1: Browse page query structure', () => {
  const browsePage = () => readPage('app/[vertical]/browse/page.tsx')

  it('parallelizes auth.getUser() with getLocale() via Promise.all', () => {
    const source = browsePage()
    // Must have a Promise.all containing both auth.getUser and getLocale
    expect(source).toMatch(/Promise\.all\(\[[\s\S]*?auth\.getUser\(\)[\s\S]*?getLocale\(\)[\s\S]*?\]\)/)
  })

  it('fetches buyer_tier and location fields in a single user_profiles query', () => {
    const source = browsePage()
    // The user_profiles query must select both buyer_tier and location fields
    expect(source).toMatch(/\.from\('user_profiles'\)[\s\S]*?\.select\([^)]*buyer_tier[^)]*preferred_latitude[^)]*\)/)
  })

  it('does NOT call getServerLocation (eliminated duplicate auth + profile queries)', () => {
    const source = browsePage()
    expect(source).not.toMatch(/getServerLocation\s*\(/)
  })

  it('does NOT import getServerLocation', () => {
    const source = browsePage()
    expect(source).not.toMatch(/import.*getServerLocation/)
  })

  it('calls get_listings_accepting_status RPC at most once when Available Now filter is active', () => {
    const source = browsePage()
    // Count RPC calls to get_listings_accepting_status
    const rpcCalls = countPattern(source, /\.rpc\(\s*['"]get_listings_accepting_status['"]/g)
    // There should be exactly 2 call sites in the code (one for available-now path, one for non-available path)
    // but they are mutually exclusive (if/else), so at most 1 executes per request
    expect(rpcCalls).toBe(2) // 2 call sites, but mutually exclusive
    // Verify they are mutually exclusive: one guarded by isAvailableNow, other by !isAvailableNow
    expect(source).toMatch(/if\s*\(isAvailableNow\b/)
    expect(source).toMatch(/if\s*\(paginatedListings\.length\s*>\s*0\s*&&\s*!isAvailableNow\)/)
  })
})

// ─── PERF-R2: Markets Page Parallelization ─────────────────────────

describe('PERF-R2: Markets page parallelization', () => {
  const marketsPage = () => readPage('app/[vertical]/markets/page.tsx')

  it('uses Promise.all for initial queries (location + markets + events)', () => {
    const source = marketsPage()
    const promiseAllCount = countPattern(source, /Promise\.all\s*\(\s*\[/g)
    expect(promiseAllCount).toBeGreaterThanOrEqual(1)
  })

  it('parallelizes location + market queries in the initial Promise.all', () => {
    const source = marketsPage()
    // The first Promise.all should contain getServerLocation and supabase queries
    const match = source.match(/Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/)
    expect(match).toBeTruthy()
    if (match) {
      const block = match[1]
      // Must contain location check and at least one supabase query
      expect(block).toMatch(/getServerLocation|supabase/)
    }
  })
})

// ─── PERF-R3: Vendors Page Parallelization ─────────────────────────

describe('PERF-R3: Vendors page parallelization', () => {
  const vendorsPage = () => readPage('app/[vertical]/vendors/page.tsx')

  it('uses at least 2 Promise.all blocks (two parallel phases)', () => {
    const source = vendorsPage()
    const promiseAllCount = countPattern(source, /Promise\.all\s*\(\s*\[/g)
    expect(promiseAllCount).toBeGreaterThanOrEqual(2)
  })
})

// ─── PERF-R4: Listing Detail Page Parallelization ──────────────────

describe('PERF-R4: Listing detail page parallelization', () => {
  const listingPage = () => readPage('app/[vertical]/listing/[listingId]/page.tsx')

  it('uses at least 2 Promise.all blocks (two parallel phases)', () => {
    const source = listingPage()
    const promiseAllCount = countPattern(source, /Promise\.all\s*\(\s*\[/g)
    expect(promiseAllCount).toBeGreaterThanOrEqual(2)
  })

  it('parallelizes listing fetch + availability RPC + auth in phase 1', () => {
    const source = listingPage()
    // First Promise.all should contain listing query, RPC, and auth
    const match = source.match(/Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/)
    expect(match).toBeTruthy()
    if (match) {
      const block = match[1]
      expect(block).toMatch(/\.from\(\s*['"]listings['"]/)
      expect(block).toMatch(/auth\.getUser\(\)/)
    }
  })
})

// ─── PERF-R5: Loading Skeletons Exist ──────────────────────────────

describe('PERF-R5: Loading skeletons must not be removed', () => {
  // Loading skeletons reveal existing latency — they are not the problem.
  // Removing them to "fix slowness" is cargo-cult optimization.
  // See PERFORMANCE_BASELINE.md for details.

  // Only test loading.tsx files that currently exist
  // Adding new ones is welcome; removing existing ones is a regression
  const hotPaths = [
    'app/[vertical]/browse/loading.tsx',
    'app/[vertical]/dashboard/loading.tsx',
    'app/[vertical]/listing/[listingId]/loading.tsx',
    'app/[vertical]/buyer/orders/loading.tsx',
    'app/[vertical]/checkout/loading.tsx',
  ]

  hotPaths.forEach(pagePath => {
    it(`${pagePath} exists`, () => {
      expect(fileExists(path.join('src', pagePath))).toBe(true)
    })
  })
})

// ─── PERF-R6: Performance Infrastructure ───────────────────────────

describe('PERF-R6: Performance infrastructure files exist', () => {
  it('PERFORMANCE_BASELINE.md exists', () => {
    expect(fileExists('.claude/PERFORMANCE_BASELINE.md')).toBe(true)
  })

  it('no-performance-regression rule exists', () => {
    expect(fileExists('.claude/rules/no-performance-regression.md')).toBe(true)
  })

  it('this test file exists (self-protecting)', () => {
    expect(fileExists('src/lib/__tests__/performance-baseline.test.ts')).toBe(true)
  })

  it('PERFORMANCE_BASELINE.md contains query structure table', () => {
    const content = fs.readFileSync(path.join(APPS_WEB, '.claude', 'PERFORMANCE_BASELINE.md'), 'utf-8')
    expect(content).toContain('Database Query Structure Per Page')
    expect(content).toContain('browse')
    expect(content).toContain('markets')
    expect(content).toContain('vendors')
    expect(content).toContain('dashboard')
  })

  it('PERFORMANCE_BASELINE.md contains change log', () => {
    const content = fs.readFileSync(path.join(APPS_WEB, '.claude', 'PERFORMANCE_BASELINE.md'), 'utf-8')
    expect(content).toContain('Change Log')
  })

  it('no-performance-regression rule contains action-bias warning', () => {
    const content = fs.readFileSync(
      path.join(APPS_WEB, '.claude', 'rules', 'no-performance-regression.md'),
      'utf-8'
    )
    expect(content).toContain('Action does not need to be taken just because it can be')
    expect(content).toContain('breach of responsibility')
  })
})

// ─── PERF-R7: Bundle Size Guard ────────────────────────────────────

describe('PERF-R7: Client bundle size guard', () => {
  it('total client JS chunks should not exceed 150', () => {
    // Baseline: 118 chunks as of 2026-03-16
    // Ceiling: 150 (25% headroom for new features)
    const chunksDir = path.join(APPS_WEB, '.next', 'static', 'chunks')
    if (!fs.existsSync(chunksDir)) {
      // .next may not exist in CI before build — skip gracefully
      // This test is most useful as a local pre-commit check
      return
    }
    const chunks = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'))
    expect(chunks.length).toBeLessThanOrEqual(150)
  })
})

// ─── PERF-R8: Schema Snapshot Staleness Guard ──────────────────────

describe('PERF-R8: Schema snapshot must document applied migrations', () => {
  const SUPABASE = path.resolve(APPS_WEB, '..', '..', 'supabase')
  const APPLIED_DIR = path.join(SUPABASE, 'migrations', 'applied')
  const SNAPSHOT_PATH = path.join(SUPABASE, 'SCHEMA_SNAPSHOT.md')

  // Migration filename pattern: YYYYMMDD_NNN_description.sql
  const MIGRATION_PATTERN = /^\d{8}_\d{3}_/

  it('SCHEMA_SNAPSHOT.md exists', () => {
    expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true)
  })

  it('every applied migration is referenced in SCHEMA_SNAPSHOT.md changelog', () => {
    if (!fs.existsSync(APPLIED_DIR)) return

    const snapshotContent = fs.readFileSync(SNAPSHOT_PATH, 'utf-8')
    const appliedFiles = fs.readdirSync(APPLIED_DIR)
      .filter(f => f.endsWith('.sql') && MIGRATION_PATTERN.test(f))

    const missing: string[] = []
    for (const file of appliedFiles) {
      // Extract the migration identifier (e.g., "20260316_084_add_vendor_tier_index")
      const migrationId = file.replace(/\.sql$/, '')
      if (!snapshotContent.includes(migrationId)) {
        missing.push(file)
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `SCHEMA_SNAPSHOT.md is STALE — ${missing.length} applied migration(s) not in changelog:\n` +
        missing.map(f => `  - ${f}`).join('\n') +
        '\n\nUpdate supabase/SCHEMA_SNAPSHOT.md before committing. ' +
        'See .claude/rules/schema-snapshot-mandatory.md'
      )
    }
  })

  it('SCHEMA_SNAPSHOT.md has a "Last Verified" date', () => {
    const content = fs.readFileSync(SNAPSHOT_PATH, 'utf-8')
    // Must contain a date in "Last Verified: YYYY-MM-DD" format
    expect(content).toMatch(/\*\*Last Verified:\*\*\s*\d{4}-\d{2}-\d{2}/)
  })
})

// ─── PERF-R9: Performance Baseline Staleness Guard ─────────────────

describe('PERF-R9: Performance baseline must not go stale', () => {
  const BASELINE_PATH = path.join(APPS_WEB, '.claude', 'PERFORMANCE_BASELINE.md')

  it('PERFORMANCE_BASELINE.md has a parseable "Last measured" date', () => {
    const content = fs.readFileSync(BASELINE_PATH, 'utf-8')
    const match = content.match(/\*\*Last measured:\s*(\d{4}-\d{2}-\d{2})/)
    expect(match).toBeTruthy()
    if (match) {
      const date = new Date(match[1])
      expect(date.getTime()).not.toBeNaN()
    }
  })

  it('PERFORMANCE_BASELINE.md was measured within the last 60 days', () => {
    const content = fs.readFileSync(BASELINE_PATH, 'utf-8')
    const match = content.match(/\*\*Last measured:\s*(\d{4}-\d{2}-\d{2})/)
    expect(match).toBeTruthy()
    if (match) {
      const measured = new Date(match[1])
      const now = new Date()
      const daysSince = Math.floor((now.getTime() - measured.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 60) {
        throw new Error(
          `PERFORMANCE_BASELINE.md is STALE — last measured ${match[1]} (${daysSince} days ago).\n` +
          'Re-measure baselines and update the "Last measured" date.\n' +
          'See .claude/rules/no-performance-regression.md'
        )
      }
    }
  })

  it('change log has at least one entry', () => {
    const content = fs.readFileSync(BASELINE_PATH, 'utf-8')
    // Change log entries have the format: | YYYY-MM-DD | Session N | ...
    expect(content).toMatch(/\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*\d+\s*\|/)
  })
})
