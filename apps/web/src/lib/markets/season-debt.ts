import type { SupabaseClient } from '@supabase/supabase-js'
import { getGroupCancelledDays } from '@/lib/markets/cancelled-days'
import { owedForGroup } from '@/lib/markets/settlement-math'

/**
 * Phase E — does a season still owe settlement value?
 *
 * True if ANY paid booth_booking_group in the season has cancelled days beyond
 * the refund cap (owedDays > 0). Used to decide the end-of-season transition:
 * debt → 'ended' (opens the make-up window); no debt → 'settled' directly.
 * Shared by the seasons route (manager end_season) and the expire-orders cron
 * (auto-end backstop) so both apply identical logic.
 */
export async function seasonHasOutstandingDebt(
  serviceClient: SupabaseClient,
  marketId: string,
  seasonId: string,
  refundCapDays: number,
): Promise<boolean> {
  const { data: paidGroups } = await serviceClient
    .from('booth_booking_groups')
    .select('id, week_count, total_manager_cents')
    .eq('season_id', seasonId)
    .eq('status', 'paid')
  const { count: activeDaysPerWeek } = await serviceClient
    .from('market_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('market_id', marketId)
    .eq('active', true)
  for (const g of paidGroups ?? []) {
    const cd = await getGroupCancelledDays(serviceClient, g.id as string)
    const { owedDays } = owedForGroup(
      g.total_manager_cents as number,
      g.week_count as number,
      activeDaysPerWeek ?? 0,
      cd?.cancelledDays ?? 0,
      refundCapDays,
    )
    if (owedDays > 0) return true
  }
  return false
}
