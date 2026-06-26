import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'

/**
 * Phase E — fire the "season paid" notifications to the vendor + manager.
 *
 * Best-effort: ALL errors are swallowed so a notification failure can never
 * bubble up to the Stripe webhook (which would retry an already-paid group) or
 * abort the reconciliation cron. Re-queries the group so callers pass only the
 * id. Shared by webhooks.ts (handleSeasonBoothCheckoutComplete) and the
 * expire-orders Phase 18 reconciliation — single source so the two paths can't
 * drift.
 */
export async function sendSeasonPaidNotifications(
  serviceClient: SupabaseClient,
  groupId: string,
): Promise<void> {
  try {
    const { data: group } = await serviceClient
      .from('booth_booking_groups')
      .select('vendor_profile_id, market_id, week_count, total_vendor_cents, total_manager_cents')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) return

    const [vpResult, marketResult] = await Promise.all([
      serviceClient
        .from('vendor_profiles')
        .select('user_id, profile_data, vertical_id')
        .eq('id', group.vendor_profile_id as string)
        .maybeSingle(),
      serviceClient
        .from('markets')
        .select('name, manager_user_id, manager_email, vertical_id')
        .eq('id', group.market_id as string)
        .maybeSingle(),
    ])

    const vp = vpResult.data
    const market = marketResult.data
    const profileData = (vp?.profile_data || {}) as Record<string, unknown>
    const vendorName =
      (profileData.business_name as string | undefined) ||
      (profileData.farm_name as string | undefined) ||
      undefined
    const marketName = (market?.name as string | undefined) || 'the market'
    const vertical =
      (market?.vertical_id as string | undefined) ||
      (vp?.vertical_id as string | undefined) ||
      'farmers_market'
    const weekCount = (group.week_count as number) ?? 0

    let vendorEmail: string | null = null
    if (vp?.user_id) {
      const { data: authUser } = await serviceClient.auth.admin.getUserById(vp.user_id as string)
      vendorEmail = authUser?.user?.email ?? null
    }
    let managerEmail: string | null = (market?.manager_email as string | null) ?? null
    if (!managerEmail && market?.manager_user_id) {
      const { data: managerAuth } = await serviceClient.auth.admin.getUserById(
        market.manager_user_id as string,
      )
      managerEmail = managerAuth?.user?.email ?? null
    }

    if (vp?.user_id) {
      await sendNotification(
        vp.user_id as string,
        'booth_season_paid_vendor',
        {
          marketName,
          weekCount,
          amountCents: group.total_vendor_cents as number,
          marketId: group.market_id as string,
        },
        {
          vertical,
          ...(vendorEmail ? { userEmail: vendorEmail } : {}),
        },
      )
    }

    if (market?.manager_user_id) {
      await sendNotification(
        market.manager_user_id as string,
        'booth_season_paid_manager',
        {
          marketName,
          weekCount,
          managerReceivesAmountCents: group.total_manager_cents as number,
          marketId: group.market_id as string,
          ...(vendorName ? { vendorName } : {}),
        },
        {
          vertical,
          ...(managerEmail ? { userEmail: managerEmail } : {}),
        },
      )
    }
  } catch (err) {
    console.error(
      '[sendSeasonPaidNotifications] failed:',
      err instanceof Error ? err.message : 'Unknown',
    )
  }
}
