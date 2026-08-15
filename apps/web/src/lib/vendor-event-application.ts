/**
 * Single definition of a vendor's event-application state.
 *
 * Read from profile_data.event_readiness — written by
 * api/vendor/event-readiness (sets 'pending_review' on submit; 'not_applied'
 * is its pre-apply sentinel) and synced to approved/rejected by
 * api/admin/vendors/[id]/event-approval.
 *
 * Collapsed 2026-08-15 (audit "has applied" finding): this rule was
 * hand-copied in 3 admin readers — the pending-event-applications queue API
 * and both vendor detail pages (root + [vertical]) — which agreed only by
 * luck. All three now call this.
 */
export interface EventApplicationState {
  applicationStatus: string | null
  /** Vendor ever actually applied (readiness exists with a real status). */
  hasApplied: boolean
  /** Application submitted and awaiting admin review. */
  isPendingReview: boolean
}

export function getEventApplicationState(
  profileData: Record<string, unknown> | null | undefined
): EventApplicationState {
  const er = (profileData?.event_readiness ?? null) as Record<string, unknown> | null
  const status =
    typeof er?.application_status === 'string' ? (er.application_status as string) : null
  return {
    applicationStatus: status,
    hasApplied: status !== null && status !== 'not_applied',
    isPendingReview: status === 'pending_review',
  }
}
