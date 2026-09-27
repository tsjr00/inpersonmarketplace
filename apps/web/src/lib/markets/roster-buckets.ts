/**
 * Manager roster buckets (owner 2026-09-27, tester OB-034, TR-107/TR-140).
 *
 * ONE rule for the Action Items count (manager-dashboard-stats.ts) and the
 * roster's chips (VendorBoothList.tsx), so the card can never say "1 pending"
 * while the list has nobody to approve:
 *
 *   pending approval  → unapproved, not removed, not invited, did not decline
 *                       — the only rows the manager can act on
 *   invited, waiting  → unapproved, not removed, response_status 'invited'
 *                       — the manager already said yes; the vendor hasn't answered
 *   neither           → approved · removed by the manager (revoked_at) ·
 *                       declined the manager's invitation
 *
 * Pure; safe to import from client components (no @/lib/errors).
 */
export interface RosterBucketRow {
  approved: boolean | null
  revoked_at: string | null
  response_status: string | null
}

export function isPendingApproval(r: RosterBucketRow): boolean {
  return r.approved !== true && !r.revoked_at && r.response_status !== 'invited' && r.response_status !== 'declined'
}

export function isInvitedAwaiting(r: RosterBucketRow): boolean {
  return r.approved !== true && !r.revoked_at && r.response_status === 'invited'
}

export function bucketRosterRows(rows: RosterBucketRow[]): { pendingApproval: number; invitedAwaiting: number } {
  return {
    pendingApproval: rows.filter(isPendingApproval).length,
    invitedAwaiting: rows.filter(isInvitedAwaiting).length,
  }
}
