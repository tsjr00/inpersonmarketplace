/**
 * ADMIN-R1: Required platform admin accounts.
 *
 * These emails MUST always have admin access in production.
 * DO NOT remove entries from this list without explicit user approval
 * documented in the decision log.
 *
 * Protected by: ADMIN-R2 (self-protection rule)
 * Test: src/lib/__tests__/admin-account-integrity.test.ts
 * Incident: Session 59 — both admin accounts were missing from prod,
 *           causing complete admin lockout with no automated detection.
 */
export const REQUIRED_ADMIN_EMAILS = [
  'jennifer@8fifteenconsulting.com',
  'tsjr00@gmail.com',
] as const

export type RequiredAdminEmail = (typeof REQUIRED_ADMIN_EMAILS)[number]
