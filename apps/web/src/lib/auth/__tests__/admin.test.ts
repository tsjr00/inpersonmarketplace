import { describe, it, expect } from 'vitest'
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
