import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who should be told about something that happened in ONE vertical.
 *
 * WHY THIS EXISTS
 *
 * Three places already answer this question and all three answer it wrong, in
 * the same three ways:
 *
 *   api/vendor/events/[marketId]/respond          .in('role',[…]).limit(5)
 *   api/vendor/events/[marketId]/cancel           .in('role',[…]).limit(5)
 *   api/cron/expire-orders (event gap alert)      .or(role.eq…) — no deleted_at
 *
 *   1. NOT SCOPED BY VERTICAL. A Farmers Marketing admin is notified about Food
 *      Truck'n events and vice versa. At two verticals that is noise; at five
 *      it is a reason to stop reading admin notifications entirely.
 *   2. TRUNCATED AT AN ARBITRARY 5, with no ordering — so *which* admins hear
 *      about a time-critical event is effectively random.
 *   3. HAND-ROLLED ROLE TESTS rather than the shared helpers, which is the
 *      shape behind the "legitimate admin refused" bug in the backlog.
 *
 * Rather than copy that a fourth time for change requests — the most
 * time-critical admin notification in the app, where a missed message means an
 * organizer sits blocked before their event — this resolves the real set.
 *
 * The rule mirrors `verifyAdminScope`: platform admins see everything, vertical
 * admins see their own vertical.
 */

/**
 * User ids to notify about an event in `verticalId`.
 *
 * No limit. If there are forty admins, forty admins are meant to know — and
 * capping the list silently is how the one person who was going to act gets
 * left out. Requires a SERVICE client: it reads across users.
 */
export async function adminRecipientsForVertical(
  serviceClient: SupabaseClient,
  verticalId: string | null | undefined
): Promise<string[]> {
  const recipients = new Set<string>()

  // ── Platform admins — every vertical is theirs ──
  //
  // Both columns are read because the role/roles migration is still in
  // transition (see hasPlatformAdminRole). `roles` is an array, so `contains`
  // rather than equality.
  const [byRole, byRolesArray] = await Promise.all([
    serviceClient
      .from('user_profiles')
      .select('user_id')
      .eq('role', 'platform_admin')
      .is('deleted_at', null),
    serviceClient
      .from('user_profiles')
      .select('user_id')
      .contains('roles', ['platform_admin'])
      .is('deleted_at', null),
  ])

  for (const row of [...(byRole.data || []), ...(byRolesArray.data || [])]) {
    if (row.user_id) recipients.add(row.user_id as string)
  }

  // ── Vertical admins for THIS vertical ──
  if (verticalId) {
    const { data: verticalAdmins } = await serviceClient
      .from('vertical_admins')
      .select('user_id')
      .eq('vertical_id', verticalId)

    const candidateIds = (verticalAdmins || [])
      .map(v => v.user_id as string)
      .filter(Boolean)

    if (candidateIds.length > 0) {
      // Deleted accounts still have vertical_admins rows; do not notify them.
      const { data: alive } = await serviceClient
        .from('user_profiles')
        .select('user_id')
        .in('user_id', candidateIds)
        .is('deleted_at', null)

      for (const row of alive || []) {
        if (row.user_id) recipients.add(row.user_id as string)
      }
    }
  }

  return [...recipients]
}
