/**
 * Role checking helper functions
 *
 * Standardizes role checking across the codebase.
 * Checks BOTH the legacy `role` enum column AND the `roles` array column
 * for backward compatibility during transition.
 */

export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier' | 'platform_admin'

interface ProfileWithRoles {
  role?: string | null
  roles?: string[] | null
}

/**
 * Check if a profile has a specific role
 * Checks both `role` (enum) and `roles` (array) for compatibility
 */
export function hasRole(profile: ProfileWithRoles | null | undefined, role: UserRole): boolean {
  if (!profile) return false
  // Check both columns during transition
  return profile.role === role || profile.roles?.includes(role) || false
}

/**
 * Check if a profile has any of the specified roles
 */
export function hasAnyRole(profile: ProfileWithRoles | null | undefined, roles: UserRole[]): boolean {
  if (!profile) return false
  return roles.some(r => hasRole(profile, r))
}

/**
 * Check if user is an admin
 */
export function isAdmin(profile: ProfileWithRoles | null | undefined): boolean {
  return hasRole(profile, 'admin')
}

/**
 * Check if user is a buyer
 */
export function isBuyer(profile: ProfileWithRoles | null | undefined): boolean {
  return hasRole(profile, 'buyer')
}

/**
 * Check if user is a vendor
 */
export function isVendor(profile: ProfileWithRoles | null | undefined): boolean {
  return hasRole(profile, 'vendor')
}

/**
 * Check if user is a verifier
 */
export function isVerifier(profile: ProfileWithRoles | null | undefined): boolean {
  return hasRole(profile, 'verifier')
}
