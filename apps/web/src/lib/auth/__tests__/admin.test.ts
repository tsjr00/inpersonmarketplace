import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { hasPlatformAdminRole, hasAdminRole } from '@/lib/auth/admin'

// S4-2: hasPlatformAdminRole must be STRICT — platform_admin only. A plain 'admin'
// is a VERTICAL admin; if it passed this check, verifyAdminScope's vertical branch
// would be unreachable and vertical admins would get cross-vertical scope.
describe('S4-2 hasPlatformAdminRole — platform_admin ONLY', () => {
  it('platform_admin via role column → true', () => {
    expect(hasPlatformAdminRole({ role: 'platform_admin' })).toBe(true)
  })

  it('platform_admin via roles array → true', () => {
    expect(hasPlatformAdminRole({ roles: ['buyer', 'platform_admin'] })).toBe(true)
  })

  it("plain 'admin' via role column → FALSE (vertical admin, not platform)", () => {
    expect(hasPlatformAdminRole({ role: 'admin' })).toBe(false)
  })

  it("plain 'admin' via roles array → FALSE", () => {
    expect(hasPlatformAdminRole({ roles: ['admin'] })).toBe(false)
  })

  it('non-admin → false', () => {
    expect(hasPlatformAdminRole({ role: 'buyer', roles: ['buyer'] })).toBe(false)
    expect(hasPlatformAdminRole({})).toBe(false)
  })
})

// hasAdminRole stays BROAD — any admin (vertical or platform) is "an admin" for
// gating serviceClient use / dashboard entry. Only the SCOPE differs.
describe('hasAdminRole stays broad (vertical + platform)', () => {
  it("plain 'admin' → true", () => {
    expect(hasAdminRole({ role: 'admin' })).toBe(true)
  })
  it('platform_admin → true', () => {
    expect(hasAdminRole({ role: 'platform_admin' })).toBe(true)
  })
  it('buyer → false', () => {
    expect(hasAdminRole({ role: 'buyer' })).toBe(false)
  })
})

// S4-2 (admin-management escalation): the routes that GRANT/REVOKE admin access
// (platform admins + vertical admins) must gate the platform-level decision on
// hasPlatformAdminRole, NOT hasAdminRole. Using hasAdminRole let a plain 'admin'
// (vertical admin) grant themselves cross-vertical / platform admin = escalation.
// This pins the fix so it can't silently regress via a copy-paste of the old gate.
describe('S4-2 admin-management routes gate on hasPlatformAdminRole (no escalation)', () => {
  const REPO = process.cwd() // vitest runs from apps/web
  const FILES = [
    // admin-management (Tier 1)
    'src/app/api/admin/admins/route.ts',
    'src/app/api/admin/admins/[userId]/route.ts',
    'src/app/api/admin/verticals/[verticalId]/admins/route.ts',
    'src/app/api/admin/verticals/[verticalId]/admins/[adminId]/route.ts',
    // vendor-lifecycle (Tier 2) — platform_admin bypass + hand-rolled vertical_admins fallback
    'src/app/api/admin/vendors/[id]/approve/route.ts',
    'src/app/api/admin/vendors/[id]/reject/route.ts',
    'src/app/api/admin/vendors/[id]/fast-track/route.ts',
    'src/app/api/admin/vendors/[id]/verify/route.ts',
    'src/app/api/admin/vendors/[id]/verify-coi/route.ts',
    'src/app/api/admin/vendors/[id]/verify-category/route.ts',
    'src/app/api/admin/vendors/[id]/event-approval/route.ts',
  ]
  for (const f of FILES) {
    it(`${f} uses hasPlatformAdminRole and not hasAdminRole`, () => {
      const code = readFileSync(join(REPO, f), 'utf8')
      expect(code, `${f} must gate the platform-level admin-management decision on hasPlatformAdminRole`).toContain('hasPlatformAdminRole(')
      // Check for the CALL `hasAdminRole(` — not a bare mention, so the S4-2
      // explanatory comments ("was hasAdminRole") don't false-trip this.
      expect(code.includes('hasAdminRole('), `${f} still CALLS hasAdminRole — a vertical admin could escalate (S4-2). Use hasPlatformAdminRole for the caller gate.`).toBe(false)
    })
  }
})

