import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    'src/app/api/admin/admins/route.ts',
    'src/app/api/admin/admins/[userId]/route.ts',
    'src/app/api/admin/verticals/[verticalId]/admins/route.ts',
    'src/app/api/admin/verticals/[verticalId]/admins/[adminId]/route.ts',
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