// S4-2 broad-lockdown coverage gate: EVERY admin mutation route (POST/PATCH/PUT/
// DELETE) must go through a sanctioned scope gate — verifyAdminScope OR
// hasPlatformAdminRole — so no route silently authorizes on bare hasAdminRole
// (any admin, no vertical scope). Routes not yet scoped are ALLOWLISTED with a
// reason; the list shrinks as the lockdown proceeds, and a NEW admin mutation
// route fails this test until it is scoped or explicitly allowlisted.
// NOTE: whole-file check — a route with mixed per-method gating that references a
// sanctioned helper anywhere passes; acceptable since routes gate all methods alike.
describe('S4-2 every admin mutation route goes through a sanctioned scope gate', () => {
  const ADMIN_DIR = join(process.cwd(), 'src/app/api/admin')
  const SANCTIONED = /verifyAdminScope|hasPlatformAdminRole/
  const MUTATION = /export async function (POST|PATCH|PUT|DELETE)/

  // Unscoped admin mutation routes still on bare hasAdminRole (or exempt). Each is
  // Tier-3 pending or genuinely platform/exempt. REMOVE an entry when the route is
  // scoped (the rot check enforces this). Path is relative to src/app/api/admin.
  const ALLOWLIST: Record<string, string> = {
    'login/route.ts': 'exempt: admin auth entry — no vertical target to scope',
    'backfill-stripe-fees/route.ts': 'Tier-3: platform-wide Stripe fee backfill (platform-only candidate)',
    'users/[id]/route.ts': 'Tier-3: user management (platform-level candidate)',
    'knowledge/route.ts': 'Tier-3: KB articles via verifyAdminForApi (per-vertical scoping TBD)',
    'errors/[id]/route.ts': 'Tier-3: error-report detail (scope by report vertical)',
    'order-issues/route.ts': 'Tier-3: order issues (scope by order vertical)',
    'events/route.ts': 'Tier-3: events list/create',
    'events/[id]/route.ts': 'Tier-3: event mgmt (scope by event vertical)',
    'events/[id]/generate-waves/route.ts': 'Tier-3: event waves (scope by event vertical)',
    'events/[id]/invite/route.ts': 'Tier-3: event invite (scope by event vertical)',
    'events/[id]/rematch/route.ts': 'Tier-3: event rematch (scope by event vertical)',
    'events/[id]/repeat/route.ts': 'Tier-3: event repeat (scope by event vertical)',
    'listings/[id]/route.ts': 'Tier-3: has dead vertical_admins fallback behind hasAdminRole — helper swap',
    'markets/route.ts': 'Tier-3: has dead vertical_admins fallback — helper swap',
    'markets/[id]/route.ts': 'Tier-3: has dead vertical_admins fallback — helper swap',
    'markets/[id]/manager/route.ts': 'Tier-3: has dead vertical_admins fallback — helper swap',
    'vendor-activity/settings/route.ts': 'Tier-3: vendor activity settings',
    'vendor-activity/flags/[id]/route.ts': 'Tier-3: vendor activity flag',
  }

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.name === 'route.ts') out.push(full)
    }
    return out
  }

  const rel = (full: string) => full.slice(ADMIN_DIR.length + 1).replace(/\\/g, '/')
  const mutationRoutes = walk(ADMIN_DIR).filter(f => MUTATION.test(readFileSync(f, 'utf8')))

  it('finds the admin mutation-route surface', () => {
    expect(mutationRoutes.length).toBeGreaterThan(25)
  })

  it('every admin mutation route is scoped or reason-allowlisted', () => {
    const unscoped: string[] = []
    for (const f of mutationRoutes) {
      const code = readFileSync(f, 'utf8')
      if (SANCTIONED.test(code)) continue
      const r = rel(f)
      if (!ALLOWLIST[r]) unscoped.push(r)
    }
    expect(unscoped, `Unscoped admin mutation route(s) — gate on verifyAdminScope/hasPlatformAdminRole, or add an ALLOWLIST reason:\n${unscoped.join('\n')}`).toEqual([])
  })

  it('ALLOWLIST has no stale entries (rot check — remove once scoped)', () => {
    const stale: string[] = []
    for (const r of Object.keys(ALLOWLIST)) {
      let code = ''
      try { code = readFileSync(join(ADMIN_DIR, r), 'utf8') } catch { stale.push(`${r} (file missing)`); continue }
      if (!MUTATION.test(code)) stale.push(`${r} (no mutation export)`)
      else if (SANCTIONED.test(code)) stale.push(`${r} (now scoped — remove from ALLOWLIST)`)
    }
    expect(stale, `Stale ALLOWLIST entries:\n${stale.join('\n')}`).toEqual([])
  })
})
